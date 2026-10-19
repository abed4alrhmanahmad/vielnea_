-- ---------------------------------------------------------------------------
-- 0017 — Anonymous guest live chat.
--
-- Reuses chat_threads and chat_messages; there is no second chat system and no
-- new table. A guest thread is simply one with user_id IS NULL, identified by
-- a secret the visitor holds and a stable display number.
--
--   guest_token_hash : SHA-256 of the token handed to the visitor once, at
--                      thread creation. Only the hash is stored, so the
--                      database never holds anything that grants access.
--   anonymous_number : the N in "Anonymous N". Allocated from a sequence, so
--                      two guests starting at the same instant cannot collide,
--                      and it never changes for the life of the thread.
--
-- No personal data is collected for a guest: customer_name holds the generated
-- "Anonymous N" and customer_email is empty. There is nothing to leak.
--
-- Idempotent: safe to re-run. Existing threads are untouched — they keep
-- user_id and their real identity, and both new columns stay NULL.
-- ---------------------------------------------------------------------------

ALTER TABLE public.chat_threads
  ADD COLUMN IF NOT EXISTS guest_token_hash text,
  ADD COLUMN IF NOT EXISTS anonymous_number integer;

-- Gapless-enough, race-free allocation of the display number.
CREATE SEQUENCE IF NOT EXISTS public.chat_anonymous_number_seq AS integer START 1;

-- A token identifies exactly one thread.
CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_guest_token_key
  ON public.chat_threads (guest_token_hash)
  WHERE guest_token_hash IS NOT NULL;

-- Two guests are never both "Anonymous 17".
CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_anonymous_number_key
  ON public.chat_threads (anonymous_number)
  WHERE anonymous_number IS NOT NULL;

DO $$
BEGIN
  -- A thread is either an account's or a guest's, never both and never neither.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_threads_identity_check'
  ) THEN
    ALTER TABLE public.chat_threads
      ADD CONSTRAINT chat_threads_identity_check
      CHECK (
        (user_id IS NOT NULL AND guest_token_hash IS NULL AND anonymous_number IS NULL)
        OR
        (user_id IS NULL AND guest_token_hash IS NOT NULL AND anonymous_number IS NOT NULL)
        OR
        -- Threads that predate guest chat, and threads whose account was
        -- deleted (user_id is ON DELETE SET NULL), remain valid history.
        (user_id IS NULL AND guest_token_hash IS NULL AND anonymous_number IS NULL)
      );
  END IF;
END
$$;

-- Lookup path for "continue my conversation".
CREATE INDEX IF NOT EXISTS chat_threads_guest_open_idx
  ON public.chat_threads (guest_token_hash, status)
  WHERE guest_token_hash IS NOT NULL;
