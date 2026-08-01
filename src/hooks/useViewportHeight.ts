import { useEffect } from "react";

/**
 * How much of the viewport has to disappear before we call it a keyboard.
 * iOS Safari's expanded toolbars already eat ~100px, and that must not count;
 * an on-screen keyboard takes 250px or more on every phone we care about.
 */
const KEYBOARD_THRESHOLD_PX = 200;

/**
 * Keeps `--app-height` and `--app-offset` in sync with the *visible* viewport.
 *
 * `100vh` is the wrong number on a phone. Mobile Safari measures it against the
 * viewport with the URL bar collapsed, so a "full height" screen is actually
 * taller than what you can see — which is exactly why the chat composer ended
 * up below the fold on an iPhone 12 and had to be scrolled to. `100dvh` fixes
 * the URL bar case, and visualViewport additionally reports the shrink caused
 * by the on-screen keyboard, which `dvh` does not.
 *
 * Two things measured on an iPhone (iOS 26, Safari) drive the rest:
 *
 * 1. Opening the keyboard shrinks `window.innerHeight` too (699 -> 380), so
 *    comparing it against the visual viewport reports a difference of zero and
 *    misses the keyboard entirely. The baseline is therefore the tallest
 *    viewport seen so far, which a keyboard cannot inflate.
 * 2. iOS scrolls the document to reveal the focused field (`scrollY` 0 -> 319)
 *    and leaves it there. A screen anchored at the document's top then sits
 *    completely above the visible area — the reported symptom of a blank chat
 *    with the composer nowhere to be found. `--app-offset` mirrors the visual
 *    viewport's offset so the screen can pin itself to what the user can see.
 *
 * While the keyboard is up we mark `data-keyboard="open"` on <html>: the bottom
 * tab bar is behind the keyboard at that point, so leaving a 4rem gap reserved
 * for it would just push the message box up for nothing.
 */
export function useViewportHeight() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;

    /** Tallest viewport seen at the current width, i.e. the keyboard-free height. */
    let maxHeight = 0;
    let widthAtMax = 0;

    const sync = () => {
      const height = viewport?.height ?? window.innerHeight;
      const width = viewport?.width ?? window.innerWidth;

      // A rotation changes what "full height" means, so the baseline restarts.
      if (width !== widthAtMax) {
        widthAtMax = width;
        maxHeight = 0;
      }
      maxHeight = Math.max(maxHeight, height, window.innerHeight);

      root.style.setProperty("--app-height", `${Math.round(height)}px`);
      root.style.setProperty("--app-offset", `${Math.round(viewport?.offsetTop ?? 0)}px`);
      // A keyboard swallows a big chunk of the screen; a collapsing URL bar
      // only a sliver, and that must not count as "keyboard open".
      root.dataset.keyboard = maxHeight - height > KEYBOARD_THRESHOLD_PX ? "open" : "closed";
    };

    sync();
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    window.addEventListener("orientationchange", sync);
    window.addEventListener("resize", sync);

    return () => {
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      window.removeEventListener("orientationchange", sync);
      window.removeEventListener("resize", sync);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-offset");
      delete root.dataset.keyboard;
    };
  }, []);
}

export default useViewportHeight;
