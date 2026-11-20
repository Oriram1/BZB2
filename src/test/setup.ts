import "@testing-library/jest-dom";

// jsdom does not implement Web Animations; UI SDK uses this browser API when
// components unmount. The test environment has no running animations.
if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
