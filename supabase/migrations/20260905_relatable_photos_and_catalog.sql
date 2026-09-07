-- ============================================================
-- Migration: 20260905_relatable_photos_and_catalog.sql
-- Description: Fill all shops and providers with relatable, authentic,
--              high-resolution photographs across cover images, galleries,
--              catalogues, and portfolio showcases.
-- Can be executed in the Supabase Dashboard SQL Editor.
-- ============================================================

BEGIN;

-- 1. UPDATE BUSINESS COVERS & GALLERIES WITH RELATABLE PHOTOGRAPHY

-- b_demo_dining: Spice Route Kitchen (North Indian & Biryani)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_demo_dining';

-- b_demo_takeaway: Frostbite Ice Cream (Ice Creams & Shakes)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1560008581-09826d1de69e?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_demo_takeaway';

-- b_demo_clinic: Sunrise Family Clinic (General Physician)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_demo_clinic';

-- b_demo_pharmacy: CarePlus Pharmacy (Chemist & Healthcare)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1576602976047-174e57a47881?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_demo_pharmacy';

-- b_demo_salon: Glow Studio Unisex Salon (Salon & Hair Spa)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_demo_salon';

-- b_demo_fitness: PowerHouse Gym (Gym & Fitness)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_demo_fitness';

-- b_demo_shop: Urban Threads Clothing (Boutique & Apparel)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_demo_shop';

-- b_demo_diagnostics: MedScan Diagnostic Lab (Pathology & Diagnostics)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_demo_diagnostics';

-- b_demo_vet: Happy Paws Veterinary Clinic (Pet Care)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1628009368231-7bb7cfcb0def?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1576201836106-db1758fd1c97?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_demo_vet';

-- b_demo_homeservice: FixIt Home Services (Electrician & Plumbing)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_demo_homeservice';

-- b_demo_learning: BrightMinds Tuition Center (Education & Coaching)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_demo_learning';

-- b_demo_professional: Sharma & Associates Law Firm (Legal Counsel)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1505664194779-8beaceb93744?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_demo_professional';

-- b_demo_events: Dream Decor Events (Wedding & Event Decoration)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_demo_events';

-- b_demo_generic: STRYT Neighbourhood Kiosk (Convenience & Stationery)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_demo_generic';

-- b_9d1919e478714894b21dc233a8bc8f7d: Fish katta (Fresh Seafood Kitchen)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_9d1919e478714894b21dc233a8bc8f7d';

-- b_de48dd0296a34a45a414a7936cf3130c: Soumyapatelmakeovers (Bridal Makeup & Glam)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1588510977054-8e4b4d409708?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_de48dd0296a34a45a414a7936cf3130c';

-- b_a1b3dae370c24f7fbc993d07f44a0c23: Kitchen king (Indian Restaurant & Thali)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_a1b3dae370c24f7fbc993d07f44a0c23';

-- b_28cfd665c81f42f19aebf2bc0a002635: Kashee Return LLP (Fine Dining Restaurant)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_28cfd665c81f42f19aebf2bc0a002635';

-- b_d0b35361947a4ebb99abfb69b3fedc6e: Indori -mart (Retail, Kirana, Stationery)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1546470427-e5ac89c8ba3a?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_d0b35361947a4ebb99abfb69b3fedc6e';

-- b_d8f29adf0512430d863ef4264f6ee56a: Professional video editor (Creative Media)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_d8f29adf0512430d863ef4264f6ee56a';

-- b_97c17014350240ac95ef393e09ca0df5: STRYT (Urban Hub)
UPDATE public.businesses
SET
  cover_image = 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
  gallery = ARRAY[
    'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=800&q=75',
    'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=800&q=75'
  ]
WHERE id = 'b_97c17014350240ac95ef393e09ca0df5';


-- 2. UPDATE PROVIDER AVATARS WITH AUTHENTIC PORTRAITS

-- p_demo_u1: Dr. Devashish Patel (General Physician)
UPDATE public.providers
SET avatar = 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=400&q=80'
WHERE id = 'p_demo_u1';

