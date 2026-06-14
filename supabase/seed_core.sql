-- ============================================================
-- NAYA — Seed: categories, users, requests, proposals
-- Run AFTER schema.sql. Order matters (FKs): categories -> users
-- -> requests -> proposals. Safe to re-run (on conflict do nothing).
-- ============================================================

-- ---------- categories: parents first ----------
insert into public.categories (id, parent_id, name, slug, kind, icon, color) values
  ('c-food',   null, 'Food & Beverage',          'food-beverage',  'BUSINESS', '🍔', '#ff7849'),
  ('c-health', null, 'Health & Medical',         'health-medical', 'BUSINESS', '🩺', '#0ea5e9'),
  ('c-beauty', null, 'Beauty & Personal Care',   'beauty',         'BOTH',     '💇', '#ec4899'),
  ('c-retail', null, 'Retail Shops',             'retail',         'BUSINESS', '🛍️', '#8b5cf6'),
  ('c-home',   null, 'Home & Repair',            'home-repair',    'SERVICE',  '🔧', '#f59e0b'),
  ('c-edu',    null, 'Education & Tutoring',      'education',     'BOTH',     '📖', '#0d9488'),
  ('c-fit',    null, 'Fitness & Wellness',        'fitness',       'BOTH',     '💪', '#16a34a'),
  ('c-pro',    null, 'Professional Services',     'professional',  'SERVICE',  '💼', '#6366f1'),
  ('c-events', null, 'Events & Personal',         'events',        'SERVICE',  '🎉', '#f43f5e'),
  ('c-pets',   null, 'Pets',                      'pets',          'BOTH',     '🐶', '#f97316')
on conflict (id) do nothing;

