import * as React from "react";
import "@ui-sdk/web/switch";

import { cn } from "@/lib/utils";

type UiSwitchElement = HTMLElement & { checked: boolean; disabled: boolean };

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "ui-switch": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { class?: string };
      "ui-switch-thumb": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { class?: string };
    }
  }
}

interface SwitchProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "onChange" | "defaultChecked"> {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

// React 18 sets custom-element props as string attributes (disabled={false} would
// still land as the attribute), so state goes through element properties instead.
const Switch = React.forwardRef<HTMLElement, SwitchProps>(
  ({ className, checked, defaultChecked, disabled, onCheckedChange, ...props }, ref) => {
    const innerRef = React.useRef<UiSwitchElement | null>(null);
    const onChangeRef = React.useRef(onCheckedChange);
    onChangeRef.current = onCheckedChange;
    const controlled = checked !== undefined;

    React.useImperativeHandle(ref, () => innerRef.current as HTMLElement);

    React.useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      const onChange = (event: Event) => {
        const { value } = (event as CustomEvent<{ value: boolean }>).detail;
        // Controlled: the parent decides, so block the element's own flip.
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
      <ui-switch
        ref={innerRef as React.Ref<HTMLElement>}
        {...(defaultChecked && !controlled ? { "default-checked": "" } : {})}
        class={cn(
          "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors data-[checked]:bg-primary data-[unchecked]:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
          className,
        )}
        {...props}
        dir="ltr"
      >
        <ui-switch-thumb class="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[checked]:translate-x-5 data-[unchecked]:translate-x-0" />
      </ui-switch>
    );
  },
);
Switch.displayName = "Switch";

export { Switch };
