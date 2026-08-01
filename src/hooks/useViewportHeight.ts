import { useEffect } from "react";

/**
 * How much of the viewport has to disappear before we call it a keyboard.
 * iOS Safari's expanded toolbars already eat ~100px, and that must not count;
 * an on-screen keyboard takes 250px or more on every phone we care about.
 */
const KEYBOARD_THRESHOLD_PX = 200;

/**
 * Keeps the `--app-height` CSS variable in sync with the *visible* viewport.
 *
 * `100vh` is the wrong number on a phone. Mobile Safari measures it against the
 * viewport with the URL bar collapsed, so a "full height" screen is actually
 * taller than what you can see — which is exactly why the chat composer ended
 * up below the fold on an iPhone 12 and had to be scrolled to. `100dvh` fixes
 * the URL bar case, and visualViewport additionally reports the shrink caused
 * by the on-screen keyboard, which `dvh` does not.
 *
 * While the keyboard is up we mark `data-keyboard="open"` on <html>: the bottom
 * tab bar is behind the keyboard at that point, so leaving a 4rem gap reserved
 * for it would just push the message box up for nothing.
 */
export function useViewportHeight() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;

    const sync = () => {
      const height = viewport?.height ?? window.innerHeight;
      root.style.setProperty("--app-height", `${Math.round(height)}px`);
      // A keyboard swallows a big chunk of the screen; a collapsing URL bar
      // only a sliver, and that must not count as "keyboard open".
      const keyboardOpen = window.innerHeight - height > KEYBOARD_THRESHOLD_PX;
      root.dataset.keyboard = keyboardOpen ? "open" : "closed";
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
      delete root.dataset.keyboard;
    };
  }, []);
}

export default useViewportHeight;
