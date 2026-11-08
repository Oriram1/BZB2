import { useCallback, useState } from "react";
import { readStorage, writeStorage } from "@/lib/storage";

/**
 * State that survives reloads in localStorage. When storage is refused the
 * value simply lives for the session. `parse` returns null for a stored string
 * it cannot use, which falls back to `initial`.
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
  parse: (raw: string) => T | null,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = readStorage(key);
    return raw === null ? initial : (parse(raw) ?? initial);
  });

  const update = useCallback((next: T) => {
    setValue(next);
    writeStorage(key, String(next));
  }, [key]);

  return [value, update];
}
