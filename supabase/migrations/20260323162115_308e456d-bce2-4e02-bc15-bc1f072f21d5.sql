ALTER TABLE public.dispatch_requests
  ADD CONSTRAINT fk_dispatch_submitted_by
    FOREIGN KEY (submitted_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_dispatch_reviewed_by
    FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_dispatch_work_order
    FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id) ON DELETE SET NULL;