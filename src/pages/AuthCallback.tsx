import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { consumeGoogleSignupRole } from "@/lib/googleAuth";
import { toast } from "sonner";

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

      const role = consumeGoogleSignupRole();
      if (role) {
        navigate(`/register/${role}?google=1`, { replace: true });
      } else {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.session.user.id);

        navigate(roles && roles.length > 0 ? "/tasks" : "/auth?google=1", { replace: true });
      }
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
