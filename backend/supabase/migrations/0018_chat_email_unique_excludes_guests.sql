-- ---------------------------------------------------------------------------
-- 0018 — Let the customer-email uniqueness rule ignore guest threads.
--
-- chat_threads carried a global UNIQUE index on lower(customer_email), which
-- allows one thread per email address. Guests have no email — nothing is
-- collected from them — so every guest thread stores '' and the second guest
-- would collide with the first.
--
-- The rule is narrowed, not removed: account threads keep exactly the
-- uniqueness they had, and only guest rows (anonymous_number IS NOT NULL) are
-- exempt. No data is touched.
--
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.chat_threads_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_email_key
  ON public.chat_threads (lower(customer_email))
  WHERE anonymous_number IS NULL;
