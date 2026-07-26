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
          // dir="ltr" keeps Latin characters and the caret in the right order,
          // but the text is right-aligned so it reads with the rest of the
          // Hebrew form. ps-12 is the padding on the side the toggle sits on:
          // the button uses `end-1` against the RTL wrapper (= left), which is
          // the inline START of this LTR input.
          dir="ltr"
          className={cn("ps-12 text-right", className)}
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
