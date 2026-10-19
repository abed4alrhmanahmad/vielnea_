-- ===========================================================================
-- Live chat — customer ⇄ admin messaging
-- ---------------------------------------------------------------------------
-- Additive only: no DROP TABLE, no DELETE, no destructive column changes.
-- Safe to run repeatedly.
--
-- Two shapes are reconciled here. An earlier migration recorded in
-- schema_migrations as '0005_content_and_ops' created public.chat_threads and
-- public.chat_messages, but its .sql file is absent from this repository, so a
-- fresh database could not reproduce them. This migration therefore both:
--
--   1. CREATEs the tables IF NOT EXISTS in their full shape, so a clean
--      database gets a working chat schema from the repo alone; and
--   2. ALTERs the already-present tables additively, so the existing database
--      converges on exactly the same shape without losing anything.
--
-- Naming follows the tables that already exist (chat_threads /
-- chat_messages.thread_id) rather than introducing a parallel
-- chat_conversations table, because the existing pair was empty, unreferenced,
-- and adequate once extended. The API exposes them as "conversations".
--
-- read state is a nullable timestamptz (read_at) rather than a boolean: it
-- carries strictly more information and the API derives isRead = read_at IS NOT
-- NULL for the client contract.
--
-- Access model matches every other table: RLS enabled with no policies, so the
-- anon/authenticated Supabase keys can read nothing. All access is via the
-- Express API, which connects as a privileged role that bypasses RLS.
--
-- Real-time delivery is sourced from the database: an AFTER INSERT trigger on
-- chat_messages issues pg_notify() on the 'vielinea_chat' channel. The API
-- holds a LISTEN connection and fans events out over SSE. See src/lib/chat-bus.ts.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- chat_threads — one conversation between a customer and the support desk
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_threads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES public.users (id) ON DELETE SET NULL,
  customer_name   text NOT NULL,
  customer_email  text NOT NULL,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Denormalised recency so the admin list can order threads without aggregating
-- messages on every request. Backfilled below and maintained by trigger.
ALTER TABLE public.chat_threads
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

UPDATE public.chat_threads t
   SET last_message_at = COALESCE(
         (SELECT max(m.created_at) FROM public.chat_messages m WHERE m.thread_id = t.id),
         t.created_at)
 WHERE t.last_message_at IS NULL;

ALTER TABLE public.chat_threads
  ALTER COLUMN last_message_at SET DEFAULT now();

-- A customer has at most one open thread, so "continue my conversation" after a
-- page refresh resolves to exactly one row. Closed threads remain as history.
CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_one_open_per_user
  ON public.chat_threads (user_id)
  WHERE status = 'open' AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_threads_user_idx
  ON public.chat_threads (user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS chat_threads_recent_idx
  ON public.chat_threads (last_message_at DESC);

DROP TRIGGER IF EXISTS chat_threads_set_updated_at ON public.chat_threads;
CREATE TRIGGER chat_threads_set_updated_at
  BEFORE UPDATE ON public.chat_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- chat_messages
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid NOT NULL REFERENCES public.chat_threads (id) ON DELETE CASCADE,
  sender      text NOT NULL CHECK (sender IN ('customer', 'admin')),
  body        text NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Which account actually sent it. Nullable with ON DELETE SET NULL so removing
-- a staff account never destroys a customer's transcript.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS sender_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_sender_id_fkey'
  ) THEN
    ALTER TABLE public.chat_messages
      ADD CONSTRAINT chat_messages_sender_id_fkey
      FOREIGN KEY (sender_id) REFERENCES public.users (id) ON DELETE SET NULL;
  END IF;
END $$;

-- Reject empty/whitespace-only messages at the database level too.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_body_not_blank'
  ) THEN
    ALTER TABLE public.chat_messages
      ADD CONSTRAINT chat_messages_body_not_blank
      CHECK (length(btrim(body)) > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS chat_messages_thread_idx
  ON public.chat_messages (thread_id, created_at);

-- Serves the unread badges: unread messages in a thread, from one side.
-- Partial, because read messages are never counted.
CREATE INDEX IF NOT EXISTS chat_messages_unread_idx
  ON public.chat_messages (thread_id, sender)
  WHERE read_at IS NULL;

-- --------------------------------------------------------------------------
-- Keep the thread's recency column in step with its messages
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_touch_thread()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.chat_threads
     SET last_message_at = NEW.created_at,
         updated_at      = now()
   WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_touch_thread ON public.chat_messages;
CREATE TRIGGER chat_messages_touch_thread
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_touch_thread();

-- --------------------------------------------------------------------------
-- Real-time fan-out source
-- ---------------------------------------------------------------------------
-- Emits each new message on the 'vielinea_chat' channel. The owning customer
-- is resolved here so the API can route the event without an extra query.
--
-- pg_notify payloads are capped at 8000 bytes; message bodies are capped at
-- 2000 characters by the API's Zod schema, so the JSON stays well inside it.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_notify_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owner_id uuid;
BEGIN
  SELECT user_id INTO owner_id
    FROM public.chat_threads
   WHERE id = NEW.thread_id;

  PERFORM pg_notify(
    'vielinea_chat',
    json_build_object(
      'type',       'message',
      'id',         NEW.id,
      'threadId',   NEW.thread_id,
      'ownerId',    owner_id,
      'senderId',   NEW.sender_id,
      'sender',     NEW.sender,
      'body',       NEW.body,
      'readAt',     NEW.read_at,
      'createdAt',  to_char(NEW.created_at AT TIME ZONE 'UTC',
                            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_notify ON public.chat_messages;
CREATE TRIGGER chat_messages_notify
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_notify_message();

-- --------------------------------------------------------------------------
-- Row Level Security: deny-by-default, consistent with every other table.
-- --------------------------------------------------------------------------
ALTER TABLE public.chat_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
