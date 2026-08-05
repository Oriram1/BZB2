import { useState } from "react";
import { Button } from "@/components/ui/button";
import { startGoogleAuth, type GoogleSignupRole } from "@/lib/googleAuth";
import { toast } from "sonner";

interface GoogleAuthButtonProps {
  role?: GoogleSignupRole;
}

const GoogleAuthButton = ({ role }: GoogleAuthButtonProps) => {
  const [loading, setLoading] = useState(false);

  const handleGoogleAuth = async () => {
    setLoading(true);
    try {
      await startGoogleAuth(role);
    } catch (error) {
      setLoading(false);
      toast.error(error instanceof Error ? error.message : "החיבור עם Google לא הצליח. כדאי לנסות שוב.");
    }
  };

  return (
    <div className="h-16 w-full">
        <Button type="button" variant="outline" disabled={loading} onClick={handleGoogleAuth} className="h-full w-full rounded-2xl border-2 border-border bg-background/80 py-6 text-lg font-bold">
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-base font-extrabold text-[#4285F4] shadow-sm">G</span>
          {loading ? "מתחברים..." : "המשך עם Google"}
        </Button>
    </div>
  );
};

export default GoogleAuthButton;
