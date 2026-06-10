-- Workspace multi-tenancy: one workspace per user (POC), RLS-enforced isolation

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workspaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- ─── RLS helper (SECURITY DEFINER — avoids recursion) ─────────────────────────

CREATE OR REPLACE FUNCTION public.user_workspace_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid();
$$;

-- ─── Auto-provision workspace on first sign-in ────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  ws_id        UUID;
  ws_name      TEXT;
  email_local  TEXT;
  email_domain TEXT;
BEGIN
  email_local  := split_part(NEW.email, '@', 1);
  email_domain := split_part(NEW.email, '@', 2);

  IF email_domain IN ('gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com') THEN
    ws_name := INITCAP(replace(email_local, '.', ' ')) || '''s Workspace';
  ELSE
    ws_name := INITCAP(split_part(email_domain, '.', 1));
  END IF;

  INSERT INTO public.workspaces (name) VALUES (ws_name) RETURNING id INTO ws_id;
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (ws_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_workspace ON auth.users;

CREATE TRIGGER on_auth_user_created_workspace
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_workspace();

-- ─── Tenant columns ───────────────────────────────────────────────────────────

ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);
ALTER TABLE public.document_sets ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);

-- ─── Drop demo anon policies ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "anon read entries" ON public.entries;
DROP POLICY IF EXISTS "anon insert entries" ON public.entries;
DROP POLICY IF EXISTS "anon update entries" ON public.entries;

DROP POLICY IF EXISTS "anon read document_sets" ON public.document_sets;
DROP POLICY IF EXISTS "anon insert document_sets" ON public.document_sets;
DROP POLICY IF EXISTS "anon update document_sets" ON public.document_sets;

DROP POLICY IF EXISTS "anon read customs-docs" ON storage.objects;
DROP POLICY IF EXISTS "anon insert customs-docs" ON storage.objects;

DROP POLICY IF EXISTS storage_objects_owner_select ON storage.objects;
DROP POLICY IF EXISTS storage_objects_owner_insert ON storage.objects;
DROP POLICY IF EXISTS storage_objects_owner_update ON storage.objects;
DROP POLICY IF EXISTS storage_objects_owner_delete ON storage.objects;

-- ─── Workspace / membership RLS ───────────────────────────────────────────────

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read workspaces"
ON public.workspaces FOR SELECT TO authenticated
USING (id IN (SELECT public.user_workspace_ids()));

CREATE POLICY "users read own memberships"
ON public.workspace_members FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- ─── Entries RLS (authenticated + workspace scope) ────────────────────────────

CREATE POLICY "workspace read entries"
ON public.entries FOR SELECT TO authenticated
USING (workspace_id IN (SELECT public.user_workspace_ids()));

CREATE POLICY "workspace insert entries"
ON public.entries FOR INSERT TO authenticated
WITH CHECK (workspace_id IN (SELECT public.user_workspace_ids()));

CREATE POLICY "workspace update entries"
ON public.entries FOR UPDATE TO authenticated
USING (workspace_id IN (SELECT public.user_workspace_ids()))
WITH CHECK (workspace_id IN (SELECT public.user_workspace_ids()));

CREATE POLICY "workspace delete entries"
ON public.entries FOR DELETE TO authenticated
USING (workspace_id IN (SELECT public.user_workspace_ids()));

-- ─── Document sets RLS ───────────────────────────────────────────────────────

CREATE POLICY "workspace read document_sets"
ON public.document_sets FOR SELECT TO authenticated
USING (workspace_id IN (SELECT public.user_workspace_ids()));

CREATE POLICY "workspace insert document_sets"
ON public.document_sets FOR INSERT TO authenticated
WITH CHECK (workspace_id IN (SELECT public.user_workspace_ids()));

CREATE POLICY "workspace update document_sets"
ON public.document_sets FOR UPDATE TO authenticated
USING (workspace_id IN (SELECT public.user_workspace_ids()))
WITH CHECK (workspace_id IN (SELECT public.user_workspace_ids()));

-- ─── Storage RLS (path prefix = workspace_id) ───────────────────────────────

CREATE POLICY "workspace read customs-docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket = 'customs-docs'
  AND (storage.foldername(key))[1] = ANY (
    ARRAY(SELECT public.user_workspace_ids()::text)
  )
);

CREATE POLICY "workspace insert customs-docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket = 'customs-docs'
  AND (storage.foldername(key))[1] = ANY (
    ARRAY(SELECT public.user_workspace_ids()::text)
  )
);

CREATE POLICY "workspace update customs-docs"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket = 'customs-docs'
  AND (storage.foldername(key))[1] = ANY (
    ARRAY(SELECT public.user_workspace_ids()::text)
  )
)
WITH CHECK (
  bucket = 'customs-docs'
  AND (storage.foldername(key))[1] = ANY (
    ARRAY(SELECT public.user_workspace_ids()::text)
  )
);

CREATE POLICY "workspace delete customs-docs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket = 'customs-docs'
  AND (storage.foldername(key))[1] = ANY (
    ARRAY(SELECT public.user_workspace_ids()::text)
  )
);

-- ─── Grants ───────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.workspaces TO authenticated;
GRANT SELECT ON public.workspace_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.document_sets TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT USAGE ON SCHEMA storage TO authenticated;

-- Note: set customs-docs bucket to private via CLI/dashboard after applying.
-- RLS on storage.objects enforces workspace isolation regardless of bucket public flag.
