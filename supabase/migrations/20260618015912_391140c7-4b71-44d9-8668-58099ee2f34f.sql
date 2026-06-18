
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
CREATE TYPE public.post_media_type AS ENUM ('none', 'image', 'video', 'link');
CREATE TYPE public.reaction_type AS ENUM ('like', 'favorite');
CREATE TYPE public.report_status AS ENUM ('open', 'reviewed', 'dismissed', 'actioned');
CREATE TYPE public.notification_type AS ENUM ('comment', 'reply', 'reaction', 'repost', 'mention');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles read all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles insert self" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles update self" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles read self" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_mod_or_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('moderator','admin'))
$$;

-- ============ AUTO-CREATE PROFILE ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INT := 0;
BEGIN
  base_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1),
    'user'
  );
  base_username := regexp_replace(lower(base_username), '[^a-z0-9_]+', '', 'g');
  IF length(base_username) < 3 THEN base_username := 'user' || base_username; END IF;
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := base_username || counter::TEXT;
  END LOOP;
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, final_username, COALESCE(NEW.raw_user_meta_data->>'display_name', final_username));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ POSTS ============
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  media_type post_media_type NOT NULL DEFAULT 'none',
  link_url TEXT,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX posts_created_idx ON public.posts (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX posts_author_idx ON public.posts (author_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT SELECT ON public.posts TO anon;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts read all" ON public.posts FOR SELECT USING (deleted_at IS NULL OR auth.uid() = author_id OR public.is_mod_or_admin(auth.uid()));
CREATE POLICY "posts insert own" ON public.posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "posts update own" ON public.posts FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "posts delete own or mod" ON public.posts FOR DELETE USING (auth.uid() = author_id OR public.is_mod_or_admin(auth.uid()));

-- ============ TAGS ============
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.tags TO authenticated;
GRANT SELECT ON public.tags TO anon;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags read all" ON public.tags FOR SELECT USING (true);
CREATE POLICY "tags insert auth" ON public.tags FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE public.post_tags (
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
GRANT SELECT, INSERT, DELETE ON public.post_tags TO authenticated;
GRANT SELECT ON public.post_tags TO anon;
GRANT ALL ON public.post_tags TO service_role;
ALTER TABLE public.post_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "post_tags read all" ON public.post_tags FOR SELECT USING (true);
CREATE POLICY "post_tags insert by post owner" ON public.post_tags FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.author_id = auth.uid()));
CREATE POLICY "post_tags delete by post owner" ON public.post_tags FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.author_id = auth.uid()));

-- ============ COMMENTS ============
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX comments_post_idx ON public.comments (post_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT SELECT ON public.comments TO anon;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments read all" ON public.comments FOR SELECT USING (true);
CREATE POLICY "comments insert own" ON public.comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "comments update own" ON public.comments FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "comments delete own or mod" ON public.comments FOR DELETE USING (auth.uid() = author_id OR public.is_mod_or_admin(auth.uid()));

-- ============ REACTIONS ============
CREATE TABLE public.reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  type reaction_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int = 1),
  UNIQUE (user_id, post_id, type),
  UNIQUE (user_id, comment_id, type)
);
CREATE INDEX reactions_post_idx ON public.reactions (post_id);
CREATE INDEX reactions_comment_idx ON public.reactions (comment_id);
GRANT SELECT, INSERT, DELETE ON public.reactions TO authenticated;
GRANT SELECT ON public.reactions TO anon;
GRANT ALL ON public.reactions TO service_role;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reactions read all" ON public.reactions FOR SELECT USING (true);
CREATE POLICY "reactions insert own" ON public.reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reactions delete own" ON public.reactions FOR DELETE USING (auth.uid() = user_id);

-- ============ REPOSTS ============
CREATE TABLE public.reposts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  quote TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);
CREATE INDEX reposts_post_idx ON public.reposts (post_id);
CREATE INDEX reposts_user_idx ON public.reposts (user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.reposts TO authenticated;
GRANT SELECT ON public.reposts TO anon;
GRANT ALL ON public.reposts TO service_role;
ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reposts read all" ON public.reposts FOR SELECT USING (true);
CREATE POLICY "reposts insert own" ON public.reposts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reposts delete own" ON public.reposts FOR DELETE USING (auth.uid() = user_id);

-- ============ REPORTS ============
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status report_status NOT NULL DEFAULT 'open',
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int = 1)
);
GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports read own or mod" ON public.reports FOR SELECT USING (auth.uid() = reporter_id OR public.is_mod_or_admin(auth.uid()));
CREATE POLICY "reports insert own" ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "reports update mod" ON public.reports FOR UPDATE USING (public.is_mod_or_admin(auth.uid()));

-- ============ BLOCKS ============
CREATE TABLE public.blocks (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.blocks TO authenticated;
GRANT ALL ON public.blocks TO service_role;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocks read own" ON public.blocks FOR SELECT USING (auth.uid() = blocker_id);
CREATE POLICY "blocks insert own" ON public.blocks FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "blocks delete own" ON public.blocks FOR DELETE USING (auth.uid() = blocker_id);

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif read own" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notif update own" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "notif delete own" ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- ============ NOTIFICATION TRIGGERS ============
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_user UUID;
  ntype notification_type;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT author_id INTO target_user FROM public.comments WHERE id = NEW.parent_id;
    ntype := 'reply';
  ELSE
    SELECT author_id INTO target_user FROM public.posts WHERE id = NEW.post_id;
    ntype := 'comment';
  END IF;
  IF target_user IS NOT NULL AND target_user <> NEW.author_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id, comment_id)
    VALUES (target_user, NEW.author_id, ntype, NEW.post_id, NEW.id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER comments_notify AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

CREATE OR REPLACE FUNCTION public.notify_on_reaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user UUID;
BEGIN
  IF NEW.post_id IS NOT NULL THEN
    SELECT author_id INTO target_user FROM public.posts WHERE id = NEW.post_id;
  ELSE
    SELECT author_id INTO target_user FROM public.comments WHERE id = NEW.comment_id;
  END IF;
  IF target_user IS NOT NULL AND target_user <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id, comment_id)
    VALUES (target_user, NEW.user_id, 'reaction', NEW.post_id, NEW.comment_id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER reactions_notify AFTER INSERT ON public.reactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_reaction();

CREATE OR REPLACE FUNCTION public.notify_on_repost()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user UUID;
BEGIN
  SELECT author_id INTO target_user FROM public.posts WHERE id = NEW.post_id;
  IF target_user IS NOT NULL AND target_user <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id)
    VALUES (target_user, NEW.user_id, 'repost', NEW.post_id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER reposts_notify AFTER INSERT ON public.reposts
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_repost();

-- updated_at trigger reused
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER posts_touch BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER comments_touch BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
