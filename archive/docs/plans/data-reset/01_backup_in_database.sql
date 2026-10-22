-- 01_backup_in_database.sql — run FIRST, on the same project you are about to wipe (staging rehearsal, then production).
-- Copies every table that step 02 will change into a restricted schema, so a mistake can be repaired.
-- Contains personal data: service-role only, drop it after 30 days:  drop schema wipe_backup_20261018 cascade;

begin;

create schema if not exists wipe_backup_20261018;
revoke all on schema wipe_backup_20261018 from public, anon, authenticated;

do $$
declare t record;
begin
  for t in select tablename from pg_tables
           where schemaname = 'public' and tablename <> 'spatial_ref_sys' loop
    execute format('create table wipe_backup_20261018.%I as table public.%I', t.tablename, t.tablename);
  end loop;
end $$;

create table wipe_backup_20261018._auth_users      as select * from auth.users;
create table wipe_backup_20261018._auth_identities as select * from auth.identities;

-- Proof the copy is complete: every line must show equal counts before you continue.
select t.tablename,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t.tablename), false, true, '')))[1]::text::int as source_rows,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from wipe_backup_20261018.%I', t.tablename), false, true, '')))[1]::text::int as backup_rows
from pg_tables t
where t.schemaname = 'public' and t.tablename <> 'spatial_ref_sys'
order by source_rows desc, t.tablename;

commit;
