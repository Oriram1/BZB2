CREATE OR REPLACE FUNCTION public.notify_review_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE task_name text;
BEGIN
  SELECT name INTO task_name FROM public.tasks WHERE id = NEW.task_id;
  PERFORM public.enqueue_notification(
    NEW.reviewee_id, 'review_approved',
    jsonb_build_object('review_id', NEW.id, 'task_id', NEW.task_id, 'task_name', task_name, 'rating', NEW.rating),
    '/profile'
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_review_approved() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER review_approved_notification
  AFTER UPDATE OF status ON public.reviews
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved')
  EXECUTE FUNCTION public.notify_review_approved();
