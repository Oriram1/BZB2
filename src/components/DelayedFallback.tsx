import { useEffect, useState, type ReactNode } from "react";

/**
 * Shows its children only after `delayMs`. A load faster than that never flashes
 * a placeholder, which reads as a flicker rather than as progress.
 */
export function DelayedFallback({ children, delayMs = 300 }: { children: ReactNode; delayMs?: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);
  return show ? <>{children}</> : <div role="status" aria-label="העמוד נטען" />;
}
