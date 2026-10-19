import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/billing";

export type TaskFees = { task_fee: number; insurance_fee: number };

let cache: TaskFees | null = null;
let request: Promise<TaskFees | null> | null = null;

const load = () => {
  request ??= (async () => {
    const { data, error } = await supabase.rpc("get_task_fees");
    if (error || !data) {
      request = null;
      return null;
    }
    const raw = data as unknown as { task_fee: number | string; insurance_fee: number | string };
    cache = { task_fee: Number(raw.task_fee), insurance_fee: Number(raw.insurance_fee) };
    return cache;
  })();
  return request;
};

/** Forget what was loaded, e.g. after an admin changes a fee. */
export const invalidateTaskFees = () => {
  cache = null;
  request = null;
};

/**
 * The fees as set in the admin. `null` until they load: screens must not show a
 * guessed amount in the meantime, so they render `feeText` which is empty then.
 */
export function useTaskFees() {
  const [fees, setFees] = useState<TaskFees | null>(cache);
  useEffect(() => {
    let active = true;
    void load().then((value) => {
      if (active && value) setFees(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return fees;
}

/** "3 ₪", "0.10 ₪"; "" while the fee is still unknown. */
export const feeText = (amount: number | undefined) => (amount === undefined ? "" : `${formatPrice(amount)} ₪`);
