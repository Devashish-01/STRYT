-- Forward notification identity and ownership context to send-push so
-- foreground web/native banners can use the same scope as the unread tray.
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
      'apikey', v_key
    ),
    body    := jsonb_build_object(
      'userId', new.user_id,
      'title', new.title,
      'body', new.body,
      'deepLink', coalesce(new.deep_link, '/'),
      'type', new.type,
      'notificationId', new.id,
      'entityType', new.entity_type,
      'entityId', new.entity_id,
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
