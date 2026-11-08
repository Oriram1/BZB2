import { useAuth } from "@/contexts/AuthContext";

/** The signed-in account's roles as flags, so a screen does not repeat `roles.includes(...)`. */
export function useRoles() {
  const { roles } = useAuth();
  return {
    isTasker: roles.includes("tasker"),
    isBee: roles.includes("bee"),
    isAdmin: roles.includes("admin"),
  };
}
