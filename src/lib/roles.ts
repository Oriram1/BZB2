export const ROLE_LABELS: Record<string, string> = {
  tasker: "מציע מטלות",
  bee: "מבצע מטלות",
  parent: "הורה",
  admin: "מנהל",
};

export const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;

/** Label of the account's main role, in the order a person identifies by. */
export const primaryRoleLabel = (roles: string[]) => {
  const main = (["tasker", "bee", "parent"] as const).find((role) => roles.includes(role));
  return main ? ROLE_LABELS[main] : "";
};

/** Every role starts on the task board; role-specific screens are one tap away in the nav. */
export const HOME_PATH = "/tasks";
