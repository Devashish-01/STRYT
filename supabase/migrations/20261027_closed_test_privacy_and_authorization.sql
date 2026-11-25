-- Closed-test privacy and authorization corrections.
create or replace function public.get_public_profile(target_id text)
returns table (
  id text,
  name text,
  phone text,
  avatar text,
  area text,
  rating_avg numeric,
  rating_count int,
  created_at timestamptz,
  show_posts_publicly boolean,
  show_asks_publicly boolean,
  show_badges_publicly boolean,
  show_phone_publicly boolean,
  show_city_publicly boolean,
  show_rating_publicly boolean,
  distance_km numeric,
  email text,
  show_email_publicly boolean,
  show_name_publicly boolean,
  alias text
)
language plpgsql security definer stable set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_is_self_or_admin boolean;
  v_my_lat double precision;
  v_my_lng double precision;
begin
  select (target_id = v_uid) or ('admin' = any(u.roles))
    into v_is_self_or_admin
    from public.users u where u.id = v_uid;

  select u.lat, u.lng into v_my_lat, v_my_lng from public.users u where u.id = v_uid;

  return query
    select
      u.id,
      case when v_is_self_or_admin or coalesce(u.show_name_publicly, false) then u.name else null end,
      case when v_is_self_or_admin or u.show_phone_publicly then u.phone else null end,
      u.avatar,
      case when v_is_self_or_admin or u.show_city_publicly then u.area else null end,
      u.rating_avg,
      u.rating_count,
      u.created_at,
      u.show_posts_publicly,
      u.show_asks_publicly,
      u.show_badges_publicly,
      u.show_phone_publicly,
      u.show_city_publicly,
      u.show_rating_publicly,
      case when v_my_lat is null or v_my_lng is null or u.lat is null or u.lng is null then null
           else round((2 * 6371 * asin(sqrt(
             sin(radians(u.lat - v_my_lat) / 2) ^ 2 +
             cos(radians(v_my_lat)) * cos(radians(u.lat)) * sin(radians(u.lng - v_my_lng) / 2) ^ 2
           )))::numeric, 1)
      end,
      case when v_is_self_or_admin or coalesce(u.show_email_publicly, false) then u.email else null end,
      coalesce(u.show_email_publicly, false),
      coalesce(u.show_name_publicly, false),
      u.alias
    from public.users u
    where u.id = target_id
      and (v_is_self_or_admin or (u.customer_enabled = true and u.customer_deleted_at is null) or u.id = v_uid);
end $$;

revoke execute on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to authenticated, anon;