-- p_demo_u2: Devashish India — Electrician (Electrician)
UPDATE public.providers
SET avatar = 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80'
WHERE id = 'p_demo_u2';

-- p_demo_u3: Dev P — Private Tutor (Tutor)
UPDATE public.providers
SET avatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'
WHERE id = 'p_demo_u3';

-- p_e7904dd62bbc463c8ed946ef171155ee: Shree resin craft (Resin Crafts)
UPDATE public.providers
SET avatar = 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=400&q=80'
WHERE id = 'p_e7904dd62bbc463c8ed946ef171155ee';

-- p_5e250bb72c964d6daccd5553861d0a62: Gutairist JJ (Guitarist & Musician)
UPDATE public.providers
SET avatar = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80'
WHERE id = 'p_5e250bb72c964d6daccd5553861d0a62';

-- p_a3e5be5e39a34cd2911dcf27e024ad2d: Amarylline art (Painter & Artist)
UPDATE public.providers
SET avatar = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80'
WHERE id = 'p_a3e5be5e39a34cd2911dcf27e024ad2d';


-- 3. REPLACE LORENFLICKR & MISSING CATALOG ITEM IMAGES

-- Update existing catalog items by name match
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%butter chicken%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%paneer%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%dosa%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%sundae%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1570197788417-0e82375c9371?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%kulfi%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%tub%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%consultation%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1581595220892-b0739db3ba8c?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%checkup%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%paracetamol%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1550572017-edd951aa8ca0?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%multivitamin%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%first aid%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%haircut - men%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1521590832167-7bcbfaaa6d96?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%haircut - women%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%hair spa%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%monthly membership%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%personal training%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%cotton shirt%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%denim jeans%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%kurta%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1615461066841-6116e61058f4?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%blood count%' OR name ILIKE '%cbc%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%lipid%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1581093458791-9f3c3900df4b?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%thyroid%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%vet consultation%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1535268647677-300dbf3d78d1?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%vaccination%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%grooming%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1558403194-611308249627?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%electrical repair%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%fan installation%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%wiring inspection%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%monthly batch%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%one-on-one%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%legal consultation%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%document drafting%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1521791136364-7286472b6b5c?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%title check%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%birthday decor%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%wedding stage%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%balloon setup%';
UPDATE public.catalog_items SET image = 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=600&q=75' WHERE name ILIKE '%bombil%';


-- 4. INSERT RICH CATALOG ITEMS FOR SHOPS WITH EMPTY CATALOGUES

