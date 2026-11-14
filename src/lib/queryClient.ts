import { QueryClient } from "@tanstack/react-query";

/** Shared so code outside React (admin saves) can invalidate what screens cached. */
export const queryClient = new QueryClient({
  defaultOptions: {
    // Show what a screen already fetched while a fresh copy loads behind it, and
    // do not refetch on every tab focus. Money and availability queries set their
    // own staleTime/gcTime or do not use this cache at all.
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});
