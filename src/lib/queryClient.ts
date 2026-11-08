import { QueryClient } from "@tanstack/react-query";

/** Shared so code outside React (admin saves) can invalidate what screens cached. */
export const queryClient = new QueryClient();
