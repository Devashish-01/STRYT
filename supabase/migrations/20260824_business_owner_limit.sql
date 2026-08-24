-- Raise the per-owner business cap from exactly 1 to up to 5.
--
-- Previously enforced by a plain UNIQUE index (idx_businesses_one_per_owner),
-- which can only express "at most 1". A count cap needs a trigger instead.
-- Soft-deleted businesses (deleted_at is not null) don't count against the
-- cap, so deleting a business frees up a slot.

drop index if exists "public"."idx_businesses_one_per_owner";

create or replace function "public"."_enforce_business_owner_limit"()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if new.owner_user_id is null then
    return new;
  end if;

  select count(*) into v_count
  from public.businesses
  where owner_user_id = new.owner_user_id
    and deleted_at is null
    and id <> coalesce(new.id, '');

  if v_count >= 5 then
    raise exception 'BUSINESS_OWNER_LIMIT_REACHED'
      using errcode = 'P0001',
            detail = 'owner_user_id already owns 5 active businesses';
  end if;

  return new;
end;
$$;

drop trigger if exists "trg_enforce_business_owner_limit" on "public"."businesses";
create trigger "trg_enforce_business_owner_limit"
  before insert or update of owner_user_id on "public"."businesses"
  for each row
  execute function "public"."_enforce_business_owner_limit"();
