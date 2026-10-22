-- 04_seed_demo_services.sql - demo SERVICE provider (home electrician) with 6 bookable services + 4 portfolio photos
-- for the production admin account, and the business_owner + provider roles so both hats show in Manage.
-- Idempotent (fixed ids, ON CONFLICT DO NOTHING). Run after 03_seed_demo_grocery.sql, in the Supabase SQL Editor (production).
-- Removal: delete from public.providers where id = 'p_demo_elec_001' (packages and portfolio rows go with it or delete them by provider_id).
begin;

do $$
begin
  if not exists (select 1 from public.users where id = 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e') then
    raise exception 'owner not found - aborting';
  end if;
end $$;

-- 1. Give the account both hats. Only admin/super_admin changes are guarded, so adding these is allowed. ------------
update public.users
set roles = (select array_agg(distinct r) from unnest(roles || array['business_owner', 'provider']) r)
where id = 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e';

-- 2. A service provider: home electrician ---------------------------------------------------------------------------
insert into public.providers (
  id, user_id, display_name, category_id, category_name, bio, avatar, lat, lng, service_radius_km,
  starting_price, availability_note, status, is_verified, response_time, is_new, skills, phone,
  is_available_now, package_key, payment_timing, deposit_percent, bookings_enabled, is_open_now,
  verification_status, owner_enabled, show_phone_publicly, show_email_publicly, location_public, email
) values (
  'p_demo_elec_001', 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e', 'Dev Electricals - Home Electrician', 'c-home-elec', 'Electrician',
  'Licensed home electrician with 10+ years of experience. Fan and light installation, switchboard and MCB repair, wiring inspections and 24x7 emergency call-outs across Viman Nagar, Kalyani Nagar and Kharadi. Upfront pricing, clean work, 30-day workmanship warranty.',
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80', 18.5702, 73.9087, 8,
  299, 'Everyday from 08:00 AM to 09:00 PM, emergency calls 24x7', 'ACTIVE', false, 'Within 30 minutes', false,
  array['Fan installation', 'Switchboard repair', 'MCB and RCCB', 'Home wiring', 'LED lighting', 'Inverter fitting'],
  '+919000000098', true, 'homeservice', 'AT_APPOINTMENT', 0, true, true,
  'NONE', true, true, false, true, 'develectricals.demo@example.com'
) on conflict (id) do nothing;

-- 3. Services (bookable packages; some instant-book, some on request) ------------------------------------------------
insert into public.provider_packages (id, provider_id, name, description, price, duration, instant_book)
values
  ('pk_demo_elec_1', 'p_demo_elec_001', 'Quick Fix Visit', 'Diagnosis and repair of a single fault: switch, socket, MCB trip or flickering light. Parts extra.', 299, '30-45 min', true),
  ('pk_demo_elec_2', 'p_demo_elec_001', 'Ceiling / Wall Fan Installation', 'Fan fitting, regulator wiring and safety check. Includes up to 2 fans.', 399, '45-60 min', true),
  ('pk_demo_elec_3', 'p_demo_elec_001', 'Switchboard & MCB Repair', 'Repair or replacement of switchboards, MCBs and RCCBs with load testing.', 499, '1-2 hrs', true),
  ('pk_demo_elec_4', 'p_demo_elec_001', 'Full Home Wiring Inspection', 'Complete safety inspection of wiring, earthing and load with a written report.', 999, '2-3 hrs', false),
  ('pk_demo_elec_5', 'p_demo_elec_001', 'Inverter / UPS Installation', 'Mounting, battery connection and changeover wiring for home inverters.', 1499, '3-4 hrs', false),
  ('pk_demo_elec_6', 'p_demo_elec_001', 'Emergency Call-out (24x7)', 'Priority visit for sparking, short circuits or power loss. Arrives within the hour.', 699, 'Within 1 hr', false)
on conflict (id) do nothing;

-- 4. Portfolio photos --------------------------------------------------------------------------------------------------
insert into public.portfolio_items (id, provider_id, url, caption, sort_order)
values
  ('pf_demo_elec_1', 'p_demo_elec_001', 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&w=800&q=75', 'Switchboard panel wiring and MCB fitting', 0),
  ('pf_demo_elec_2', 'p_demo_elec_001', 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=800&q=75', 'Recessed LED lighting installation in a living room', 1),
  ('pf_demo_elec_3', 'p_demo_elec_001', 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&w=800&q=75', 'Fan installation and regulator wiring', 2),
  ('pf_demo_elec_4', 'p_demo_elec_001', 'https://images.unsplash.com/photo-1558403194-611308249627?auto=format&fit=crop&w=800&q=75', 'Electrical repair and circuit testing', 3)
on conflict (id) do nothing;

select (select count(*) from public.providers where id = 'p_demo_elec_001') as provider,
       (select count(*) from public.provider_packages where provider_id = 'p_demo_elec_001') as services,
       (select count(*) from public.portfolio_items where provider_id = 'p_demo_elec_001') as photos,
       (select geom is not null from public.providers where id = 'p_demo_elec_001') as geom_set,
       (select roles::text from public.users where id = 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e') as roles;

commit;