-- ---------- categories: children ----------
insert into public.categories (id, parent_id, name, slug, kind, icon, color) values
  ('c-food-rest',     'c-food',   'Restaurant',             'restaurant',  'BUSINESS', '🍽️', '#ff7849'),
  ('c-food-cafe',     'c-food',   'Café & Bakery',          'cafe-bakery', 'BUSINESS', '☕', '#b45309'),
  ('c-food-tiffin',   'c-food',   'Tiffin / Home Kitchen',  'tiffin',      'BUSINESS', '🍱', '#16a34a'),
  ('c-food-sweet',    'c-food',   'Sweet Shop',             'sweet-shop',  'BUSINESS', '🧁', '#ec4899'),
  ('c-food-juice',    'c-food',   'Juice Bar',              'juice-bar',   'BUSINESS', '🥤', '#f59e0b'),
  ('c-food-ice',      'c-food',   'Ice Cream',              'ice-cream',   'BUSINESS', '🍦', '#06b6d4'),
  ('c-health-gp',     'c-health', 'General Physician',      'gp',          'BUSINESS', '👨‍⚕️', '#0ea5e9'),
  ('c-health-dent',   'c-health', 'Dentist',                'dentist',     'BUSINESS', '🦷', '#38bdf8'),
  ('c-health-chem',   'c-health', 'Chemist / Pharmacy',     'pharmacy',    'BUSINESS', '💊', '#22c55e'),
  ('c-health-lab',    'c-health', 'Diagnostic Lab',         'lab',         'BUSINESS', '🔬', '#6366f1'),
  ('c-health-vet',    'c-health', 'Veterinarian',           'vet',         'BUSINESS', '🐾', '#f97316'),
  ('c-beauty-barber', 'c-beauty', 'Barber Shop',            'barber',      'BUSINESS', '💈', '#ef4444'),
  ('c-beauty-salon',  'c-beauty', 'Unisex Salon',           'salon',       'BUSINESS', '💇', '#ec4899'),
  ('c-beauty-spa',    'c-beauty', 'Spa & Massage',          'spa',         'BUSINESS', '💆', '#a855f7'),
  ('c-beauty-makeup', 'c-beauty', 'Makeup Artist',          'makeup',      'SERVICE',  '💄', '#f43f5e'),
  ('c-beauty-nail',   'c-beauty', 'Nail Studio',            'nails',       'BUSINESS', '💅', '#fb7185'),
  ('c-retail-kirana', 'c-retail', 'Kirana / Grocery',       'grocery',     'BUSINESS', '🛒', '#16a34a'),
  ('c-retail-cloth',  'c-retail', 'Clothing',               'clothing',    'BUSINESS', '👕', '#8b5cf6'),
  ('c-retail-mobile', 'c-retail', 'Mobile & Electronics',   'electronics', 'BUSINESS', '📱', '#3b82f6'),
  ('c-retail-foot',   'c-retail', 'Footwear',               'footwear',    'BUSINESS', '👟', '#f59e0b'),
  ('c-retail-books',  'c-retail', 'Books & Stationery',     'books',       'BUSINESS', '📚', '#0d9488'),
  ('c-home-plumb',    'c-home',   'Plumber',                'plumber',     'SERVICE',  '🚰', '#0ea5e9'),
  ('c-home-elec',     'c-home',   'Electrician',            'electrician', 'SERVICE',  '💡', '#f59e0b'),
  ('c-home-carp',     'c-home',   'Carpenter',              'carpenter',   'SERVICE',  '🔨', '#b45309'),
  ('c-home-ac',       'c-home',   'AC Repair',              'ac-repair',   'SERVICE',  '❄️', '#38bdf8'),
  ('c-home-clean',    'c-home',   'Cleaning Service',       'cleaning',    'SERVICE',  '🧹', '#22c55e'),
  ('c-home-pest',     'c-home',   'Pest Control',           'pest-control','SERVICE',  '🐜', '#ef4444'),
  ('c-edu-tuition',   'c-edu',    'Coaching / Tuition',     'tuition',     'BOTH',     '✏️', '#0d9488'),
  ('c-edu-music',     'c-edu',    'Music',                  'music',       'BOTH',     '🎸', '#8b5cf6'),
  ('c-edu-dance',     'c-edu',    'Dance',                  'dance',       'BOTH',     '💃', '#ec4899'),
  ('c-edu-tutor',     'c-edu',    'Private Tutor',          'tutor',       'SERVICE',  '🧑‍🏫', '#3b82f6'),
  ('c-fit-gym',       'c-fit',    'Gym',                    'gym',         'BUSINESS', '🏋️', '#16a34a'),
  ('c-fit-yoga',      'c-fit',    'Yoga Studio',            'yoga',        'BOTH',     '🧘', '#a855f7'),
  ('c-fit-trainer',   'c-fit',    'Personal Trainer',       'trainer',     'SERVICE',  '🤸', '#f97316'),
  ('c-pro-photo',     'c-pro',    'Photographer',           'photographer','SERVICE',  '📸', '#6366f1'),
  ('c-pro-law',       'c-pro',    'Lawyer',                 'lawyer',      'SERVICE',  '⚖️', '#475569'),
  ('c-pro-ca',        'c-pro',    'CA / Tax',               'ca',          'SERVICE',  '🧮', '#0d9488'),
  ('c-pro-design',    'c-pro',    'Designer / Developer',   'design-dev',  'SERVICE',  '🎨', '#ec4899'),
  ('c-events-plan',   'c-events', 'Event Planner',          'event-planner','SERVICE', '🎊', '#f43f5e'),
  ('c-events-decor',  'c-events', 'Decorator',              'decorator',   'SERVICE',  '🎈', '#ec4899'),
  ('c-events-cater',  'c-events', 'Caterer',                'caterer',     'SERVICE',  '🍲', '#f59e0b'),
  ('c-events-cook',   'c-events', 'Home Cook / Chef',       'chef',        'SERVICE',  '👨‍🍳', '#16a34a'),
  ('c-events-mehndi', 'c-events', 'Mehndi Artist',          'mehndi',      'SERVICE',  '🖐️', '#b45309'),
  ('c-pets-shop',     'c-pets',   'Pet Shop',               'pet-shop',    'BUSINESS', '🐕', '#f97316'),
  ('c-pets-groom',    'c-pets',   'Pet Grooming',           'pet-grooming','BOTH',     '✂️', '#a855f7')
on conflict (id) do nothing;

-- ---------- users ----------
-- u1 is the current/full user. The rest are referenced as owners /
-- requesters / responders; minimal rows are enough for the read path.
insert into public.users (id, name, phone, avatar, roles, area, city, rating_avg, rating_count, language, notification_radius_km) values
  ('u1', 'Rohan Mehta', '+91 98123 45670', 'https://i.pravatar.cc/150?img=8', '{customer,business_owner}', 'Koregaon Park', 'Pune', 4.8, 23, 'en', 5)
