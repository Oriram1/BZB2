import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchUserRoles } from "@/contexts/AuthContext";
import { consumeGoogleSignupRole } from "@/lib/googleAuth";
import { postAuthStep } from "@/lib/postAuth";
import { registerPath, ROUTES } from "@/lib/routes";
import { toast } from "sonner";

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (cancelled) return;
      if (error || !data.session) {
        toast.error("החיבור עם Google לא הושלם. כדאי לנסות שוב.");
        navigate(ROUTES.login, { replace: true });
        return;
      }

      const { roles } = await fetchUserRoles(data.session.user.id);
      if (cancelled) return;
      const step = postAuthStep(roles, consumeGoogleSignupRole());
      // The register screen asks before moving an account that already has another role.
      navigate(step.to ?? `${registerPath(step.switchTo)}?google=1`, { replace: true });
    });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center" dir="rtl">
      <h1 className="sr-only">התחברות עם Google</h1>
      {/* role="status" so a screen reader announces the wait instead of landing on a silent page. */}
      <p role="status" className="text-muted-foreground">מחברים את החשבון ל־Google...</p>
    </div>
  );
};

export default AuthCallback;
