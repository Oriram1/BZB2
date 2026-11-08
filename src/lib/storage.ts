type Area = "local" | "session";

const areaOf = (area: Area) => (area === "local" ? localStorage : sessionStorage);

/** Browsers can refuse storage (private mode, blocked site data), so every access is guarded and callers get a plain miss. */
export function readStorage(key: string, area: Area = "local"): string | null {
  try {
    return areaOf(area).getItem(key);
  } catch {
    return null;
  }
}

/** Returns whether the value was stored. */
export function writeStorage(key: string, value: string, area: Area = "local"): boolean {
  try {
    areaOf(area).setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key: string, area: Area = "local"): void {
  try {
    areaOf(area).removeItem(key);
  } catch {
    // Nothing stored, nothing to remove.
  }
}
