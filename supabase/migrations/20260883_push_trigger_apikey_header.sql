-- Push trigger: send the secret API key on `apikey` only, never `Authorization`.
--
-- The vault secret `service_role_key` now holds an `sb_secret_…` key instead of
-- the legacy service_role JWT, because that JWT leaked in this repo's public git
-- history (present from 2026-07-10, still valid when found on 2026-08-04) and is
-- being disabled in Settings -> API Keys.
--
-- The new secret keys are NOT JWTs. Supabase rejects them on the
-- `Authorization: Bearer` header — the platform tries to parse the value as a
-- JWT and fails. They must travel on `apikey`. Leaving the Bearer header in
-- place with a non-JWT value is what breaks the call.
--
-- send-push was redeployed with verify_jwt = false for the same reason (the
-- gateway cannot vet a non-JWT), so its in-handler check is now the only
-- authorization boundary. That check accepts `apikey == <secret key>`, which is
-- exactly what this sends.
--
-- Everything else about the function is unchanged, including the
-- `exception when others then return new` guard that keeps a push failure from
-- ever rolling back the notification insert that triggered it.

create or replace function public.push_on_notification_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'functions_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';

  if v_url is null or v_url = '' or v_key is null or v_key = '' then
    return new;
  end if;

  perform net.http_post(
    url     := v_url || '/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- apikey ONLY. Do not re-add Authorization: the secret key is not a JWT.
      'apikey',       v_key
    ),
    body    := jsonb_build_object(
      'userId',   new.user_id,
      'title',    new.title,
      'body',     new.body,
      'deepLink', coalesce(new.deep_link, '/'),
      'type',     new.type,
      'imageUrl', coalesce(new.metadata->>'imageUrl', new.metadata->>'avatarUrl')
    )
  );

  return new;
exception
  when others then
    return new;
end
$$;

revoke execute on function public.push_on_notification_insert() from public;
revoke execute on function public.push_on_notification_insert() from anon;
