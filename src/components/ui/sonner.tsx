/* eslint-disable react-refresh/only-export-components -- toast options are intentionally exported with the toaster. */
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// The app is light-only and has no ThemeProvider. Following the OS theme here
// would render dark toasts over a light UI.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      dir="rtl"
      // font-heebo: sonner ships its own system-font stack on the toaster root,
      // so without this toasts would be the one thing on the site not in Heebo.
      className="toaster group font-heebo"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
