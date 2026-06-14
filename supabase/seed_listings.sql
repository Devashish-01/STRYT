-- ============================================================
-- NAYA — Seed: businesses, catalog_items, offers, providers, portfolio_items
-- Run AFTER schema.sql AND seed_core.sql (needs users + categories).
-- distanceKm is intentionally omitted (computed at query time).
-- geom is auto-filled from lat/lng by the trigger. Safe to re-run.
-- ============================================================

-- ---------- businesses ----------
insert into public.businesses
  (id, owner_user_id, name, slug, category_id, category_name, sub_category, description,
   address_line1, city, pincode, lat, lng, phone, whatsapp, hours, is_open_now,
   opening_date, is_new, status, cover_image, gallery, rating_avg, rating_count,
   view_count, is_featured, is_verified, tags, price_for_two, delivery_time, offer_text) values
  ('b1','u10','Spice Route Kitchen','spice-route-kitchen','c-food-rest','Restaurant','North Indian • Biryani',
   'Home-style North Indian thalis, dum biryani and fresh tandoor. Family-run since the new branch opened this week.',
   'Shop 4, Lane 7, Koregaon Park','Pune','411001',18.536,73.893,'+919812345601','+919812345601','11:00 AM – 11:30 PM',true,
   '2026-05-30',true,'ACTIVE','https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=70',
   ARRAY['https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=70','https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=70'],
   4.6,128,3214,true,true,ARRAY['Pure Veg options','Biryani','Free delivery'],450,'30-35 min','50% OFF up to ₹100'),

  ('b2','u11','The Daily Grind Café','daily-grind-cafe','c-food-cafe','Café & Bakery','Coffee • Bakes',
   'Specialty pour-overs, fresh croissants and a quiet corner to work. Just opened around the block.',
   '12 North Main Rd, Koregaon Park','Pune','411001',18.538,73.896,'+919812345602',null,'7:30 AM – 11:00 PM',true,
   '2026-06-01',true,'ACTIVE','https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=600&q=70',
   ARRAY['https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=600&q=70','https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=600&q=70'],
   4.8,64,1890,false,true,ARRAY['Specialty Coffee','WiFi','Vegan bakes'],500,'20-25 min','Free cookie on ₹299+'),

  ('b3','u12','GreenLeaf Chemist','greenleaf-chemist','c-health-chem','Chemist / Pharmacy','24x7 Pharmacy',
   '24x7 pharmacy with home delivery, wellness products and quick prescription refills.',
   'Plot 9, Lane 5, Kalyani Nagar','Pune','411006',18.547,73.901,'+919812345603','+919812345603','Open 24 hours',true,
   '2026-05-29',true,'ACTIVE','https://images.unsplash.com/photo-1576602976047-174e57a47881?auto=format&fit=crop&w=600&q=70',
   ARRAY['https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=600&q=70'],
   4.5,212,4102,false,true,ARRAY['24x7','Home delivery','Wellness'],null,'15-20 min','20% OFF on wellness'),

  ('b4','u13','Sharp & Co. Barbers','sharp-co-barbers','c-beauty-barber','Barber Shop','Grooming • Styling',
   'Classic cuts, hot-towel shaves and beard sculpting. Walk-ins welcome, appointments faster.',
   'Unit 3, Boat Club Rd','Pune','411001',18.531,73.888,'+919812345604',null,'10:00 AM – 9:00 PM',true,
   '2026-03-12',false,'ACTIVE','https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=600&q=70',
   ARRAY['https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=600&q=70','https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=600&q=70'],
   4.7,340,5600,true,true,ARRAY['Walk-in','Beard care','AC'],600,null,'Haircut + Beard @ ₹399'),

  ('b5','u14','FreshMart Supermarket','freshmart-supermarket','c-retail-kirana','Kirana / Grocery','Groceries • Daily needs',
   'Your neighborhood supermarket — fresh produce, daily essentials and 10-minute delivery in 2 km.',
   'Ground Floor, Season Mall Rd','Pune','411013',18.519,73.927,'+919812345605',null,'8:00 AM – 11:00 PM',true,
   '2026-02-01',false,'ACTIVE','https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=70',
   ARRAY['https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=600&q=70'],
   4.3,510,8800,false,true,ARRAY['10-min delivery','Fresh produce','Daily deals'],null,'10-15 min','₹50 OFF on ₹499+'),

  ('b6','u15','Sweet Bliss Mithai','sweet-bliss-mithai','c-food-sweet','Sweet Shop','Mithai • Bengali sweets',
   'Freshly made kaju katli, rasgulla and festive boxes. Custom orders for celebrations.',
   'Shop 2, FC Road','Pune','411004',18.523,73.841,'+919812345606',null,'9:00 AM – 10:00 PM',false,
   '2026-05-28',true,'ACTIVE','https://images.unsplash.com/photo-1605197788044-5a32c7078486?auto=format&fit=crop&w=600&q=70',
   ARRAY['https://images.unsplash.com/photo-1606471191009-63994c53433b?auto=format&fit=crop&w=600&q=70'],
   4.4,96,1450,false,false,ARRAY['Custom boxes','Sugar-free options'],300,null,'Free box on 1kg+'),

  ('b7','u16','TechHub Mobiles','techhub-mobiles','c-retail-mobile','Mobile & Electronics','Phones • Accessories',
   'Latest smartphones, genuine accessories and on-spot screen repairs. EMI available.',
   'Shop 18, JM Road','Pune','411005',18.527,73.840,'+919812345607',null,'10:30 AM – 9:30 PM',true,
   '2026-01-15',false,'ACTIVE','https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=70',
   ARRAY['https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?auto=format&fit=crop&w=600&q=70'],
   4.2,178,3300,false,true,ARRAY['EMI','Repairs','Exchange offers'],null,null,'Free tempered glass'),

  ('b8','u17','IronCore Fitness','ironcore-fitness','c-fit-gym','Gym','Strength • Cardio',
   'Fully-equipped gym with certified trainers, group classes and a recovery zone. Trial passes available.',
   '2nd Floor, Aundh Rd','Pune','411007',18.560,73.810,'+919812345608',null,'5:00 AM – 11:00 PM',true,
   '2026-04-20',false,'ACTIVE','https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=600&q=70',
   ARRAY['https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&w=600&q=70','https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=600&q=70'],
   4.6,245,4500,true,true,ARRAY['Free trial','Personal training','Steam room'],null,null,'1 free trial day')
