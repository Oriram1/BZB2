import * as React from "react";
import "@ui-sdk/web/checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

type UiCheckboxElement = HTMLElement & { checked: boolean | "indeterminate"; disabled: boolean };

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "ui-checkbox": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { class?: string };
      "ui-checkbox-indicator": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { class?: string };
    }
  }
}

interface CheckboxProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "onChange" | "defaultChecked"> {
  checked?: boolean | "indeterminate";
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

// Same property-based wiring as Switch: React 18 sets custom-element props as strings.
const Checkbox = React.forwardRef<HTMLElement, CheckboxProps>(
  ({ className, checked, defaultChecked, disabled, onCheckedChange, ...props }, ref) => {
    const innerRef = React.useRef<UiCheckboxElement | null>(null);
    const onChangeRef = React.useRef(onCheckedChange);
    onChangeRef.current = onCheckedChange;
    const controlled = checked !== undefined;

    React.useImperativeHandle(ref, () => innerRef.current as HTMLElement);

    React.useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      const onChange = (event: Event) => {
        const { value } = (event as CustomEvent<{ value: boolean }>).detail;
        if (controlled) event.preventDefault();
        onChangeRef.current?.(value);
      };
      el.addEventListener("checkedchange", onChange);
      return () => el.removeEventListener("checkedchange", onChange);
    }, [controlled]);

    React.useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      if (controlled && el.checked !== checked) el.checked = checked;
      el.disabled = !!disabled;
    });

    return (
      <ui-checkbox
        ref={innerRef as React.Ref<HTMLElement>}
        {...(defaultChecked && !controlled ? { "default-checked": "" } : {})}
        class={cn(
          "peer inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary ring-offset-background data-[checked]:bg-primary data-[checked]:text-primary-foreground data-[indeterminate]:bg-primary data-[indeterminate]:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
          className,
        )}
        {...props}
      >
        <ui-checkbox-indicator class="flex items-center justify-center text-current [&[data-indeterminate]_.check]:hidden [&:not([data-indeterminate])_.dash]:hidden">
          <Check className="check h-4 w-4" aria-hidden="true" />
          <Minus className="dash h-4 w-4" aria-hidden="true" />
        </ui-checkbox-indicator>
      </ui-checkbox>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
