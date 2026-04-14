import { useEffect } from "react";
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

  if (loading) return null;
  if (requireAuth && !user) return null;
  if (allowedRoles && allowedRoles.length > 0 && user && !allowedRoles.some((r) => roles.includes(r))) return null;

  return <>{children}</>;
};

export default RoleGuard;
