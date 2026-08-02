import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { consumeGoogleSignupRole, startGoogleAuth, type GoogleSignupRole } from "@/lib/googleAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { getRoleHomePath } from "@/lib/roleNavigation";

interface GoogleAuthButtonProps {
  role?: GoogleSignupRole;
}

const GoogleAuthButton = ({ role }: GoogleAuthButtonProps) => {
  const [loading, setLoading] = useState(false);
  const [switchPrompt, setSwitchPrompt] = useState<{ current: string; target: GoogleSignupRole } | null>(null);
  const navigate = useNavigate();
  const { refreshUserState } = useAuth();
  const startedRef = useRef(false);

  const roleLabel = (value: string) => ({ tasker: "מציע מטלות", bee: "מבצע מטלות", parent: "הורה" }[value] || value);

  const containerRef = useRef<HTMLDivElement>(null);

  const finishGoogleAuth = useCallback(async () => {
    setLoading(true);
    try {
      const { data: currentUser } = await supabase.auth.getUser();
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", currentUser.user?.id ?? "");

      if (roles && roles.length > 0) {
        const currentRole = roles[0].role;
        if (role && currentRole !== role) {
          setSwitchPrompt({ current: currentRole, target: role });
          setLoading(false);
          return;
        }
        consumeGoogleSignupRole();
        navigate(getRoleHomePath(currentRole), { replace: true });
        return;
      }

      const signupRole = consumeGoogleSignupRole();
      navigate(signupRole ? `/register/${signupRole}?google=1` : "/auth?google=1");
    } catch (error) {
      setLoading(false);
      toast.error(error instanceof Error ? error.message : "החיבור עם Google לא הצליח. כדאי לנסות שוב.");
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
      .then(() => finishGoogleAuth())
      .catch((error) => {
        setLoading(false);
        toast.error(error instanceof Error ? error.message : "החיבור עם Google לא הצליח. כדאי לנסות שוב.");
      });
  }, [finishGoogleAuth, role]);

  return (
    <>
      <div className="relative h-16 w-full">
        <Button type="button" variant="outline" disabled={loading} className="absolute inset-0 w-full rounded-2xl border-2 border-border bg-background/80 py-6 text-lg font-bold">
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
              נרשמת כ־{switchPrompt && roleLabel(switchPrompt.current)}. האם לעבור ל־{switchPrompt && roleLabel(switchPrompt.target)}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>להישאר בתפקיד הנוכחי</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!switchPrompt) return;
                setLoading(true);
                const { error } = await supabase.rpc("switch_my_role", { target_role: switchPrompt.target });
                setLoading(false);
                if (error) {
                  toast.error("לא ניתן להחליף תפקיד כרגע");
                  return;
                }
                await refreshUserState();
                const targetRole = switchPrompt.target;
                setSwitchPrompt(null);
                toast.success(`עברתם לתפקיד ${roleLabel(targetRole)}`);
                navigate(getRoleHomePath(targetRole), { replace: true });
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
