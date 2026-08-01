import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface RoleGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  allowedRoles?: string[];
}

const RoleGuard = ({ children, requireAuth = true, allowedRoles }: RoleGuardProps) => {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  /** Whether this guard has already let the page through once. */
  const admittedRef = useRef(false);

  useEffect(() => {
    if (loading) return;

    if (requireAuth && !user) {
      toast.error("יש להתחבר כדי לגשת לדף זה");
      navigate("/login", { replace: true });
      return;
    }

    if (allowedRoles && allowedRoles.length > 0 && user) {
      const hasRole = allowedRoles.some((r) => roles.includes(r));
      if (!hasRole) {
        toast.error("אין לך הרשאה לגשת לדף זה");
        navigate("/tasks", { replace: true });
      }
    }
  }, [user, roles, loading, requireAuth, allowedRoles, navigate]);

  // Returning null unmounts the page and destroys its state — the open
  // conversation, the scroll position, a half-typed message. That is the right
  // thing to do before the page has ever been shown, and the wrong thing to do
  // for a page already on screen while auth merely re-validates in the
  // background. Access is still denied below if the answer actually changed.
  const blocked =
    (loading && !admittedRef.current) ||
    (requireAuth && !user) ||
    Boolean(allowedRoles && allowedRoles.length > 0 && user && !allowedRoles.some((r) => roles.includes(r)));

  useEffect(() => {
    if (!blocked) admittedRef.current = true;
  }, [blocked]);

  if (blocked) return null;

  return <>{children}</>;
};

export default RoleGuard;