on conflict (id) do nothing;

-- ---------- catalog_items ----------
insert into public.catalog_items
  (id, business_id, name, description, price, sale_price, image, stock_status, is_veg, best_seller, sort_order) values
  ('ci1','b1','Hyderabadi Dum Biryani','Slow-cooked basmati, tender chicken, saffron',280,230,'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=300&q=70','IN_STOCK',null,true,0),
  ('ci2','b1','Paneer Butter Masala','Rich tomato gravy, fresh paneer',240,null,'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=300&q=70','IN_STOCK',true,false,1),
  ('ci3','b1','Butter Naan (2 pcs)','Tandoor fresh, brushed with butter',70,null,'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=300&q=70','IN_STOCK',true,false,2),
  ('ci4','b1','Tandoori Chicken (Half)','Charcoal grilled, house marinade',320,null,'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=300&q=70','LIMITED',null,true,3),
  ('ci5','b2','Cappuccino','Double shot, silky microfoam',160,null,'https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=300&q=70','IN_STOCK',true,true,0),
  ('ci6','b2','Almond Croissant','Buttery, baked this morning',140,null,'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=300&q=70','IN_STOCK',true,false,1),
  ('ci7','b2','Cold Brew','16h steeped, smooth & strong',180,null,'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=300&q=70','IN_STOCK',true,false,2),
  ('ci8','b3','Digital Thermometer','Fast 10s reading',299,249,'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=300&q=70','IN_STOCK',null,false,0),
  ('ci9','b3','Vitamin C 1000mg (60)','Immunity support',450,null,'https://images.unsplash.com/photo-1550572017-edd951aa8ca0?auto=format&fit=crop&w=300&q=70','IN_STOCK',null,false,1),
  ('ci10','b4','Haircut','Wash, cut & style',250,null,'https://images.unsplash.com/photo-1521590832167-7bcbfaaa6d96?auto=format&fit=crop&w=300&q=70','IN_STOCK',null,true,0),
  ('ci11','b4','Hot Towel Shave','Classic straight razor',200,null,'https://images.unsplash.com/photo-1493256338651-d82f7acb2b38?auto=format&fit=crop&w=300&q=70','IN_STOCK',null,false,1),
  ('ci12','b4','Beard Sculpt','Trim, shape & oil',180,null,'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?auto=format&fit=crop&w=300&q=70','IN_STOCK',null,false,2),
  ('ci13','b5','Farm Fresh Tomatoes 1kg','Hand-picked daily',40,null,'https://images.unsplash.com/photo-1546470427-e5ac89c8ba3a?auto=format&fit=crop&w=300&q=70','IN_STOCK',true,false,0),
  ('ci14','b5','Amul Milk 1L','Full cream, chilled',68,null,'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=300&q=70','IN_STOCK',true,false,1),
  ('ci15','b5','Brown Eggs (12)','Free range',110,null,'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=300&q=70','LIMITED',null,false,2),
  ('ci16','b6','Kaju Katli 500g','Pure cashew, silver leaf',420,null,'https://images.unsplash.com/photo-1605197788044-5a32c7078486?auto=format&fit=crop&w=300&q=70','IN_STOCK',true,true,0),
  ('ci17','b6','Motichoor Laddu 1kg','Classic festive sweet',480,null,'https://images.unsplash.com/photo-1609156726524-bf85be7e6cd5?auto=format&fit=crop&w=300&q=70','IN_STOCK',true,false,1),
  ('ci18','b7','Wireless Earbuds','ANC, 30h battery',1999,1499,'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?auto=format&fit=crop&w=300&q=70','IN_STOCK',null,true,0),
  ('ci19','b7','20W Fast Charger','USB-C, certified',799,null,'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=300&q=70','OUT_OF_STOCK',null,false,1),
  ('ci20','b8','Monthly Membership','All access, no joining fee',1499,null,'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=300&q=70','IN_STOCK',null,true,0),
  ('ci21','b8','Personal Training (10)','1-on-1 with certified coach',5999,null,'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=300&q=70','IN_STOCK',null,false,1)
