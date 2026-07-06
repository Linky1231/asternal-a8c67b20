
-- ===== BANNED EMAILS =====
CREATE TABLE public.banned_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  reason text,
  banned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.banned_emails TO authenticated;
GRANT ALL ON public.banned_emails TO service_role;
ALTER TABLE public.banned_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mods view banned emails" ON public.banned_emails FOR SELECT TO authenticated USING (public.is_mod_or_admin(auth.uid()));
CREATE POLICY "mods add banned emails" ON public.banned_emails FOR INSERT TO authenticated WITH CHECK (public.is_mod_or_admin(auth.uid()));
CREATE POLICY "mods remove banned emails" ON public.banned_emails FOR DELETE TO authenticated USING (public.is_mod_or_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.reject_banned_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND EXISTS (SELECT 1 FROM public.banned_emails WHERE lower(email) = lower(NEW.email)) THEN
    RAISE EXCEPTION 'Este correo electrónico ha sido baneado por moderación';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS reject_banned_email_trigger ON auth.users;
CREATE TRIGGER reject_banned_email_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.reject_banned_email();

-- ===== CHATS =====
DO $$ BEGIN
  CREATE TYPE public.chat_type AS ENUM ('direct','group');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.chat_member_status AS ENUM ('pending','active','left');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.chat_type NOT NULL DEFAULT 'group',
  name text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chats TO authenticated;
GRANT ALL ON public.chats TO service_role;

CREATE TABLE public.chat_members (
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.chat_member_status NOT NULL DEFAULT 'active',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_admin boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_members TO authenticated;
GRANT ALL ON public.chat_members TO service_role;

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text,
  sticker_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

CREATE INDEX chat_members_user_idx ON public.chat_members(user_id, status);
CREATE INDEX chat_messages_chat_idx ON public.chat_messages(chat_id, created_at DESC);

-- Security-definer helpers to avoid recursion
CREATE OR REPLACE FUNCTION public.is_chat_participant(_chat uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_members WHERE chat_id = _chat AND user_id = _user);
$$;

CREATE OR REPLACE FUNCTION public.is_chat_active_member(_chat uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_members WHERE chat_id = _chat AND user_id = _user AND status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.is_chat_creator(_chat uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chats WHERE id = _chat AND created_by = _user);
$$;

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants view chat" ON public.chats FOR SELECT TO authenticated USING (public.is_chat_participant(id, auth.uid()));
CREATE POLICY "any auth creates chat" ON public.chats FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "creator updates chat" ON public.chats FOR UPDATE TO authenticated USING (created_by = auth.uid());
CREATE POLICY "creator deletes chat" ON public.chats FOR DELETE TO authenticated USING (created_by = auth.uid());

CREATE POLICY "see own membership or shared chat" ON public.chat_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_active_member(chat_id, auth.uid()));
CREATE POLICY "invite or self join" ON public.chat_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_chat_creator(chat_id, auth.uid())
    OR public.is_chat_active_member(chat_id, auth.uid())
  );
CREATE POLICY "update own membership" ON public.chat_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "leave or creator removes" ON public.chat_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_creator(chat_id, auth.uid()));

CREATE POLICY "members read messages" ON public.chat_messages FOR SELECT TO authenticated
  USING (public.is_chat_active_member(chat_id, auth.uid()));
CREATE POLICY "members send messages" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.is_chat_active_member(chat_id, auth.uid()));
CREATE POLICY "author deletes own message" ON public.chat_messages FOR DELETE TO authenticated
  USING (author_id = auth.uid());

CREATE OR REPLACE FUNCTION public.bump_chat_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.chats SET updated_at = now() WHERE id = NEW.chat_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER bump_chat_updated_at_trg AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.bump_chat_updated_at();

-- ===== STICKERS =====
CREATE TABLE public.stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.stickers TO authenticated;
GRANT ALL ON public.stickers TO service_role;
ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "see default or own stickers" ON public.stickers FOR SELECT TO authenticated
  USING (is_default OR owner_id = auth.uid());
CREATE POLICY "insert own sticker" ON public.stickers FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND is_default = false);
CREATE POLICY "delete own sticker" ON public.stickers FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- 12 default emoji-based stickers as inline SVG data-URLs
INSERT INTO public.stickers (owner_id, url, is_default, name) VALUES
  (NULL, 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>😀</text></svg>', true, 'smile'),
  (NULL, 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>😂</text></svg>', true, 'joy'),
  (NULL, 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>❤️</text></svg>', true, 'heart'),
  (NULL, 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔥</text></svg>', true, 'fire'),
  (NULL, 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>👍</text></svg>', true, 'thumbs'),
  (NULL, 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎮</text></svg>', true, 'gamepad'),
  (NULL, 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎉</text></svg>', true, 'party'),
  (NULL, 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚀</text></svg>', true, 'rocket'),
  (NULL, 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>😎</text></svg>', true, 'cool'),
  (NULL, 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🤖</text></svg>', true, 'robot'),
  (NULL, 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>👾</text></svg>', true, 'alien'),
  (NULL, 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💀</text></svg>', true, 'skull');
