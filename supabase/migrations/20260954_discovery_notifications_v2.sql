-- ============================================================
-- 20260954_discovery_notifications_v2.sql
-- Group 8: Local Discovery, Places & Category Announcements
-- Rich metadata, preference respect, and broadcast RPCs for:
-- - NEW_BUSINESS
-- - NEW_PROVIDER
-- - NEW_PLACE
-- - OFFER
-- ============================================================

-- 1. Broadcast an Offer to nearby opted-in users with rich metadata
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
