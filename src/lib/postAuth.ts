import type { GoogleSignupRole } from "@/lib/googleAuth";
import { HOME_PATH, registerPath, ROUTES } from "@/lib/routes";

// Every key exists on both arms: the project does not compile with strict null
// checks, so a plain union would not narrow.
type PostAuthStep =
  | { to: string; switchFrom?: undefined; switchTo?: undefined }
  /** The account already has another role; ask before moving it. */
  | { to?: undefined; switchFrom: string; switchTo: GoogleSignupRole };

/**
 * Where a person goes once Google has signed them in. `requested` is the role
 * the screen they started from was for, if any.
 */
export function postAuthStep(roles: string[], requested: GoogleSignupRole | null): PostAuthStep {
  if (roles.length > 0) {
    return requested && roles[0] !== requested
      ? { switchFrom: roles[0], switchTo: requested }
      : { to: HOME_PATH };
  }
  return { to: requested ? `${registerPath(requested)}?google=1` : `${ROUTES.auth}?google=1` };
}