create or replace function public.broadcast_offer_to_nearby(
  p_offer_id text,
  p_radius_km double precision default 5
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r_offer record;
  r_biz record;
  r_user record;
  v_count int := 0;
  v_meta jsonb;
begin
  -- Fetch offer
  select * into r_offer
    from public.offers
   where id = p_offer_id;
  if not found then
    return 0;
  end if;

  -- Fetch business
  select * into r_biz
    from public.businesses
   where id = r_offer.business_id;
  if not found then
    return 0;
  end if;

  if r_biz.owner_user_id is distinct from auth.uid()::text and not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  -- Build rich metadata snapshot
  v_meta := jsonb_build_object(
    'offerId', r_offer.id,
    'businessId', r_biz.id,
    'businessName', r_biz.name,
    'offerTitle', r_offer.title,
    'offerCode', r_offer.code,
    'discountText', coalesce(r_biz.offer_text, r_offer.title),
    'validUntil', r_offer.valid_until,
    'imageUrl', r_biz.cover_image,
    'category', r_biz.category_name,
    'address', r_biz.address_line1,
    'statusPill', 'Special Offer',
    'tone', 'accent',
    'actions', jsonb_build_array('CLAIM_OFFER', 'VIEW_STORE')
  );

  -- Broadcast to nearby users who have opted in to notif_offers
  for r_user in
    select u.id
      from public.users u
     where u.id <> coalesce(r_biz.owner_user_id, '')
       and coalesce(u.notif_offers, true) = true
       and u.lat is not null and u.lng is not null
       and r_biz.lat is not null and r_biz.lng is not null
       and u.lat between r_biz.lat - (least(p_radius_km, 50.0) / 111.0) and r_biz.lat + (least(p_radius_km, 50.0) / 111.0)
       and u.lng between r_biz.lng - (least(p_radius_km, 50.0) / 111.0) and r_biz.lng + (least(p_radius_km, 50.0) / 111.0)
     limit 250
  loop
    insert into public.notifications (
      user_id,
      type,
      title,
      body,
      deep_link,
      metadata,
      entity_type,
      entity_id
    ) values (
      r_user.id,
      'OFFER',
      'Exclusive Offer from ' || r_biz.name,
      r_offer.title,
      '/business/' || r_biz.id,
      v_meta,
      'BUSINESS',
      r_biz.id
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.broadcast_offer_to_nearby(text, double precision) from public, anon;
grant execute on function public.broadcast_offer_to_nearby(text, double precision) to authenticated;

-- 2. Broadcast a newly approved listing (business, provider, place)
create or replace function public.broadcast_new_listing(
  p_type text,  -- 'business' | 'provider' | 'place'
  p_id text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r_user record;
  v_count int := 0;
  v_lat double precision;
  v_lng double precision;
  v_radius_km double precision := 5.0;
  v_owner_id text;
  v_name text;
  v_cat text;
  v_img text;
  v_addr text;
  v_phone text;
  v_notif_type text;
  v_title text;
  v_body text;
  v_link text;
  v_meta jsonb;
begin
  if p_type = 'business' then
    select owner_user_id, lat, lng, broadcast_radius, name, category_name, cover_image, address_line1, phone
      into v_owner_id, v_lat, v_lng, v_radius_km, v_name, v_cat, v_img, v_addr, v_phone
      from public.businesses
     where id = p_id;
    if not found then return 0; end if;

    v_radius_km := coalesce(v_radius_km, 5.0);
    v_cat := coalesce(v_cat, 'Shop');
    v_name := coalesce(v_name, 'A new business');
    v_notif_type := 'NEW_BUSINESS';
    v_title := 'New ' || v_cat || ' near you';
    v_body := v_name || ' is now open in your area';
    v_link := '/business/' || p_id;

    v_meta := jsonb_build_object(
      'businessId', p_id,
      'businessName', v_name,
      'category', v_cat,
      'imageUrl', v_img,
      'address', v_addr,
      'phone', v_phone,
      'lat', v_lat,
      'lng', v_lng,
      'statusPill', 'Newly Opened',
      'tone', 'primary',
      'actions', jsonb_build_array('VIEW_BUSINESS', 'DIRECTIONS')
    );

  elsif p_type = 'provider' then
    select user_id, lat, lng, service_radius_km, display_name, category_name, avatar, phone
      into v_owner_id, v_lat, v_lng, v_radius_km, v_name, v_cat, v_img, v_phone
      from public.providers
     where id = p_id;
    if not found then return 0; end if;

    v_radius_km := coalesce(v_radius_km, 5.0);
    v_cat := coalesce(v_cat, 'Provider');
    v_name := coalesce(v_name, 'A new provider');
    v_notif_type := 'NEW_PROVIDER';
    v_title := 'New ' || v_cat || ' near you';
    v_body := v_name || ' is now available for bookings';
    v_link := '/provider/' || p_id;

    v_meta := jsonb_build_object(
      'providerId', p_id,
      'providerName', v_name,
      'category', v_cat,
      'imageUrl', v_img,
      'phone', v_phone,
      'lat', v_lat,
      'lng', v_lng,
      'statusPill', 'New Provider',
      'tone', 'positive',
      'actions', jsonb_build_array('VIEW_PROVIDER', 'BOOK_APPOINTMENT')
    );

  elsif p_type = 'place' then
    select submitted_by_user_id, lat, lng, name, category, cover_image, address_line1
      into v_owner_id, v_lat, v_lng, v_name, v_cat, v_img, v_addr
      from public.places
     where id = p_id;
    if not found then return 0; end if;

    v_radius_km := 10.0;
    v_cat := coalesce(v_cat, 'Place');
    v_name := coalesce(v_name, 'A new place');
    v_notif_type := 'NEW_PLACE';
    v_title := 'New ' || v_cat || ' near you';
    v_body := v_name || ' was just added to your neighborhood map';
    v_link := '/place/' || p_id;

    v_meta := jsonb_build_object(
      'placeId', p_id,
      'placeName', v_name,
      'category', v_cat,
      'imageUrl', v_img,
      'address', v_addr,
      'lat', v_lat,
      'lng', v_lng,
      'statusPill', 'New Landmark',
      'tone', 'brand',
      'actions', jsonb_build_array('VIEW_PLACE', 'DIRECTIONS')
    );
  else
    return 0;
  end if;

  if v_owner_id is distinct from auth.uid()::text and not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  if v_lat is null or v_lng is null then
    return 0;
  end if;

  -- Broadcast to nearby users who opted into new business/place discovery
  for r_user in
    select u.id
      from public.users u
     where u.id <> coalesce(v_owner_id, '')
       and coalesce(u.notif_new_business, true) = true
       and u.lat is not null and u.lng is not null
       and u.lat between v_lat - (least(v_radius_km, 50.0) / 111.0) and v_lat + (least(v_radius_km, 50.0) / 111.0)
       and u.lng between v_lng - (least(v_radius_km, 50.0) / 111.0) and v_lng + (least(v_radius_km, 50.0) / 111.0)
     limit 250
  loop
    insert into public.notifications (
      user_id,
      type,
      title,
      body,
      deep_link,
      metadata,
      entity_type,
      entity_id
    ) values (
      r_user.id,
      v_notif_type,
      v_title,
      v_body,
      v_link,
      v_meta,
      upper(p_type),
      p_id
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.broadcast_new_listing(text, text) from public, anon;
grant execute on function public.broadcast_new_listing(text, text) to authenticated;


-- Limit gate-pass issuance to the requesting approved member's society.
drop policy if exists gp_insert on public.gate_passes;
create policy gp_insert on public.gate_passes for insert to authenticated
with check (issued_by_user_id = (select auth.uid())::text and exists (
  select 1 from public.society_members sm
  where sm.society_id = gate_passes.society_id
    and sm.user_id = (select auth.uid())::text and sm.approved = true
));

-- A client may only boost a business it owns.
drop policy if exists ins_boosts on public.boosts;
create policy ins_boosts on public.boosts for insert to authenticated
with check (target_type = 'business' and exists (
  select 1 from public.businesses b where b.id = boosts.target_id
    and b.owner_user_id = (select auth.uid())::text
));

-- Client-written points can be forged; only trusted database code may award them.
drop policy if exists owner_upd_leaderboard_points on public.leaderboard_points;
revoke insert, update, delete on public.leaderboard_points from anon, authenticated;

create or replace function public._award_leaderboard_points(p_user_id text, p_points integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null or p_points <= 0 then return; end if;
  insert into public.leaderboard_points(user_id, points, updated_at)
  values (p_user_id, p_points, now())
  on conflict (user_id) do update set
    points = public.leaderboard_points.points + excluded.points,
    updated_at = now();
end $$;
revoke all on function public._award_leaderboard_points(text, integer) from public, anon, authenticated;

create or replace function public._award_request_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._award_leaderboard_points(new.requester_user_id, 2);
  return new;
end $$;
drop trigger if exists award_request_points on public.requests;
create trigger award_request_points after insert on public.requests
for each row execute function public._award_request_points();

create or replace function public._award_agreement_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' then
    perform public._award_leaderboard_points(new.requester_user_id, 5);
  end if;
  return new;
end $$;
drop trigger if exists award_agreement_points on public.agreements;
create trigger award_agreement_points after update of status on public.agreements
for each row execute function public._award_agreement_points();

create or replace function public._award_first_business_review_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner text;
begin
  if new.ratee_type = 'BUSINESS' and
     (select count(*) from public.ratings r where r.ratee_type = 'BUSINESS' and r.ratee_id = new.ratee_id) = 1 then
    select b.owner_user_id into v_owner from public.businesses b where b.id = new.ratee_id;
    perform public._award_leaderboard_points(v_owner, 3);
  end if;
  return new;
end $$;
drop trigger if exists award_first_business_review_points on public.ratings;
create trigger award_first_business_review_points after insert on public.ratings
for each row execute function public._award_first_business_review_points();

revoke all on function public._award_request_points() from public, anon, authenticated;
revoke all on function public._award_agreement_points() from public, anon, authenticated;
revoke all on function public._award_first_business_review_points() from public, anon, authenticated;
