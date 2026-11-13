import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AvatarPicker } from "./AvatarPicker";

const calls = vi.hoisted(() => ({
  uploads: [] as Array<{ path: string; body: Blob; options: { contentType?: string; upsert?: boolean } }>,
  updates: [] as Array<{ values: Record<string, unknown>; userId: string }>,
  removed: [] as string[][],
  uploadError: null as null | { message: string },
  existing: [] as Array<{ name: string }>,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ refreshProfile: async () => {} }) }));
vi.mock("@/components/bee-library/BeePicker", () => ({
  default: ({ onChange }: { onChange: (id: string, src: string) => void }) => (
    <button type="button" onClick={() => onChange("bee-1", "https://cdn/bees/bee-1.png")}>bee-1</button>
  ),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async (path: string, body: Blob, options: { contentType?: string; upsert?: boolean }) => {
          calls.uploads.push({ path, body, options });
          return { data: calls.uploadError ? null : { path }, error: calls.uploadError };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/avatars/${path}` } }),
        list: async () => ({ data: calls.existing, error: null }),
        remove: async (paths: string[]) => { calls.removed.push(paths); return { data: [], error: null }; },
      }),
    },
    from: () => ({
      update: (values: Record<string, unknown>) => ({
        eq: async (_col: string, userId: string) => { calls.updates.push({ values, userId }); return { error: null }; },
      }),
    }),
  },
}));

beforeEach(() => {
  calls.uploads = []; calls.updates = []; calls.removed = []; calls.uploadError = null; calls.existing = [];
  toast.success.mockClear(); toast.error.mockClear();
});
afterEach(cleanup);

const openUploadTab = () => {
  const onAvatarChange = vi.fn();
  render(<AvatarPicker userId="user-1" currentAvatarUrl={null} onAvatarChange={onAvatarChange} />);
  fireEvent.click(screen.getByRole("button", { name: "שינוי תמונת הפרופיל" }));
  const tab = screen.getByRole("tab", { name: "העלאה" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input missing");
  return { input, onAvatarChange };
};

it("uploads a photo from the device and saves it as the avatar", async () => {
  calls.existing = [{ name: "avatar.jpg" }];
  const { input, onAvatarChange } = openUploadTab();
  const photo = new File(["jpeg-bytes"], "IMG_0001.jpg", { type: "image/jpeg" });
  fireEvent.change(input, { target: { files: [photo] } });

  await waitFor(() => expect(onAvatarChange).toHaveBeenCalled());
  expect(calls.uploads).toHaveLength(1);
  const { path, options } = calls.uploads[0];
  // A fresh file name per upload so the CDN cannot serve the old picture.
  expect(path).toMatch(/^user-1\/avatar-\d+\.jpg$/);
  expect(options.contentType).toBe("image/jpeg");
  const url = `https://cdn/avatars/${path}`;
  expect(calls.updates).toEqual([{ values: { avatar_url: url }, userId: "user-1" }]);
  expect(onAvatarChange).toHaveBeenCalledWith(url);
  expect(calls.removed).toEqual([["user-1/avatar.jpg"]]);
  expect(toast.success).toHaveBeenCalled();
});

it("accepts phone photos with no MIME type (HEIC from some pickers)", async () => {
  const { input, onAvatarChange } = openUploadTab();
  const heic = new File(["heic-bytes"], "IMG_0002.HEIC", { type: "" });
  fireEvent.change(input, { target: { files: [heic] } });

  await waitFor(() => expect(onAvatarChange).toHaveBeenCalled());
  expect(calls.uploads[0].path).toMatch(/^user-1\/avatar-\d+\.heic$/);
  expect(calls.uploads[0].options.contentType).toBe("image/heic");
});

it("rejects non-images without uploading", async () => {
  const { input } = openUploadTab();
  fireEvent.change(input, { target: { files: [new File(["x"], "notes.pdf", { type: "application/pdf" })] } });
  await waitFor(() => expect(toast.error).toHaveBeenCalled());
  expect(calls.uploads).toHaveLength(0);
  expect(calls.updates).toHaveLength(0);
});

it("reports a failed upload and leaves the profile alone, then lets the user retry", async () => {
  calls.uploadError = { message: "boom" };
  const { input } = openUploadTab();
  fireEvent.change(input, { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
  await waitFor(() => expect(toast.error).toHaveBeenCalled());
  expect(calls.updates).toHaveLength(0);
  await waitFor(() => expect(input).not.toBeDisabled());
  expect(input.value).toBe("");
});

it("still saves a bee icon as the avatar", async () => {
  const onAvatarChange = vi.fn();
  render(<AvatarPicker userId="user-1" currentAvatarUrl={null} onAvatarChange={onAvatarChange} />);
  fireEvent.click(screen.getByRole("button", { name: "שינוי תמונת הפרופיל" }));
  fireEvent.click(screen.getByRole("button", { name: "bee-1" }));
  await waitFor(() => expect(onAvatarChange).toHaveBeenCalledWith("https://cdn/bees/bee-1.png"));
  expect(calls.updates).toEqual([{ values: { avatar_url: "https://cdn/bees/bee-1.png" }, userId: "user-1" }]);
  expect(calls.uploads).toHaveLength(0);
});
