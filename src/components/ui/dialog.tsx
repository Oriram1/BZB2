import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/** Drag further than this (px) or flick faster than FLICK (px/ms) and the dialog closes. */
const SWIPE_CLOSE_DISTANCE = 110;
const SWIPE_FLICK = 0.6;

/**
 * Touch only: pull the dialog down from its top edge to dismiss it. The drag
 * starts only when the content is scrolled to the top and the finger is not on a
 * form field, so scrolling and typing are untouched. The visible close button
 * stays, and the keyboard and Escape work as before.
 */
function useSwipeToClose(el: HTMLElement | null, closeButton: React.RefObject<HTMLButtonElement>) {
  React.useEffect(() => {
    if (!el) return;
    let startY = 0;
    let startTime = 0;
    let dy = 0;
    let active = false;

    const onStart = (event: TouchEvent) => {
      const target = event.target as HTMLElement;
      if (el.scrollTop > 0 || target.closest("input, textarea, select, [contenteditable], [data-no-swipe]")) return;
      active = true;
      dy = 0;
      startY = event.touches[0].clientY;
      startTime = event.timeStamp;
    };
    const onMove = (event: TouchEvent) => {
      if (!active) return;
      dy = event.touches[0].clientY - startY;
      if (dy <= 0) {
        el.style.translate = "";
        return;
      }
      el.style.transition = "none";
      el.style.translate = `0 ${dy}px`;
    };
    const onEnd = (event: TouchEvent) => {
      if (!active) return;
      active = false;
      const speed = dy / Math.max(1, event.timeStamp - startTime);
      el.style.transition = "translate 150ms ease-out";
      el.style.translate = "";
      if (dy > SWIPE_CLOSE_DISTANCE || (dy > 40 && speed > SWIPE_FLICK)) closeButton.current?.click();
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [el, closeButton]);
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  useSwipeToClose(node, closeRef);
  const setRefs = React.useCallback((next: HTMLDivElement | null) => {
    setNode(next);
    if (typeof ref === "function") ref(next);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = next;
  }, [ref]);
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={setRefs}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-1.5rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:w-full sm:rounded-lg max-sm:bottom-0 max-sm:top-auto max-sm:max-h-[90dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-y-0 max-sm:overflow-y-auto max-sm:rounded-t-2xl max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-sm:data-[state=closed]:slide-out-to-bottom-full max-sm:data-[state=open]:slide-in-from-bottom-full max-sm:data-[state=closed]:zoom-out-100 max-sm:data-[state=open]:zoom-in-100",
          className,
        )}
        {...props}
      >
        <span aria-hidden="true" className="pointer-events-none absolute start-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/30 sm:hidden" />
        {children}
        <DialogPrimitive.Close ref={closeRef} className="absolute end-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none" aria-label="סגירה">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-start", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-2 sm:flex-row sm:justify-start", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
