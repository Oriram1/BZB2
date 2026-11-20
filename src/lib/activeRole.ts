export type FunctionalRole = "tasker" | "bee";
export function resolveActiveRole(roles: string[], saved: string | null): FunctionalRole | null {
  if ((saved === "tasker" || saved === "bee") && roles.includes(saved)) return saved;
  if (roles.includes("bee")) return "bee";
  if (roles.includes("tasker")) return "tasker";
  return null;
}