on conflict (id) do nothing;

insert into public.users (id, name, avatar) values
  ('u2',  'Sneha K.',  'https://i.pravatar.cc/150?img=20'),
  ('u3',  'Aditya P.', 'https://i.pravatar.cc/150?img=14'),
  ('u4',  'Fatima S.', 'https://i.pravatar.cc/150?img=28'),
  ('u5',  'Karan V.',  'https://i.pravatar.cc/150?img=51'),
  ('u6',  'Divya R.',  'https://i.pravatar.cc/150?img=36'),
  ('u7',  'Nikhil A.', 'https://i.pravatar.cc/150?img=53'),
  ('u8',  'Pooja S.',  'https://i.pravatar.cc/150?img=47'),
  ('u10', 'Spice Route Owner',  null),
  ('u11', 'Daily Grind Owner',  'https://i.pravatar.cc/150?img=11'),
  ('u12', 'GreenLeaf Owner',    null),
  ('u13', 'Sharp & Co. Owner',  null),
  ('u14', 'FreshMart Owner',    null),
  ('u15', 'Sweet Bliss Owner',  null),
  ('u16', 'TechHub Owner',      null),
  ('u17', 'IronCore Owner',     null),
  ('u20', 'Ramesh Plumbing Works',      'https://i.pravatar.cc/150?img=12'),
  ('u21', 'Priya — Makeup Artist',      'https://i.pravatar.cc/150?img=45'),
  ('u22', 'Akash Electricals',          'https://i.pravatar.cc/150?img=33'),
  ('u23', 'Lens & Light — Sahil',       'https://i.pravatar.cc/150?img=15'),
  ('u24', 'Meera''s Home Kitchen',      'https://i.pravatar.cc/150?img=48'),
  ('u25', 'CoolBreeze AC Services',     'https://i.pravatar.cc/150?img=53'),
  ('u26', 'Anita — Math & Science Tutor','https://i.pravatar.cc/150?img=31'),
  ('u27', 'SparkleClean Services',      'https://i.pravatar.cc/150?img=60'),
  ('u40', 'Sneha Bakes',                'https://i.pravatar.cc/150?img=25')
on conflict (id) do nothing;

