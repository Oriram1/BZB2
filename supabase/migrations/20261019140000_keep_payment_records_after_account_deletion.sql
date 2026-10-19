-- Payment records outlive the account that made them.
--
-- Deleting an account used to cascade into billing_charges, payment_orders,
-- billing_refund_attempts and task_refunds, so every charge and refund the
-- company took went with the customer. The money record is ours: it stays,
-- with the link to the person cut and anything that identifies them removed.
-- What stays is what accounting needs: amount, status, dates, Cardcom deal and
-- document numbers. The saved card (payment_methods) still goes with the
-- account: the token is deleted, never kept.

-- user_id may now be empty, and deleting the user empties it instead of
-- deleting the row.
DO $$
DECLARE
  t TEXT;
  fk TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['billing_charges', 'payment_orders', 'billing_refund_attempts', 'task_refunds'] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id DROP NOT NULL', t);
    FOR fk IN
      SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       WHERE c.contype = 'f' AND c.conrelid = format('public.%I', t)::regclass
         AND c.confrelid = 'auth.users'::regclass AND a.attname = 'user_id'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, fk);
    END LOOP;
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL',
      t, t || '_user_id_fkey'
    );
  END LOOP;
END $$;

-- Just before the user row goes: strip what identifies the person from the
-- records that stay. Receipt links and task titles name them; notes in `meta`
-- may too.
CREATE OR REPLACE FUNCTION public.scrub_payment_records_on_user_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.billing_charges SET document_url = NULL, meta = NULL WHERE user_id = OLD.id;
  UPDATE public.payment_orders SET document_url = NULL WHERE user_id = OLD.id;
  UPDATE public.task_refunds SET task_name = NULL WHERE user_id = OLD.id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.scrub_payment_records_on_user_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scrub_payment_records_on_user_delete ON auth.users;
CREATE TRIGGER scrub_payment_records_on_user_delete
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.scrub_payment_records_on_user_delete();

-- Records with no owner are still visible to an admin; nobody else can read them.
CREATE POLICY "Admins read payment records" ON public.billing_charges
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins read payment orders" ON public.payment_orders
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));
