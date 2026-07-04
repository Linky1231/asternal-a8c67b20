
-- 1) cover image on posts
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS cover_url text;

-- 2) user_projects for cloud sync
CREATE TABLE IF NOT EXISTS public.user_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled Game',
  data jsonb NOT NULL,
  published_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_projects_user_idx ON public.user_projects(user_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_projects TO authenticated;
GRANT ALL ON public.user_projects TO service_role;
ALTER TABLE public.user_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects owner read" ON public.user_projects;
DROP POLICY IF EXISTS "projects owner write" ON public.user_projects;
DROP POLICY IF EXISTS "projects owner update" ON public.user_projects;
DROP POLICY IF EXISTS "projects owner delete" ON public.user_projects;
CREATE POLICY "projects owner read"   ON public.user_projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "projects owner write"  ON public.user_projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "projects owner update" ON public.user_projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "projects owner delete" ON public.user_projects FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS user_projects_touch ON public.user_projects;
CREATE TRIGGER user_projects_touch BEFORE UPDATE ON public.user_projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) mods can update posts (soft delete)
DROP POLICY IF EXISTS "posts update own or mod" ON public.posts;
DROP POLICY IF EXISTS "posts update own" ON public.posts;
CREATE POLICY "posts update own or mod" ON public.posts FOR UPDATE
  USING ((auth.uid() = author_id) OR public.is_mod_or_admin(auth.uid()));

-- 4) admin management of user_roles
DROP POLICY IF EXISTS "roles admin manage" ON public.user_roles;
CREATE POLICY "roles admin manage" ON public.user_roles
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- allow admins to view all roles
DROP POLICY IF EXISTS "roles admin read all" ON public.user_roles;
CREATE POLICY "roles admin read all" ON public.user_roles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 5) promote judith on signup + backfill existing user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INT := 0;
  assigned_role public.app_role := 'user';
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

  IF lower(NEW.email) = 'judithreyes534@gmail.com' THEN
    assigned_role := 'admin';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);
  RETURN NEW;
END;
$$;

-- backfill admin if user exists
DO $$
DECLARE uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = 'judithreyes534@gmail.com' LIMIT 1;
  IF uid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;
