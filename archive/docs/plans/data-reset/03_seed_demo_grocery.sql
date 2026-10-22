-- 03_seed_demo_grocery.sql - demo grocery business + full customer-side data for the production admin account.
-- Idempotent (fixed ids, ON CONFLICT DO NOTHING): safe to run twice. Run in the Supabase SQL Editor (production).
-- Removal: delete from public.businesses where id = 'b_demo_kirana_001' (+ the rq_demo/bm_demo/fl_demo/ul_demo rows).
begin;

-- 0. Safety: the owner must exist and must not already own a business (an owner-limit trigger allows one) ------------
do $$
begin
  if not exists (select 1 from public.users where id = 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e') then
    raise exception 'owner b0f894ce-c34c-4ea4-8eae-b9f3425fec5e not found - aborting';
  end if;
end $$;

-- 1. Customer side of the account: a complete profile ---------------------------------------------------------------
update public.users set
  avatar = 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=400&q=80',
  area = 'Viman Nagar', city = 'Pune', lat = 18.5679, lng = 73.9143,
  interest_category_ids = array['c-retail', 'c-food', 'c-home'],
  timezone = 'Asia/Kolkata', language = 'en', notification_radius_km = 5
where id = 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e';

-- 2. A grocery business owned by that account ------------------------------------------------------------------------
-- Photos: Unsplash images already used by the app's curated grocery set (free licence) and one CC0 Wikimedia photo.
-- Items without a photo fall back to the app's curated grocery imagery (enrichCatalogItems). Replace with your own
-- photos from Business > Manage > Catalog whenever you like.
insert into public.businesses (
  id, owner_user_id, name, slug, category_id, category_name, sub_category, description,
  address_line1, city, pincode, lat, lng, phone, whatsapp, hours, is_open_now, opening_date, is_new,
  status, cover_image, gallery, tags, delivery_time, offer_text, package_key, delivery_enabled,
  deposit_percent, default_slot_capacity, payment_timing, email, show_phone_publicly, show_email_publicly,
  location_public, bookings_enabled, is_verified, verification_status
) values (
  'b_demo_kirana_001', 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e', 'Sharma Kirana & Daily Needs', 'sharma-kirana-daily-needs', 'c-retail', 'Retail Shops',
  'Kirana / Grocery',
  'Your neighbourhood kirana since 1998. Fresh vegetables, fruit, dairy, staples, snacks and household essentials, delivered to your door in 30-40 minutes. Call or WhatsApp for bulk monthly orders.',
  'Shop 4, Gandhi Chowk, Viman Nagar', 'Pune', '411014', 18.5679, 73.9143,
  '+919000000099', '+919000000099', 'Everyday from 07:00 AM to 10:00 PM', true, current_date - 400, false,
  'ACTIVE', 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80',
  array['https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=800&q=75', 'https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?auto=format&fit=crop&w=800&q=75', 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=800&q=75'],
  array['grocery', 'kirana', 'vegetables', 'dairy', 'home delivery'], '30-40min', '10% off on your first order above Rs 500',
  'shop', true, 0, 1, 'AT_BOOKING', 'sharmakirana.demo@example.com', true, false, true, true, false, 'NONE'
) on conflict (id) do nothing;

-- 3. Catalogue (18 items: in stock, sale price, limited stock, out of stock, non-veg) ---------------------
insert into public.catalog_items
  (id, business_id, name, description, price, sale_price, image, stock_status, is_veg, best_seller, sort_order, is_food, inventory_type, quantity)
values
  ('ci_demo_gro_01', 'b_demo_kirana_001', 'Indori Poha & Ratlami Sev Pack', 'Thick Indori poha with spicy Ratlami sev - ready for a quick breakfast', 120, null, 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', true, true, 0, false, 'INFINITE', null),
  ('ci_demo_gro_02', 'b_demo_kirana_001', 'Farm Fresh Tomatoes (1 kg)', 'Locally sourced red tomatoes, picked fresh every morning', 45, null, null, 'IN_STOCK', true, false, 1, false, 'INFINITE', null),
  ('ci_demo_gro_03', 'b_demo_kirana_001', 'Fresh Bananas (1 dozen)', 'Ripe yellow bananas, naturally sweet', 60, 55, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Bunch_of_bananas_on_sale.jpg/960px-Bunch_of_bananas_on_sale.jpg', 'IN_STOCK', true, true, 2, false, 'INFINITE', null),
  ('ci_demo_gro_04', 'b_demo_kirana_001', 'Onions (1 kg)', 'Dry red onions, long shelf life', 40, null, null, 'IN_STOCK', true, false, 3, false, 'INFINITE', null),
  ('ci_demo_gro_05', 'b_demo_kirana_001', 'Potatoes (1 kg)', 'Clean table potatoes for everyday cooking', 35, null, null, 'IN_STOCK', true, false, 4, false, 'INFINITE', null),
  ('ci_demo_gro_06', 'b_demo_kirana_001', 'Basmati Rice (5 kg)', 'Long-grain aged basmati, fluffy and aromatic', 640, 599, null, 'IN_STOCK', true, true, 5, false, 'INFINITE', null),
  ('ci_demo_gro_07', 'b_demo_kirana_001', 'Toor Dal (1 kg)', 'Unpolished arhar dal, cooks soft and creamy', 165, null, null, 'IN_STOCK', true, false, 6, false, 'INFINITE', null),
  ('ci_demo_gro_08', 'b_demo_kirana_001', 'Whole Wheat Atta (5 kg)', 'Stone-ground chakki atta for soft rotis', 255, 239, null, 'IN_STOCK', true, true, 7, false, 'INFINITE', null),
  ('ci_demo_gro_09', 'b_demo_kirana_001', 'Sunflower Oil (1 L pouch)', 'Refined sunflower oil, light and heart friendly', 135, null, null, 'IN_STOCK', true, false, 8, false, 'INFINITE', null),
  ('ci_demo_gro_10', 'b_demo_kirana_001', 'Full Cream Milk (1 L)', 'Fresh pasteurised full cream milk', 68, null, null, 'IN_STOCK', true, true, 9, false, 'INFINITE', null),
  ('ci_demo_gro_11', 'b_demo_kirana_001', 'Farm Eggs (tray of 12)', 'Farm eggs, graded and clean', 96, null, null, 'IN_STOCK', false, false, 10, false, 'INFINITE', null),
  ('ci_demo_gro_12', 'b_demo_kirana_001', 'Sugar (1 kg)', 'Fine white crystal sugar', 48, null, null, 'IN_STOCK', true, false, 11, false, 'INFINITE', null),
  ('ci_demo_gro_13', 'b_demo_kirana_001', 'Assam Tea Powder (500 g)', 'Strong CTC tea for the perfect cutting chai', 245, null, null, 'IN_STOCK', true, false, 12, false, 'INFINITE', null),
  ('ci_demo_gro_14', 'b_demo_kirana_001', 'Family Ice Cream Tub (500 ml)', 'Creamy vanilla family tub', 180, null, 'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=600&q=75', 'LIMITED', true, false, 13, false, 'FINITE', 6),
  ('ci_demo_gro_15', 'b_demo_kirana_001', 'Mango Kulfi (pack of 4)', 'Traditional malai kulfi with real mango', 120, null, 'https://images.unsplash.com/photo-1570197788417-0e82375c9371?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', true, true, 14, false, 'INFINITE', null),
  ('ci_demo_gro_16', 'b_demo_kirana_001', 'Household Essentials Pack', 'Dish soap, scrub pads, bin liners and matchboxes', 150, null, 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', true, false, 15, false, 'INFINITE', null),
  ('ci_demo_gro_17', 'b_demo_kirana_001', 'Fresh Paneer (200 g)', 'Soft malai paneer, packed fresh daily', 90, null, null, 'OUT_OF_STOCK', true, false, 16, false, 'FINITE', 0),
  ('ci_demo_gro_18', 'b_demo_kirana_001', 'Salted Butter (500 g)', 'Creamy table butter', 285, null, null, 'LIMITED', true, false, 17, false, 'FINITE', 5)
on conflict (id) do nothing;

-- 4. Photo gallery ------------------------------------------------------------------------------------------------------
insert into public.business_portfolio_items (id, business_id, url, caption)
values
  ('bp_demo_gro_1', 'b_demo_kirana_001', 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=800&q=75', 'Neatly stocked shelves with daily essentials'),
  ('bp_demo_gro_2', 'b_demo_kirana_001', 'https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?auto=format&fit=crop&w=800&q=75', 'Convenience grocery and sundries inventory'),
  ('bp_demo_gro_3', 'b_demo_kirana_001', 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=800&q=75', 'Household and pantry range')
on conflict (id) do nothing;

-- 5. Customer-side activity: saved + followed shop, a shopping list, one open request --------------------------------------
insert into public.bookmarks (id, user_id, target_type, target_id)
  values ('bm_demo_001', 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e', 'BUSINESS', 'b_demo_kirana_001') on conflict (id) do nothing;
insert into public.follows (id, follower_user_id, target_type, target_id)
  values ('fl_demo_001', 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e', 'BUSINESS', 'b_demo_kirana_001') on conflict (id) do nothing;
insert into public.user_lists (id, user_id, name, emoji, shared)
  values ('ul_demo_001', 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e', 'Weekly groceries', 'basket', false) on conflict (id) do nothing;
insert into public.user_list_items (id, list_id, target_type, target_id)
  values ('uli_demo_001', 'ul_demo_001', 'BUSINESS', 'b_demo_kirana_001') on conflict (id) do nothing;

insert into public.requests
  (id, requester_user_id, title, description, category_id, category_name, sub_category, budget_min, budget_max,
   area, lat, lng, radius_km, deadline, status, is_urgent, expires_in_hrs, expires_at)
values
  ('rq_demo_001', 'b0f894ce-c34c-4ea4-8eae-b9f3425fec5e', 'Weekly vegetables and milk delivery',
   'Looking for a nearby kirana that can deliver 3 kg mixed vegetables, 2 L milk and a dozen eggs every Saturday morning.',
   'c-retail', 'Retail Shops', 'Kirana / Grocery', 500, 1500,
   'Viman Nagar', 18.5679, 73.9143, 5, 'Every Saturday morning', 'OPEN', false, 72, now() + interval '72 hours')
on conflict (id) do nothing;

-- 6. Check ------------------------------------------------------------------------------------------------------------------
select (select count(*) from public.businesses where id = 'b_demo_kirana_001') as business,
       (select count(*) from public.catalog_items where business_id = 'b_demo_kirana_001') as items,
       (select count(*) from public.business_portfolio_items where business_id = 'b_demo_kirana_001') as photos,
       (select count(*) from public.bookmarks where id = 'bm_demo_001') as bookmark,
       (select count(*) from public.requests where id = 'rq_demo_001') as request;

commit;
