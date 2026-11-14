import * as React from "react";
import "@ui-sdk/web/tabs";

import { cn } from "@/lib/utils";

type UiTabsElement = HTMLElement & { value: string };

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "ui-tabs": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { class?: string };
      "ui-tabs-list": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { class?: string };
      "ui-tabs-tab": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { class?: string; value?: string };
      "ui-tabs-panel": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { class?: string; value?: string };
    }
  }
}

interface TabsProps extends Omit<React.HTMLAttributes<HTMLElement>, "onChange"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

const Tabs = React.forwardRef<HTMLElement, TabsProps>(
  ({ value, defaultValue, onValueChange, className, ...props }, ref) => {
    const innerRef = React.useRef<UiTabsElement | null>(null);
    const onChangeRef = React.useRef(onValueChange);
    onChangeRef.current = onValueChange;
    const controlled = value !== undefined;

    React.useImperativeHandle(ref, () => innerRef.current as HTMLElement);

    React.useEffect(() => {
      const el = innerRef.current;
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
      const el = innerRef.current;
      if (el && controlled && el.value !== value) el.value = value;
    });

    return (
      <ui-tabs
        ref={innerRef as React.Ref<HTMLElement>}
        {...(defaultValue && !controlled ? { "default-value": defaultValue } : {})}
        class={cn("block", className)}
        {...props}
      />
    );
  },
);
Tabs.displayName = "Tabs";

const TabsList = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <ui-tabs-list
      ref={ref}
      class={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
);
TabsList.displayName = "TabsList";

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

// ui-tabs-tab is only a wrapper: the real <button> inside keeps native behavior.
// The library marks the selected tab with data-selected; callers across the app
// still style with Radix's data-state="active", so mirror it onto the button.
const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, disabled, ...props }, ref) => {
    const buttonRef = React.useRef<HTMLButtonElement | null>(null);
    React.useImperativeHandle(ref, () => buttonRef.current as HTMLButtonElement);
    React.useEffect(() => {
      const button = buttonRef.current;
      if (!button) return;
      const sync = () => button.setAttribute("data-state", button.hasAttribute("data-selected") ? "active" : "inactive");
      sync();
      const observer = new MutationObserver(sync);
      observer.observe(button, { attributes: true, attributeFilter: ["data-selected"] });
      return () => observer.disconnect();
    }, []);
    return (
    <ui-tabs-tab value={value} class="contents" {...(disabled ? { disabled: "" } : {})}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all data-[selected]:bg-background data-[selected]:text-foreground data-[selected]:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </ui-tabs-tab>
    );
  },
);
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { value: string }>(
  ({ className, value, ...props }, ref) => (
    <ui-tabs-panel
      ref={ref}
      value={value}
      class={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    />
  ),
);
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