-- Kitchen King (b_a1b3dae370c24f7fbc993d07f44a0c23)
INSERT INTO public.catalog_items (id, business_id, name, description, price, sale_price, image, stock_status, is_veg, best_seller, sort_order)
VALUES
  ('ci_kk_sql_1', 'b_a1b3dae370c24f7fbc993d07f44a0c23', 'Special Chicken Dum Biryani', 'Slow-cooked saffron basmati rice with tender spiced chicken pieces and caramelized onions', 290, 250, 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', false, true, 1),
  ('ci_kk_sql_2', 'b_a1b3dae370c24f7fbc993d07f44a0c23', 'Shahi Paneer Deluxe', 'Fresh cottage cheese in sweet and rich creamy cashew-tomato gravy', 260, null, 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', true, true, 2),
  ('ci_kk_sql_3', 'b_a1b3dae370c24f7fbc993d07f44a0c23', 'Butter Naan (Basket of 3)', 'Crispy and soft tandoori bread generously coated with butter', 90, null, 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', true, false, 3),
  ('ci_kk_sql_4', 'b_a1b3dae370c24f7fbc993d07f44a0c23', 'Tandoori Chicken Platter', 'Smoky charcoal grilled chicken marinated in yogurt and Indian spices', 340, null, 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', false, true, 4)
ON CONFLICT (id) DO UPDATE SET image = EXCLUDED.image, price = EXCLUDED.price;

-- Fish Katta (b_9d1919e478714894b21dc233a8bc8f7d)
INSERT INTO public.catalog_items (id, business_id, name, description, price, sale_price, image, stock_status, is_veg, best_seller, sort_order)
VALUES
  ('ci_fk_sql_2', 'b_9d1919e478714894b21dc233a8bc8f7d', 'Surmai Fish Thali', 'Kingfish tawa fry, spicy Malvani fish curry, steamed rice, 2 chapati & solkadhi', 360, null, 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', false, true, 2),
  ('ci_fk_sql_3', 'b_9d1919e478714894b21dc233a8bc8f7d', 'Crispy Prawns Koliwada', 'Fresh medium prawns tossed in Mumbai Koliwada spices and deep fried', 320, null, 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', false, true, 3),
  ('ci_fk_sql_4', 'b_9d1919e478714894b21dc233a8bc8f7d', 'Whole Pomfret Tawa Fry', 'Fresh silver pomfret shallow fried with fiery red Malvani coastal masala', 450, null, 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', false, false, 4)
ON CONFLICT (id) DO UPDATE SET image = EXCLUDED.image;

-- Kashee Return LLP (b_28cfd665c81f42f19aebf2bc0a002635)
INSERT INTO public.catalog_items (id, business_id, name, description, price, sale_price, image, stock_status, is_veg, best_seller, sort_order)
VALUES
  ('ci_kashee_sql_1', 'b_28cfd665c81f42f19aebf2bc0a002635', 'Dal Makhani Fondue', 'Slow-simmered black lentils with fresh cream, served with mini garlic naan', 320, null, 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', true, true, 1),
  ('ci_kashee_sql_2', 'b_28cfd665c81f42f19aebf2bc0a002635', 'Royal Tandoori Veg Platter', 'Assorted tandoori broccoli, paneer tikka, and stuffed mushroom skewers', 380, null, 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', true, true, 2),
  ('ci_kashee_sql_3', 'b_28cfd665c81f42f19aebf2bc0a002635', 'Kashmiri Mutton Rogan Josh', 'Tender lamb simmered in traditional Kashmiri spices and ratan jot', 460, null, 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', false, true, 3)
ON CONFLICT (id) DO UPDATE SET image = EXCLUDED.image;

-- Indori -mart (b_d0b35361947a4ebb99abfb69b3fedc6e)
INSERT INTO public.catalog_items (id, business_id, name, description, price, sale_price, image, stock_status, is_veg, best_seller, sort_order)
VALUES
  ('ci_ind_sql_1', 'b_d0b35361947a4ebb99abfb69b3fedc6e', 'Indori Poha & Ratlami Sev Pack', 'Special thick Indori poha with spicy aromatic Ratlami sev and jeeravan masala', 120, null, 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', true, true, 1),
  ('ci_ind_sql_2', 'b_d0b35361947a4ebb99abfb69b3fedc6e', 'Farm Fresh Tomatoes (1kg)', 'Locally sourced red juicy tomatoes handpicked daily', 45, null, 'https://images.unsplash.com/photo-1546470427-e5ac89c8ba3a?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', true, false, 2),
  ('ci_ind_sql_3', 'b_d0b35361947a4ebb99abfb69b3fedc6e', 'Lord Shiva Embossed Canvas Poster', 'High-definition devotional wall art canvas for meditation room or living space', 299, null, 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', true, true, 3)
ON CONFLICT (id) DO UPDATE SET image = EXCLUDED.image;

-- Professional video editor (b_d8f29adf0512430d863ef4264f6ee56a)
INSERT INTO public.catalog_items (id, business_id, name, description, price, sale_price, image, stock_status, is_veg, best_seller, sort_order)
VALUES
  ('ci_ve_sql_1', 'b_d8f29adf0512430d863ef4264f6ee56a', 'Viral Reels & Shorts Editing (Pack of 5)', 'Hook-optimized pacing, dynamic animated captions, sound effects, and color grading', 2999, 2499, 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', null, true, 1),
  ('ci_ve_sql_2', 'b_d8f29adf0512430d863ef4264f6ee56a', 'YouTube Video Production & Cut (10-15 min)', 'Full timeline cut, B-roll integration, custom thumbnail, and sound design', 4999, null, 'https://images.unsplash.com/photo-1536240478700-b869070f9279?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', null, true, 2),
  ('ci_ve_sql_3', 'b_d8f29adf0512430d863ef4264f6ee56a', 'Wedding & Event Cinematic Teaser', 'Emotional storytelling cut with Hollywood film LUT color grading and licensed score', 7500, null, 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', null, false, 3)
ON CONFLICT (id) DO UPDATE SET image = EXCLUDED.image;

-- STRYT (b_97c17014350240ac95ef393e09ca0df5)
INSERT INTO public.catalog_items (id, business_id, name, description, price, sale_price, image, stock_status, is_veg, best_seller, sort_order)
VALUES
  ('ci_stryt_sql_1', 'b_97c17014350240ac95ef393e09ca0df5', 'Neighbourhood Creator Membership', 'Access to community coworking spaces, event lounge, and creator perks', 1499, null, 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', null, true, 1),
  ('ci_stryt_sql_2', 'b_97c17014350240ac95ef393e09ca0df5', 'Local Business Spotlight Package', 'Featured promotion across the local neighbourhood feed and discovery badges', 2999, null, 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=75', 'IN_STOCK', null, true, 2)
ON CONFLICT (id) DO UPDATE SET image = EXCLUDED.image;


-- 5. RE-POPULATE BUSINESS PORTFOLIO SHOWCASES WITH RELATABLE WORK SAMPLES

-- Clean out broken loremflickr items in business_portfolio_items
DELETE FROM public.business_portfolio_items WHERE url ILIKE '%loremflickr.com%';

-- Insert curated portfolio items
INSERT INTO public.business_portfolio_items (business_id, caption, url)
VALUES
  -- Spice Route Kitchen
  ('b_demo_dining', 'Warm ambient family dining hall', 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=800&q=75'),
  ('b_demo_dining', 'Live traditional charcoal clay tandoor', 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=75'),
  ('b_demo_dining', 'Royal North Indian thali service', 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=800&q=75'),

  -- Fish Katta
  ('b_9d1919e478714894b21dc233a8bc8f7d', 'Daily fresh catch selection from coastal docks', 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=800&q=75'),
  ('b_9d1919e478714894b21dc233a8bc8f7d', 'Crispy hot fish fry kitchen prep', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=800&q=75'),
  ('b_9d1919e478714894b21dc233a8bc8f7d', 'Traditional Solkadhi & Malvani curry service', 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=800&q=75'),

  -- Soumyapatelmakeovers
  ('b_de48dd0296a34a45a414a7936cf3130c', 'Royal North Indian Bridal Look', 'https://images.unsplash.com/photo-1588510977054-8e4b4d409708?auto=format&fit=crop&w=800&q=75'),
  ('b_de48dd0296a34a45a414a7936cf3130c', 'Intricate Floral Bridal Hairdo', 'https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?auto=format&fit=crop&w=800&q=75'),
  ('b_de48dd0296a34a45a414a7936cf3130c', 'Cocktail Reception Smokey Glam', 'https://images.unsplash.com/photo-1457972729786-0411a3b2b626?auto=format&fit=crop&w=800&q=75'),

  -- Kitchen king
  ('b_a1b3dae370c24f7fbc993d07f44a0c23', 'Signature royal dum thali', 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=800&q=75'),
  ('b_a1b3dae370c24f7fbc993d07f44a0c23', 'Live tandoor and grill section', 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=75'),
  ('b_a1b3dae370c24f7fbc993d07f44a0c23', 'Comfortable family dining area', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=75'),

  -- Kashee Return LLP
  ('b_28cfd665c81f42f19aebf2bc0a002635', 'Bespoke banquet & private dining setup', 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=75'),
  ('b_28cfd665c81f42f19aebf2bc0a002635', 'Gourmet culinary presentation', 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=75'),

  -- Indori -mart
  ('b_d0b35361947a4ebb99abfb69b3fedc6e', 'Spacious supermarket aisles with daily essentials', 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=800&q=75'),
  ('b_d0b35361947a4ebb99abfb69b3fedc6e', 'Quick checkout & gift wrapping station', 'https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?auto=format&fit=crop&w=800&q=75'),

  -- Professional video editor
  ('b_d8f29adf0512430d863ef4264f6ee56a', 'Dual-screen DaVinci color grading suite', 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=800&q=75'),
  ('b_d8f29adf0512430d863ef4264f6ee56a', 'Commercial brand shoot & film editing', 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=800&q=75'),

  -- Frostbite Ice Cream
  ('b_demo_takeaway', 'Handmade waffle cones & sundaes', 'https://images.unsplash.com/photo-1576506295286-5cda18df43e7?auto=format&fit=crop&w=800&q=75'),
  ('b_demo_takeaway', 'Gourmet fresh gelato display counter', 'https://images.unsplash.com/photo-1505394033641-40c6ad1178d7?auto=format&fit=crop&w=800&q=75'),

  -- Sunrise Family Clinic
  ('b_demo_clinic', 'Clean modern doctor consultation chamber', 'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=800&q=75'),
  ('b_demo_clinic', 'Sterilized clinical checkup station', 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=75'),

  -- FixIt Home Services
  ('b_demo_homeservice', 'Circuit breaker and MCB panel overhaul', 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=75'),
  ('b_demo_homeservice', 'Architectural warm cove lighting install', 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=800&q=75'),

  -- BrightMinds Tuition Center
  ('b_demo_learning', 'Interactive conceptual learning session', 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=800&q=75'),
  ('b_demo_learning', 'Quiet study library and practice desk', 'https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?auto=format&fit=crop&w=800&q=75'),

  -- Sharma & Associates Law Firm
  ('b_demo_professional', 'Corporate conference & mediation room', 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=75'),
  ('b_demo_professional', 'Private consultation lounge', 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=800&q=75'),

  -- Dream Decor Events
  ('b_demo_events', 'Fairytale outdoor mandap with floral drape', 'https://images.unsplash.com/photo-1519225429828-56961448b111?auto=format&fit=crop&w=800&q=75'),
  ('b_demo_events', 'Evening fairy-lit banquet reception', 'https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?auto=format&fit=crop&w=800&q=75'),

  -- Urban Threads Clothing
  ('b_demo_shop', 'Autumn/Winter curated ready-to-wear rack', 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=75'),
  ('b_demo_shop', 'Modern boutique storefront display', 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=800&q=75'),

  -- Glow Studio Unisex Salon
  ('b_demo_salon', 'Bridal hair styling & beauty lounge', 'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=800&q=75'),
  ('b_demo_salon', 'Chic modern styling stations', 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=800&q=75'),

  -- MedScan Diagnostic Lab
  ('b_demo_diagnostics', 'Automated pathology testing laboratory', 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=75'),
  ('b_demo_diagnostics', 'Hygienic blood sample collection booth', 'https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=800&q=75'),

  -- PowerHouse Gym
  ('b_demo_fitness', 'Heavy free-weights & powerlifting platform', 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=800&q=75'),
  ('b_demo_fitness', 'Cardio suite & functional fitness zone', 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=800&q=75'),

  -- CarePlus Pharmacy
  ('b_demo_pharmacy', 'Well-organized pharmacy shelves & OTC aisle', 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?auto=format&fit=crop&w=800&q=75'),
  ('b_demo_pharmacy', 'Licensed pharmacist dispensing counter', 'https://images.unsplash.com/photo-1586015555751-63c2c55b77c5?auto=format&fit=crop&w=800&q=75'),

  -- Happy Paws Veterinary Clinic
  ('b_demo_vet', 'Gentle pet examination and treatment room', 'https://images.unsplash.com/photo-1599443015574-be5fe8a05783?auto=format&fit=crop&w=800&q=75'),
  ('b_demo_vet', 'Pet recovery & wellness observation area', 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?auto=format&fit=crop&w=800&q=75'),

  -- STRYT Neighbourhood Kiosk
  ('b_demo_generic', 'Convenience grocery & sundries inventory', 'https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?auto=format&fit=crop&w=800&q=75'),
  ('b_demo_generic', 'Instant photocopy and document scan counter', 'https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=800&q=75');


-- 6. RE-POPULATE PROVIDER PORTFOLIOS WITH AUTHENTIC SAMPLES

-- Clean out broken loremflickr items in portfolio_items
DELETE FROM public.portfolio_items WHERE url ILIKE '%loremflickr.com%';

INSERT INTO public.portfolio_items (provider_id, caption, url)
VALUES
  -- Dr. Devashish Patel
  ('p_demo_u1', 'Comprehensive patient health consultation', 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=75'),
  ('p_demo_u1', 'Clean clinical diagnosis and equipment', 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=800&q=75'),
  ('p_demo_u1', 'Vitals screening and preventative health', 'https://images.unsplash.com/photo-1581595220892-b0739db3ba8c?auto=format&fit=crop&w=800&q=75'),

  -- Devashish India — Electrician
  ('p_demo_u2', 'Heavy-duty 3-phase MCB switchboard panel wiring', 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=75'),
  ('p_demo_u2', 'High-precision digital multimeter circuit testing', 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?auto=format&fit=crop&w=800&q=75'),
  ('p_demo_u2', 'Living room recessed LED lighting installation', 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=800&q=75'),

  -- Dev P — Private Tutor
  ('p_demo_u3', 'Interactive senior physics derivation session', 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=800&q=75'),
  ('p_demo_u3', '1-on-1 problem-solving & exam prep strategy', 'https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=800&q=75'),
  ('p_demo_u3', 'Organized handwritten formula guides and notes', 'https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?auto=format&fit=crop&w=800&q=75'),

  -- Shree resin craft
  ('p_e7904dd62bbc463c8ed946ef171155ee', 'Ocean wave teakwood resin wall clock', 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=75'),
  ('p_e7904dd62bbc463c8ed946ef171155ee', 'Emerald crystal geode coasters with 24k gold leaf', 'https://images.unsplash.com/photo-1569172122301-bc500f309134?auto=format&fit=crop&w=800&q=75'),
  ('p_e7904dd62bbc463c8ed946ef171155ee', 'Varmala wedding garland flower preservation block', 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=800&q=75'),
  ('p_e7904dd62bbc463c8ed946ef171155ee', 'Handmade marble-effect epoxy cheese platter', 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=800&q=75'),

  -- Gutairist JJ
  ('p_5e250bb72c964d6daccd5553861d0a62', 'Live unplugged acoustic evening set at local cafe', 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=800&q=75'),
  ('p_5e250bb72c964d6daccd5553861d0a62', 'Fingerstyle acoustic tracking in recording studio', 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=800&q=75'),
  ('p_5e250bb72c964d6daccd5553861d0a62', 'Sunset garden acoustic performance for wedding', 'https://images.unsplash.com/photo-1525201548942-d8732f6617a0?auto=format&fit=crop&w=800&q=75'),

  -- Amarylline art
  ('p_a3e5be5e39a34cd2911dcf27e024ad2d', 'Golden hour mountain landscape on linen canvas', 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=75'),
  ('p_a3e5be5e39a34cd2911dcf27e024ad2d', 'Custom fine watercolor portrait on handmade paper', 'https://images.unsplash.com/photo-1579783928121-e90ea89ab583?auto=format&fit=crop&w=800&q=75'),
  ('p_a3e5be5e39a34cd2911dcf27e024ad2d', 'Textured palette-knife modern acrylic on canvas', 'https://images.unsplash.com/photo-1569172122301-bc500f309134?auto=format&fit=crop&w=800&q=75'),
  ('p_a3e5be5e39a34cd2911dcf27e024ad2d', 'Solo artist gallery exhibition booth showcase', 'https://images.unsplash.com/photo-1501472312651-787554900085?auto=format&fit=crop&w=800&q=75');

COMMIT;