-- ---------- requests ----------
-- distanceKm / postedAt are NOT columns (distance is computed at query time;
-- postedAt is a relative label derived on the client). lat/lng approximated
-- from the area so geo sort works; geom is auto-filled by trigger.
insert into public.requests
  (id, requester_user_id, title, description, category_id, category_name,
   budget_min, budget_max, area, lat, lng, radius_km, deadline, status,
   is_boosted, view_count, photos, me_too_count, is_group_buy, group_buy_target,
   is_urgent, is_recurring, expires_in_hrs) values
  ('r1','u1','Need a custom birthday cake',
   'Looking for a 1kg chocolate or red velvet cake with ''Happy Birthday Aai'' written on top. Budget around ₹800. Need it delivered to Koregaon Park by Saturday evening.',
   'c-food-sweet','Sweet Shop',600,800,'Koregaon Park',18.536,73.893,3,'Sat, 7 Jun','OPEN',
   true,142, ARRAY['https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=400&q=70'],
   3,false,null,false,false,8),

  ('r2','u2','Urgent: plumber for kitchen leak',
   'Water leaking under the kitchen sink since morning. Need someone today. Pipe joint looks loose.',
   'c-home-plumb','Plumber',200,500,'Kalyani Nagar',18.547,73.901,5,'Today','OPEN',
   false,67, '{}', 1,false,null,true,false,4),

  ('r3','u3','Math tutor for class 10 (CBSE)',
   'Need a tutor for my son, 3 days a week, evenings. Focus on algebra and geometry. Home tuition preferred.',
   'c-edu-tutor','Private Tutor',4000,6000,'Boat Club Road',18.531,73.888,6,'This week','OPEN',
   false,89, '{}', 0,false,null,false,false,null),

  ('r4','u4','Mehndi artist for small function',
   'Need a mehndi artist for 6 people for an engagement at home. Bridal-style for one, simple for others.',
   'c-events-mehndi','Mehndi Artist',2000,3500,'Aundh',18.560,73.810,10,'Sun, 8 Jun','AGREED',
   false,210, ARRAY['https://images.unsplash.com/photo-1595348020949-87cdfbb44174?auto=format&fit=crop&w=400&q=70'],
   0,false,null,false,false,null),

  ('r5','u5','AC not cooling — need service',
   '1.5 ton split AC not cooling well. Probably needs gas refill and cleaning. Available after 6 PM.',
   'c-home-ac','AC Repair',400,1200,'Viman Nagar',18.567,73.916,8,'Tomorrow','OPEN',
   true,54, '{}', 0,false,null,false,false,null),

  ('r6','u6','Photographer for birthday party',
   '2-hour candid coverage for a kids birthday party at home this Sunday. Need edited photos within a week.',
   'c-pro-photo','Photographer',3000,5000,'Koregaon Park',18.536,73.893,12,'Sun, 8 Jun','OPEN',
   false,76, ARRAY['https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=400&q=70'],
   0,false,null,false,false,null),

  ('r7','u7','Alphonso mangoes — anyone want to split a box?',
   'Looking for a crate of fresh Ratnagiri Alphonso. If a few of us order together we get a bulk rate. Who''s in?',
   'c-retail-kirana','Kirana / Grocery',400,700,'Koregaon Park',18.536,73.893,3,'This weekend','OPEN',
   false,188, ARRAY['https://images.unsplash.com/photo-1605027990121-cbae9e0642df?auto=format&fit=crop&w=400&q=70'],
   7,true,10,false,false,20),

  ('r8','u8','Daily veg tiffin for one (weekdays)',
   'Need a home-style veg tiffin delivered every weekday around 1 PM. Less oil, more sabzi. Monthly basis.',
   'c-food-tiffin','Tiffin / Home Kitchen',2500,3500,'Kalyani Nagar',18.547,73.901,4,'Start Monday','OPEN',
   false,95, '{}', 2,false,null,false,true,48)
on conflict (id) do nothing;

-- ---------- proposals ----------
insert into public.proposals
  (id, request_id, responder_user_id, responder_type, responder_tagline,
   price, message, eta, status, is_boosted) values
  ('pr1','r1','u24','provider','Home Cook • 900 jobs done',750,
   'I can make a fresh 1kg chocolate truffle cake with custom message. Eggless option available!',
   'Deliver by Sat 5 PM','SUBMITTED',true),
  ('pr2','r1','u11','business','Café & Bakery • Verified',820,
   'Our signature red velvet, freshly baked. Free candles and a card included.',
   'Ready Sat morning','SUBMITTED',false),
  ('pr3','r1','u40','user','Home baker',690,
   'Customized buttercream cake, your choice of flavour. I deliver within 3km free.',
   'Sat afternoon','SUBMITTED',false),
  ('pr4','r2','u20','provider','Plumber • 480 jobs',350,
   'I can reach in 20 min. Will fix the joint and check the whole line.',
   'Within 30 min','SUBMITTED',false),
  ('pr5','r5','u25','provider','AC Repair • 720 jobs',650,
   'Service + gas top-up included. Can come tomorrow 6:30 PM.',
   'Tomorrow evening','SUBMITTED',false)
on conflict (id) do nothing;

-- ---------- agreements ----------
insert into public.agreements
  (id, request_id, request_title, proposal_id, requester_user_id, responder_user_id,
   agreed_price, terms, scheduled_for, requester_confirmed, responder_confirmed,
   payment_mode, status) values
  ('ag2','r2','Kitchen leak repair','pr4','u1','u20',350,
   'Fix kitchen sink pipe joint, check full line for leaks. Parts billed separately if needed.',
   'Today • 3:30 PM',true,true,'OFFLINE','ACTIVE'),
  ('ag3',null,'Sofa deep cleaning',null,'u1','u27',1200,
   '5-seater sofa shampoo + 1 carpet. Done at home.',
   'Mon, 2 Jun • 11:00 AM',true,true,'OFFLINE','COMPLETED')
on conflict (id) do nothing;
