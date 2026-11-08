import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { consumeGoogleSignupRole, startGoogleAuth, type GoogleSignupRole } from "@/lib/googleAuth";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { fetchUserRoles } from "@/contexts/AuthContext";
import { useRoleSwitch, roleSwitchQuestion } from "@/hooks/useRoleSwitch";
import { postAuthStep } from "@/lib/postAuth";

interface GoogleAuthButtonProps {
  role?: GoogleSignupRole;
}

const GOOGLE_FAILED = "החיבור עם Google לא הצליח. כדאי לנסות שוב.";

const GoogleAuthButton = ({ role }: GoogleAuthButtonProps) => {
  const [loading, setLoading] = useState(false);
  const [switchPrompt, setSwitchPrompt] = useState<{ current: string; target: GoogleSignupRole } | null>(null);
  const navigate = useNavigate();
  const { switching, switchTo } = useRoleSwitch();
  const startedRef = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const finishGoogleAuth = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const { roles } = await fetchUserRoles(userId);
      const step = postAuthStep(roles, role ?? null);
      consumeGoogleSignupRole();
      if (step.to === undefined) {
        setSwitchPrompt({ current: step.switchFrom, target: step.switchTo });
      } else {
        navigate(step.to, { replace: roles.length > 0 });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : GOOGLE_FAILED);
    }
    setLoading(false);
  }, [navigate, role]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!containerRef.current) return;
    setLoading(true);
    const container = containerRef.current;
    void startGoogleAuth(role, container, () => setLoading(false))
      .then((user) => finishGoogleAuth(user.id))
      .catch((error) => {
        setLoading(false);
        toast.error(error instanceof Error ? error.message : GOOGLE_FAILED);
      });
  }, [finishGoogleAuth, role]);

  return (
    <>
      <div className="relative h-16 w-full">
        <Button type="button" variant="outline" disabled={loading || switching} className="absolute inset-0 w-full rounded-2xl border-2 border-border bg-background/80 py-6 text-lg font-bold">
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-base font-extrabold text-[#4285F4] shadow-sm">G</span>
          {loading ? "מתחברים..." : "המשך עם Google"}
        </Button>
        <div ref={containerRef} className="absolute inset-0 z-10 opacity-0" aria-label="המשך עם Google" />
      </div>

      <AlertDialog open={switchPrompt !== null} onOpenChange={(open) => !open && setSwitchPrompt(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>החשבון כבר רשום</AlertDialogTitle>
            <AlertDialogDescription>
              {switchPrompt && roleSwitchQuestion(switchPrompt.current, switchPrompt.target)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>להישאר בתפקיד הנוכחי</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (switchPrompt && await switchTo(switchPrompt.target)) setSwitchPrompt(null);
              }}
            >
              כן, לעבור
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default GoogleAuthButton;
