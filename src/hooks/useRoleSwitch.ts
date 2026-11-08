import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { roleLabel } from "@/lib/roles";
import { switchMyRole } from "@/lib/roleSwitch";
import { HOME_PATH, type AppRole } from "@/lib/routes";

/** The question both places that offer a role change put to the person. */
export const roleSwitchQuestion = (current: string, target: string) =>
  `החשבון הזה רשום כ־${roleLabel(current)}. האם לעבור ל־${roleLabel(target)}?`;

/** Moves the signed-in account to `target`, then takes it home. Returns whether the role changed. */
export function useRoleSwitch() {
  const navigate = useNavigate();
  const { user, refreshUserState } = useAuth();
  const [switching, setSwitching] = useState(false);

  const switchTo = async (target: AppRole) => {
    setSwitching(true);
    const switched = await switchMyRole(target, user?.id);
    setSwitching(false);
    if (!switched) return false;
    await refreshUserState();
    toast.success(`עברתם לתפקיד ${roleLabel(target)}`);
    navigate(HOME_PATH, { replace: true });
    return true;
  };

  return { switching, switchTo };
}
