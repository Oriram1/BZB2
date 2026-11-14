/**
 * Warm a page's code chunk the moment a finger or pointer lands on a link to it,
 * so the tap that follows opens the page without a loading gap. Only fetches
 * JavaScript: no data requests, so links that act (logout, anything that
 * changes data) are never triggered. Dynamic import() is cached by the browser,
 * so the lazy() in App.tsx reuses the same chunk.
 */
const LOADERS: Record<string, () => Promise<unknown>> = {
  "/tasks": () => import("../pages/TaskList"),
  "/my-tasks": () => import("../pages/MyTasks"),
  "/create-task": () => import("../pages/CreateTask"),
  "/chat": () => import("../pages/Chat"),
  "/profile": () => import("../pages/Profile"),
  "/pricing": () => import("../pages/Pricing"),
  "/subscription": () => import("../pages/Subscription"),
  "/settings": () => import("../pages/Settings"),
  "/help": () => import("../pages/Help"),
  "/login": () => import("../pages/Login"),
};

const seen = new Set<string>();

function prefetchFor(target: EventTarget | null) {
  if (!(target instanceof Element)) return;
  const link = target.closest("a[href]");
  if (!(link instanceof HTMLAnchorElement) || link.origin !== window.location.origin) return;
  const path = link.pathname.startsWith("/task/") ? "" : link.pathname;
  const load = LOADERS[path];
  if (!load || seen.has(path)) return;
  seen.add(path);
  void load().catch(() => seen.delete(path));
}

/** Start listening. Returns a function that stops. Skips data-saver connections. */
export function startRoutePrefetch(): () => void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return () => {};
  const onIntent = (event: Event) => prefetchFor(event.target);
  document.addEventListener("pointerover", onIntent, { passive: true });
  document.addEventListener("touchstart", onIntent, { passive: true });
  return () => {
    document.removeEventListener("pointerover", onIntent);
    document.removeEventListener("touchstart", onIntent);
  };
}
