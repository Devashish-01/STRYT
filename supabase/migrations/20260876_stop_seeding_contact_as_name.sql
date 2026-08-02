-- Feedback #6 — "on home page the email id is showing, the username should be there"
--
-- Not a Home-page bug. `handle_new_auth_user` seeded users.name from the
-- signup contact detail:
--
--     coalesce(nullif(new.phone,''), nullif(new.email,''), 'New user')
--
-- ...so an account created with an email carries its address as its display
-- name forever. Measured on the live DB before this migration: 8 of 10 users
-- had name EXACTLY equal to email.
--
-- This is why publicName.ts has always carried an `isPhoneName` guard — the
-- phone half of this same line. The email half was never guarded, and a name
-- renders to STRANGERS (public profile, reviews, community posts, delivery
-- cards), so it was leaking contact details, not just looking untidy.
--
-- Two changes, matching the client fix in publicName.ts:
--   1. Stop seeding a contact detail as a name. New accounts get 'New user',
--      which every name helper already treats as "no name set" and replaces
--      with the user's alias or a friendly fallback.
--   2. Backfill the existing rows to the same placeholder.
--
-- users.name is NOT NULL, so the placeholder (not null) is the correct target;
-- isUnusableName() in publicName.ts is what turns it into the alias at render
-- time. Every live account has an alias, so nobody ends up nameless.
--
-- The user's real name is NOT destroyed by this: it was never captured. These
-- rows only ever held the contact detail the account was created with, which is
-- still present in users.phone / users.email.
--
-- APPLIED TO PRODUCTION via mcp__supabase__apply_migration as
-- `stop_seeding_contact_as_name`.

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  insert into public.users (id, name, phone, email, roles)
  values (
    new.id::text,
    -- Deliberately NOT phone/email. A placeholder here is a prompt to set a
    -- real name; a contact detail here is a leak that looks like a name.
    'New user',
    new.phone,
    new.email,
    '{customer}'
  )
  on conflict (id) do update set email = coalesce(public.users.email, excluded.email)
  where public.users.email is null;
  return new;
exception when others then
  return new;
end $function$;

-- Backfill: any name that is just the account's own contact detail.
-- Matched structurally (email/phone shape) as well as by equality, so a row
-- whose email was later changed is still caught.
update public.users
   set name = 'New user'
 where name is not null
   and (
     name = email
     or name = phone
     or name ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or name ~ '^[+]?[[:digit:][:space:]-]{7,}$'
   );
