import * as React from "react";
import "@ui-sdk/web/select";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type WcProps = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
  class?: string;
  [attr: string]: unknown;
};

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "ui-select": WcProps;
      "ui-select-trigger": WcProps;
      "ui-select-value": WcProps;
      "ui-select-content": WcProps;
      "ui-select-item": WcProps;
      "ui-select-item-text": WcProps;
      "ui-select-item-indicator": WcProps;
    }
  }
}

type UiSelectElement = HTMLElement & { value: string; disabled: boolean };

interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  dir?: "rtl" | "ltr";
  children?: React.ReactNode;
}

// Same property-based wiring as Switch: React 18 sets custom-element props as strings.
const Select = ({ value, defaultValue, onValueChange, disabled, dir = "rtl", children }: SelectProps) => {
  const ref = React.useRef<UiSelectElement | null>(null);
  const onChangeRef = React.useRef(onValueChange);
  onChangeRef.current = onValueChange;
  const controlled = value !== undefined;

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ value: string }>).detail;
      if (controlled) event.preventDefault();
      onChangeRef.current?.(detail.value);
    };
    el.addEventListener("valuechange", onChange);
    return () => el.removeEventListener("valuechange", onChange);
  }, [controlled]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (controlled && el.value !== value) el.value = value;
    el.disabled = !!disabled;
  });

  return (
    <ui-select
      ref={ref as React.Ref<HTMLElement>}
      dir={dir}
      {...(defaultValue !== undefined && !controlled ? { "default-value": defaultValue } : {})}
    >
      {children}
    </ui-select>
  );
};

const SelectValue = ({ placeholder }: { placeholder?: string }) => (
  <ui-select-value {...(placeholder ? { placeholder } : {})} />
);

const SelectTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, ...props }, ref) => (
    <ui-select-trigger class="contents">
      <button
        ref={ref}
        type="button"
        dir="rtl"
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-right [&>ui-select-value]:line-clamp-1",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ms-2" aria-hidden="true" />
      </button>
    </ui-select-trigger>
  ),
);
SelectTrigger.displayName = "SelectTrigger";

// keep-mounted: the trigger needs the items to look up the selected label before the list opens.
const SelectContent = ({ className, children }: { className?: string; children?: React.ReactNode }) => (
  <ui-select-content
    keep-mounted=""
    dir="rtl"
    class={cn(
      "z-50 max-h-96 min-w-[max(8rem,var(--anchor-width))] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md text-right",
      className,
    )}
  >
    {children}
  </ui-select-content>
);

const SelectItem = React.forwardRef<
  HTMLElement,
  { value: string; disabled?: boolean; className?: string; children?: React.ReactNode }
>(({ className, children, value, disabled }, ref) => (
  <ui-select-item
    ref={ref}
    value={value}
    {...(disabled ? { disabled: "" } : {})}
    class={cn(
      "relative flex w-full cursor-default select-none items-center justify-between rounded-sm py-2 px-3 text-right text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
      className,
    )}
  >
    <ui-select-item-text>{children}</ui-select-item-text>
    <ui-select-item-indicator class="shrink-0 ms-2">
      <Check className="h-4 w-4" aria-hidden="true" />
    </ui-select-item-indicator>
  </ui-select-item>
));
SelectItem.displayName = "SelectItem";

export { Select, SelectValue, SelectTrigger, SelectContent, SelectItem };
