import { isStrongPassword, passwordRequirementsMessage } from "@/lib/password";

type PasswordStrengthProps = { password: string };

export const PasswordStrength = ({ password }: PasswordStrengthProps) => {
  const score = [
    password.length >= 6,
    /[A-Za-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9\s]/.test(password),
  ].filter(Boolean).length;
  const valid = isStrongPassword(password);

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1.5" dir="rtl" aria-live="polite">
      <div className="flex gap-1.5" aria-label={`חוזק סיסמה: ${score} מתוך 4`}>
        {[0, 1, 2, 3].map((segment) => (
          <div
            key={segment}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              segment < score ? (valid ? "bg-emerald-500" : "bg-amber-400") : "bg-muted"
            }`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${valid ? "text-emerald-600" : "text-muted-foreground"}`}>
        {valid ? "סיסמה תקינה ✓" : passwordRequirementsMessage}
      </p>
    </div>
  );
};
