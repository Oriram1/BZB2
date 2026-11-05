import { createContext, useContext, useState, type ReactNode } from "react";

const PermissionPromptContext = createContext<{ pushPending: boolean; setPushPending: (pending: boolean) => void }>({
  pushPending: true,
  setPushPending: () => {},
});

export function PermissionPromptProvider({ children }: { children: ReactNode }) {
  const [pushPending, setPushPending] = useState(true);
  return <PermissionPromptContext.Provider value={{ pushPending, setPushPending }}>{children}</PermissionPromptContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const usePermissionPrompt = () => useContext(PermissionPromptContext);
