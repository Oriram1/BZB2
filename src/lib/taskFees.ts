import { useQuery } from "@tanstack/react-query";
import { formatPrice } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import { supabase } from "@/integrations/supabase/client";

type TaskFees = { task_fee: number; insurance_fee: number; insurance_enabled: boolean };

const taskFeesQueryKey = ["task-fees"] as const;

async function fetchTaskFees(): Promise<TaskFees> {
  const { data, error } = await supabase.rpc("get_task_fees");
  if (error || !data) throw error ?? new Error("get_task_fees returned nothing");
  const raw = data as unknown as { task_fee: number | string; insurance_fee: number | string; insurance_enabled?: boolean };
  return {
    task_fee: Number(raw.task_fee),
    insurance_fee: Number(raw.insurance_fee),
    insurance_enabled: raw.insurance_enabled === true,
  };
}

/** Forget what was loaded, e.g. after an admin changes a fee. */
export const invalidateTaskFees = () => queryClient.invalidateQueries({ queryKey: taskFeesQueryKey });

/**
 * The fees as set in the admin. `null` until they load: screens must not show a
 * guessed amount in the meantime, so they render `feeText` which is empty then.
 */
export function useTaskFees(): TaskFees | null {
  const { data } = useQuery({ queryKey: taskFeesQueryKey, queryFn: fetchTaskFees, staleTime: Infinity, retry: false });
  return data ?? null;
}

/** "3 ₪", "0.10 ₪"; "" while the fee is still unknown. */
export const feeText = (amount: number | undefined) => (amount === undefined ? "" : `${formatPrice(amount)} ₪`);
