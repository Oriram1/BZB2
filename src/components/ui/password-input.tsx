import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type">;

/**
 * Password field with a show/hide toggle, so a user can check what they typed.
 *
 * The toggle sits at the inline end of the field (left in Hebrew) and is a real
 * focusable button with a Hebrew label, not a decorative icon. Toggling does not
 * move focus out of the field.
 */
const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          // Passwords are effectively LTR strings; typing them in an RTL field
          // puts the caret on the wrong side. pe-12 leaves room for the toggle.
          dir="ltr"
          className={cn("pe-12", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
          aria-pressed={visible}
          className="absolute end-1 top-1/2 -translate-y-1/2 flex items-center justify-center h-10 w-10 rounded-lg text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    );
  },
);

PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
