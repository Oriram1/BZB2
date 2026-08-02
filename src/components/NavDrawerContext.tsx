/* eslint-disable react-refresh/only-export-components -- context hooks are intentionally colocated with their provider. */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type NavDrawerValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** True while a PageHeader is mounted, so the app skips the floating trigger. */
  hasHeader: boolean;
  setHasHeader: (present: boolean) => void;
};

const NavDrawerContext = createContext<NavDrawerValue>({
  open: false,
  setOpen: () => {},
  hasHeader: false,
  setHasHeader: () => {},
});

/**
 * Shares the desktop navigation drawer's open state, so the trigger can live
 * inside the page header while the drawer itself is rendered once at app level.
 */
export function NavDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [hasHeader, setHasHeader] = useState(false);
  return (
    <NavDrawerContext.Provider value={{ open, setOpen, hasHeader, setHasHeader }}>
      {children}
    </NavDrawerContext.Provider>
  );
}

export const useNavDrawer = () => useContext(NavDrawerContext);

/** Called by PageHeader so the floating fallback trigger stays hidden. */
export function useRegisterHeader() {
  const { setHasHeader } = useNavDrawer();
  useEffect(() => {
    setHasHeader(true);
    return () => setHasHeader(false);
  }, [setHasHeader]);
}
