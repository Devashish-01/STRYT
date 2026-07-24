-- Alias privacy: a user's alias is the ONLY public identity. Users without an
-- alias fell back to showing their real first name publicly (identity leak).
-- Backfill a neutral, unique private handle for everyone missing one, and
-- ensure every future user gets one on insert via a BEFORE INSERT trigger.
--
-- Handle form: 'member_' || 10 hex of md5(id) — matches alias rules
-- (a-z0-9_. , <=20 chars) and is unique per id (users_alias_unique on
-- lower(alias)). Idempotent: safe to re-run.

UPDATE public.users
SET alias = 'member_' || substr(md5(id::text), 1, 10)
WHERE alias IS NULL OR btrim(alias) = '';

CREATE OR REPLACE FUNCTION public.set_default_user_alias()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.alias IS NULL OR btrim(NEW.alias) = '' THEN
    NEW.alias := 'member_' || substr(md5(coalesce(NEW.id::text, gen_random_uuid()::text)), 1, 10);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_default_user_alias ON public.users;
CREATE TRIGGER trg_set_default_user_alias
  BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_default_user_alias();
