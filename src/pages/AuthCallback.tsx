import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { consumeGoogleSignupRole } from "@/lib/googleAuth";
import { toast } from "sonner";
import { getRoleHomePath } from "@/lib/roleNavigation";

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (cancelled) return;
      if (error || !data.session) {
        toast.error("החיבור עם Google לא הושלם. כדאי לנסות שוב.");
        navigate("/login", { replace: true });
        return;
      }

      const requestedRole = consumeGoogleSignupRole();
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.session.user.id);

      if (rolesError) {
        toast.error("החשבון חובר, אך לא הצלחנו לטעון את ההרשאות.");
        navigate("/login", { replace: true });
        return;
      }

      const currentRole = roles?.[0]?.role;
      if (currentRole) {
        navigate(getRoleHomePath(currentRole), { replace: true });
      } else {
        navigate(requestedRole ? `/register/${requestedRole}?google=1` : "/auth?google=1", { replace: true });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <main className="min-h-screen flex items-center justify-center" dir="rtl">
      <p className="text-muted-foreground">מחברים את החשבון ל־Google...</p>
    </main>
  );
};

export default AuthCallback;
