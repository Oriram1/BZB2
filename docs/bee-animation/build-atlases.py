"""Build the assistant atlases. Requires Pillow, numpy and opencv-python."""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[1] / "src/assets/assistant"
CELL = 192
Y, X = np.mgrid[:CELL, :CELL].astype(np.float32)


def key_pose(pose):
    rgb = np.asarray(pose, dtype=np.float32) / 255
    red, green, blue = rgb.transpose(2, 0, 1)
    # The generated green varies slightly. Key by green dominance.
    spill = np.maximum(green - np.maximum(red, blue), 0)
    alpha = np.clip(1 - spill / 0.78, 0, 1)
    green[:] -= spill
    rgba = np.dstack((rgb * alpha[..., None], alpha))
    return cv2.resize(rgba, (CELL, CELL), interpolation=cv2.INTER_AREA)


def grayscale(pose):
    composite = pose[..., :3] + (1 - pose[..., 3:]) * 0.5
    return cv2.cvtColor(np.uint8(composite * 255), cv2.COLOR_RGB2GRAY)


def warp(pose, flow, amount):
    x, y = X, Y
    for _ in range(5):
        delta = cv2.remap(flow, x, y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        x, y = X - amount * delta[..., 0], Y - amount * delta[..., 1]
    return cv2.remap(pose, x, y, cv2.INTER_LINEAR)


def build(state):
    sheet = Image.open(HERE / "source" / f"{state}-keyframes.png").convert("RGB")
    if sheet.size != (1536, 1024):
        raise ValueError(f"Unexpected sheet size for {state}: {sheet.size}")
    # Keep the shared cell origin so intentional hover offsets survive.
    poses = [key_pose(sheet.crop((x, y, x + 512, y + 512)))
             for y in (0, 512) for x in (0, 512, 1024)]
    atlas = Image.new("RGBA", (6 * CELL, 6 * CELL))
    for row, first in enumerate(poses):
        second = poses[(row + 1) % len(poses)]
        a, b = grayscale(first), grayscale(second)
        forward = cv2.calcOpticalFlowFarneback(a, b, None, 0.5, 4, 21, 4, 7, 1.5, 0)
        backward = cv2.calcOpticalFlowFarneback(b, a, None, 0.5, 4, 21, 4, 7, 1.5, 0)
        for column in range(6):
            t = column / 6
            frame = (1 - t) * warp(first, forward, t) + t * warp(second, backward, 1 - t)
            alpha = frame[..., 3:]
            rgb = np.divide(frame[..., :3], alpha, out=np.zeros_like(frame[..., :3]), where=alpha > 0)
            pixels = np.uint8(np.clip(np.concatenate((rgb, alpha), axis=2), 0, 1) * 255)
            atlas.paste(Image.fromarray(pixels), (column * CELL, row * CELL))
    atlas.save(OUT / f"bee-{state}.webp", quality=86, method=6)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for state in ("idle", "thinking"):
        build(state)