on conflict (id) do nothing;

-- ---------- offers ----------
insert into public.offers (id, business_id, title, description, code, valid_until) values
  ('o1','b1','Grand Opening — 50% OFF','Flat 50% off on your first order up to ₹100','NAYA50','2026-06-15'),
  ('o2','b3','Wellness Week','20% off all vitamins & supplements','WELL20','2026-06-20'),
  ('o3','b4','Combo Deal','Haircut + Beard at ₹399 (save ₹50)',null,'2026-06-30')
on conflict (id) do nothing;

-- ---------- providers ----------
insert into public.providers
  (id, user_id, display_name, category_id, category_name, sub_category, bio, avatar,
   lat, lng, service_radius_km, starting_price, availability_note, status, is_verified,
   rating_avg, rating_count, jobs_done, response_time, is_new, skills, phone) values
  ('p1','u20','Ramesh Plumbing Works','c-home-plumb','Plumber','Repairs • Fittings',
   '15+ years fixing leaks, taps, geysers and full bathroom fittings. Same-day service across KP.',
   'https://i.pravatar.cc/150?img=12',18.535,73.890,6,199,'Mon–Sat, 8 AM – 8 PM','ACTIVE',true,
   4.7,156,480,'~15 min',false,ARRAY['Leak repair','Tap fitting','Geyser install','Drain cleaning'],'+919876500001'),

  ('p2','u21','Priya — Makeup Artist','c-beauty-makeup','Makeup Artist','Bridal • Party',
   'Certified MUA specializing in bridal and HD party looks. I bring everything to your doorstep.',
   'https://i.pravatar.cc/150?img=45',18.540,73.900,12,2500,'By appointment, evenings free','ACTIVE',true,
   4.9,88,130,'~30 min',true,ARRAY['Bridal makeup','HD makeup','Hairstyling','Saree draping'],'+919876500002'),

  ('p3','u22','Akash Electricals','c-home-elec','Electrician','Wiring • Appliances',
   'Licensed electrician for wiring, fan & light installation, MCB and inverter work. Safety first.',
   'https://i.pravatar.cc/150?img=33',18.550,73.910,8,149,'All days, 9 AM – 9 PM','ACTIVE',true,
   4.6,203,610,'~20 min',false,ARRAY['Wiring','Fan install','Inverter','MCB repair'],'+919876500003'),

  ('p4','u23','Lens & Light — Sahil','c-pro-photo','Photographer','Events • Portraits',
   'Event, pre-wedding and product photography. 8 years, candid style, quick turnaround edits.',
   'https://i.pravatar.cc/150?img=15',18.520,73.880,20,4999,'Weekends booked fast','ACTIVE',true,
   4.8,67,145,'~1 hr',false,ARRAY['Pre-wedding','Events','Product','Drone'],'+919876500004'),

  ('p5','u24','Meera''s Home Kitchen','c-events-cook','Home Cook / Chef','Tiffin • Party catering',
   'Healthy home-cooked tiffins and small-party catering. Maharashtrian & North Indian, hygienic.',
   'https://i.pravatar.cc/150?img=48',18.537,73.895,5,90,'Daily tiffins, party on order','ACTIVE',false,
   4.7,134,900,'~25 min',true,ARRAY['Daily tiffin','Party catering','Festive thali','Jain food'],'+919876500005'),

  ('p6','u25','CoolBreeze AC Services','c-home-ac','AC Repair','Service • Install',
   'AC service, gas refill, installation and uninstallation. All brands, genuine spares only.',
   'https://i.pravatar.cc/150?img=53',18.545,73.920,10,399,'Mon–Sun, slots available','ACTIVE',true,
   4.5,312,720,'~40 min',false,ARRAY['AC service','Gas refill','Installation','Repair'],'+919876500006'),

  ('p7','u26','Anita — Math & Science Tutor','c-edu-tutor','Private Tutor','Grades 8–12',
   'Engineering grad tutoring Maths, Physics & Chemistry for classes 8–12. Home & online.',
   'https://i.pravatar.cc/150?img=31',18.532,73.885,7,600,'Evenings & weekends','ACTIVE',true,
   4.9,54,95,'~1 hr',true,ARRAY['Maths','Physics','Chemistry','Board prep'],'+919876500007'),

  ('p8','u27','SparkleClean Services','c-home-clean','Cleaning Service','Deep clean • Sofa',
   'Home deep cleaning, sofa & carpet shampoo, kitchen and bathroom detailing. Trained team.',
   'https://i.pravatar.cc/150?img=60',18.528,73.900,9,999,'All days, team of 2–4','ACTIVE',true,
   4.4,178,410,'~35 min',false,ARRAY['Deep cleaning','Sofa shampoo','Bathroom','Move-in clean'],'+919876500008')
on conflict (id) do nothing;

-- ---------- portfolio_items ----------
insert into public.portfolio_items (id, provider_id, url, caption, sort_order) values
  ('pp1','p1','https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&w=400&q=70','Bathroom refit',0),
  ('pp2','p1','https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&w=400&q=70','Kitchen sink',1),
  ('pp3','p2','https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=400&q=70','Bridal look',0),
  ('pp4','p2','https://images.unsplash.com/photo-1457972729786-0411a3b2b626?auto=format&fit=crop&w=400&q=70','Party glam',1),
  ('pp5','p2','https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=400&q=70','Engagement',2),
  ('pp6','p3','https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=400&q=70','Panel work',0),
  ('pp7','p4','https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=400&q=70','Wedding',0),
  ('pp8','p4','https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=400&q=70','Couple',1),
  ('pp9','p5','https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=400&q=70','Party platter',0),
  ('pp10','p5','https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=400&q=70','Festive thali',1),
  ('pp11','p6','https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=400&q=70','Split AC install',0),
  ('pp12','p7','https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=400&q=70','Class session',0),
  ('pp13','p8','https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=400&q=70','Deep clean',0)
on conflict (id) do nothing;
