-- ============================================================
-- STRYT live schema snapshot (logical, read from the catalog)
-- project:  gnswxlfmcwyhmzlfipql
-- taken:    2026-09-11T00:47:30.469Z
-- method:   scripts/snapshot-live-schema.mjs (Management API, read-only SELECTs)
-- backups:  pitr_enabled=false walg_enabled=true completed_backups=0 latest=none
-- NOT a pg_dump: no row data. Definitions are verbatim from pg_catalog.
-- ============================================================
-- ════════════════════════════════════════════════════════════
-- Extensions (8)
-- ════════════════════════════════════════════════════════════

-- pg_cron 1.6.4 (schema pg_catalog)

-- pg_net 0.20.3 (schema public)

-- pg_stat_statements 1.11 (schema extensions)

-- pgcrypto 1.3 (schema extensions)

-- plpgsql 1.0 (schema pg_catalog)

-- postgis 3.3.7 (schema public)

-- supabase_vault 0.3.1 (schema vault)

-- uuid-ossp 1.1 (schema extensions)


-- ════════════════════════════════════════════════════════════
-- Enum types (6)
-- ════════════════════════════════════════════════════════════

CREATE TYPE public.agreement_status AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'DISPUTED', 'DEPOSIT_PAID', 'IN_PROGRESS', 'REVIEW');

CREATE TYPE public.category_kind AS ENUM ('BUSINESS', 'SERVICE', 'BOTH');

CREATE TYPE public.entity_status AS ENUM ('DRAFT', 'PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'DELETED');

CREATE TYPE public.proposal_status AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

CREATE TYPE public.request_status AS ENUM ('OPEN', 'IN_PROGRESS', 'AGREED', 'COMPLETED', 'CANCELLED', 'EXPIRED');

CREATE TYPE public.stock_status AS ENUM ('IN_STOCK', 'OUT_OF_STOCK', 'LIMITED');


-- ════════════════════════════════════════════════════════════
-- Tables (90)
-- ════════════════════════════════════════════════════════════

CREATE TABLE public.account_appeals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  owner_user_id text NOT NULL,
  reason text NOT NULL,
  status text DEFAULT 'PENDING'::text NOT NULL,
  admin_note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at timestamp with time zone
);

CREATE TABLE public.admin_login_resolve_attempts (
  login_id text NOT NULL,
  fail_count integer DEFAULT 0 NOT NULL,
  locked_until timestamp with time zone,
  last_attempt_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.agreements (
  id text DEFAULT ('ag_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  request_id text,
  request_title text,
  proposal_id text,
  requester_user_id text,
  responder_user_id text,
  agreed_price integer NOT NULL,
  terms text,
  scheduled_for text,
  requester_confirmed boolean DEFAULT false,
  responder_confirmed boolean DEFAULT false,
  payment_mode text DEFAULT 'OFFLINE'::text,
  status agreement_status DEFAULT 'PENDING'::agreement_status,
  created_at timestamp with time zone DEFAULT now(),
  dispute_reason text,
  provider_lat double precision,
  provider_lng double precision,
  live_status text DEFAULT 'CONFIRMED'::text,
  tracking_token uuid,
  payment_status text DEFAULT 'UNPAID'::text NOT NULL,
  payment_method text,
  payment_amount integer,
  payment_reference text,
  responder_entity_id text,
  responder_type text
);

CREATE TABLE public.appointment_deliveries (
  id text DEFAULT ('del_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  appointment_id text NOT NULL,
  business_id text NOT NULL,
  agent_user_id text,
  status text DEFAULT 'ASSIGNED'::text NOT NULL,
  handoff_code text,
  handoff_verified boolean DEFAULT false NOT NULL,
  lat double precision,
  lng double precision,
  live_status text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  delivered_at timestamp with time zone,
  batch_id text,
  stop_order integer,
  cancelled_at timestamp with time zone,
  cancelled_by text,
  cancel_reason text,
  cancel_note text
);

CREATE TABLE public.appointment_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  appointment_id text NOT NULL,
  catalog_item_id text,
  item_name text NOT NULL,
  unit_price numeric DEFAULT 0 NOT NULL,
  quantity integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.appointments (
  id text DEFAULT ('apt_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  target_owner_user_id text NOT NULL,
  target_name text,
  target_avatar text,
  customer_user_id text NOT NULL,
  customer_name text,
  customer_avatar text,
  scheduled_for timestamp with time zone NOT NULL,
  date_label text,
  time_label text,
  notes text,
  photo_url text,
  package_id text,
  package_name text,
  package_price numeric,
  status text DEFAULT 'PENDING'::text NOT NULL,
  response_note text,
  created_at timestamp with time zone DEFAULT now(),
  payment_method text,
  payment_status text DEFAULT 'UNPAID'::text NOT NULL,
  payment_amount numeric(10,2),
  payment_reference text,
  cancelled_by text,
  is_walk_in boolean DEFAULT false NOT NULL,
  rescheduled_from text,
  fulfillment_type text DEFAULT 'IN_STORE'::text NOT NULL,
  delivery_address_line text,
  delivery_lat double precision,
  delivery_lng double precision,
  requested_delivery_window text,
  delivery_eta_text text,
  party_size integer DEFAULT 1 NOT NULL,
  target_package_key text,
  is_out_of_range boolean DEFAULT false
);

CREATE TABLE public.blocked_slots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  target_owner_user_id text NOT NULL,
  date date,
  weekday integer,
  time_label text,
  reason text,
  recurring boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.bookmarks (
  id text DEFAULT ('bm_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  user_id text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.boosts (
  id text DEFAULT ('bo_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  boost_type text NOT NULL,
  starts_at timestamp with time zone DEFAULT now(),
  ends_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.bug_reports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id text,
  description text NOT NULL,
  status text DEFAULT 'OPEN'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  reporter_role text
);

CREATE TABLE public.bulk_deal_pledges (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  deal_id text NOT NULL,
  user_id text NOT NULL,
  quantity integer DEFAULT 1 NOT NULL,
  notes text,
  delivery_address text,
  deposit_method text,
  deposit_status text DEFAULT 'UNPAID'::text NOT NULL,
  deposit_amount numeric(10,2),
  deposit_reference text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.bulk_deal_tokens (
  id text DEFAULT ('bdt_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  token_code text NOT NULL,
  deal_id text NOT NULL,
  holder_user_id text NOT NULL,
  issuer_user_id text NOT NULL,
  business_id text,
  quantity integer DEFAULT 1 NOT NULL,
  unit_price numeric(10,2),
  item_label text,
  status text DEFAULT 'ISSUED'::text NOT NULL,
  redeemed_at timestamp with time zone,
  redeemed_by text,
  valid_until timestamp with time zone,
  pickup_pin text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  deposit_paid numeric(10,2) DEFAULT 0,
  balance_due numeric(10,2) DEFAULT 0
);

CREATE TABLE public.bulk_deals (
  id text DEFAULT ('bd_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  business_id text NOT NULL,
  owner_user_id text NOT NULL,
  catalog_item_id text,
  title text NOT NULL,
  description text,
  image text,
  regular_price numeric(10,2) NOT NULL,
  moq integer DEFAULT 1 NOT NULL,
  tiers jsonb DEFAULT '[]'::jsonb NOT NULL,
  available_quota integer,
  status entity_status DEFAULT 'ACTIVE'::entity_status NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  deposit_amount numeric(10,2),
  closes_at timestamp with time zone,
  pledged_quantity integer DEFAULT 0 NOT NULL,
  closed_at timestamp with time zone,
  close_outcome text,
  fulfillment_type text
);

CREATE TABLE public.business_access_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  business_id text NOT NULL,
  grantee_user_id text NOT NULL,
  status text DEFAULT 'PENDING'::text NOT NULL,
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  decided_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_ip text,
  access_level text DEFAULT 'FULL'::text NOT NULL,
  scopes text[] DEFAULT '{}'::text[] NOT NULL
);

CREATE TABLE public.business_login_attempts (
  login_id text NOT NULL,
  attempted_by text NOT NULL,
  fail_count integer DEFAULT 0 NOT NULL,
  locked_until timestamp with time zone,
  last_attempt_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.business_login_credentials (
  business_id text NOT NULL,
  login_id text NOT NULL,
  password_hash text NOT NULL,
  require_approval boolean DEFAULT true NOT NULL,
  session_hours integer DEFAULT 8 NOT NULL,
  is_enabled boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.business_packages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  business_id text NOT NULL,
  name text NOT NULL,
  "desc" text DEFAULT ''::text NOT NULL,
  price numeric(10,2) NOT NULL,
  duration text DEFAULT ''::text NOT NULL,
  instant_book boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.business_portfolio_items (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  business_id text NOT NULL,
  url text NOT NULL,
  caption text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.business_qna (
  id text DEFAULT ('qna_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  business_id text NOT NULL,
  asker_user_id text NOT NULL,
  question text NOT NULL,
  answer text,
  answered_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  upvotes integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.business_team_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  business_id text NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  avatar text DEFAULT ''::text NOT NULL,
  role text DEFAULT 'STAFF'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.business_view_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  business_id text NOT NULL,
  viewed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.businesses (
  id text DEFAULT ('b_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  owner_user_id text,
  name text NOT NULL,
  slug text,
  category_id text,
  category_name text,
  sub_category text,
  description text,
  address_line1 text,
  city text,
  pincode text,
  lat double precision,
  lng double precision,
  geom geography(Point,4326),
  phone text,
  whatsapp text,
  hours text,
  is_open_now boolean DEFAULT false,
  opening_date date,
  is_new boolean DEFAULT false,
  status entity_status DEFAULT 'PENDING'::entity_status,
  cover_image text,
  gallery text[] DEFAULT '{}'::text[],
  rating_avg numeric(2,1) DEFAULT 0,
  rating_count integer DEFAULT 0,
  view_count integer DEFAULT 0,
  is_featured boolean DEFAULT false,
  is_verified boolean DEFAULT false,
  tags text[] DEFAULT '{}'::text[],
  price_for_two integer,
  delivery_time text,
  offer_text text,
  created_at timestamp with time zone DEFAULT now(),
  call_count integer DEFAULT 0,
  directions_count integer DEFAULT 0,
  is_boosted boolean DEFAULT false,
  boosted_until timestamp with time zone,
  rejection_reason text,
  verification_status text DEFAULT 'NONE'::text,
  verification_document_url text,
  broadcast_radius integer DEFAULT 5 NOT NULL,
  broadcast_radius_km integer DEFAULT 5,
  pro_until timestamp with time zone,
  lead_credits integer DEFAULT 0 NOT NULL,
  aadhaar_doc_url text,
  pan_doc_url text,
  owner_enabled boolean DEFAULT true NOT NULL,
  disabled_at timestamp with time zone,
  deleted_at timestamp with time zone,
  is_available_now boolean,
  available_until timestamp with time zone,
  upi_id text,
  email text,
  show_phone_publicly boolean DEFAULT true,
  show_email_publicly boolean DEFAULT false,
  location_public boolean DEFAULT false,
  payment_timing text DEFAULT 'AT_APPOINTMENT'::text NOT NULL,
  boost_reminder_sent boolean DEFAULT false NOT NULL,
  verification_reason text,
  verification_reviewed_at timestamp with time zone,
  verification_reviewed_by text,
  verification_documents text[] DEFAULT '{}'::text[] NOT NULL,
  pending_lat double precision,
  pending_lng double precision,
  location_review_status text DEFAULT 'NONE'::text NOT NULL,
  pending_location_requested_at timestamp with time zone,
  deposit_percent integer DEFAULT 0 NOT NULL,
  delivery_enabled boolean DEFAULT false NOT NULL,
  default_slot_capacity integer DEFAULT 1 NOT NULL,
  max_concurrent_bookings integer,
  special_hours jsonb,
  package_key text,
  bookings_enabled boolean
);

CREATE TABLE public.catalog_items (
  id text DEFAULT ('ci_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  business_id text,
  name text NOT NULL,
  description text,
  price integer NOT NULL,
  sale_price integer,
  image text,
  stock_status stock_status DEFAULT 'IN_STOCK'::stock_status,
  is_veg boolean,
  best_seller boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  provider_id text,
  is_food boolean DEFAULT false NOT NULL,
  inventory_type text DEFAULT 'INFINITE'::text NOT NULL,
  quantity integer,
  slot_capacity integer,
  max_party_size integer DEFAULT 1 NOT NULL
);

CREATE TABLE public.categories (
  id text NOT NULL,
  parent_id text,
  name text NOT NULL,
  slug text NOT NULL,
  kind category_kind NOT NULL,
  icon text,
  color text,
  status entity_status DEFAULT 'PENDING'::entity_status,
  rejection_reason text,
  package_key text
);

CREATE TABLE public.client_errors (
  id text DEFAULT ('err_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  user_id text DEFAULT (auth.uid())::text,
  kind text NOT NULL,
  message text,
  stack text,
  url text,
  user_agent text,
  app_version text,
  context jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.comment_reactions (
  comment_id text NOT NULL,
  user_id text NOT NULL,
  emoji text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.community_posts (
  id text DEFAULT ('cm_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  author_user_id text,
  author_name text DEFAULT 'Neighbor'::text NOT NULL,
  author_avatar text DEFAULT ''::text,
  type text NOT NULL,
  title text NOT NULL,
  body text DEFAULT ''::text,
  area text DEFAULT ''::text,
  image text,
  likes_count integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  poll_options jsonb,
  recommendations jsonb,
  resolved boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  lat double precision,
  lng double precision,
  geom geography(Point,4326),
  author_type text DEFAULT 'user'::text NOT NULL,
  author_ref_id text,
  allow_comments boolean DEFAULT false NOT NULL,
  comment_policy text NOT NULL,
  hide_like_count boolean DEFAULT false NOT NULL,
  media text[] DEFAULT '{}'::text[] NOT NULL,
  image_alt text,
  poll_ends_at timestamp with time zone,
  severity text,
  expires_at timestamp with time zone,
  last_seen text,
  reward text,
  pickup_note text,
  tagged_listing jsonb,
  poll_ended_notified_at timestamp with time zone,
  show_on_profile boolean DEFAULT true NOT NULL
);

CREATE TABLE public.conversations (
  id text DEFAULT ('cv_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  participant_a text NOT NULL,
  participant_b text NOT NULL,
  last_message_at timestamp with time zone DEFAULT now(),
  last_message_preview text DEFAULT ''::text,
  has_unread_a boolean DEFAULT false,
  has_unread_b boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  subject_type text,
  subject_id text,
  subject_name text,
  subject_avatar text,
  subject_owner_id text,
  last_read_at_a timestamp with time zone,
  last_read_at_b timestamp with time zone
);

CREATE TABLE public.custom_payments (
  id text DEFAULT ('cp_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  target_owner_user_id text NOT NULL,
  target_name text,
  payer_user_id text NOT NULL,
  payer_name text,
  payer_avatar text,
  amount numeric(10,2) NOT NULL,
  method text NOT NULL,
  status text DEFAULT 'PENDING_CONFIRM'::text NOT NULL,
  reference text,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  confirmed_at timestamp with time zone
);

CREATE TABLE public.delivery_agent_duty (
  user_id text NOT NULL,
  on_duty boolean DEFAULT true NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.delivery_batches (
  id text DEFAULT ('batch_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  business_id text NOT NULL,
  agent_user_id text NOT NULL,
  status text DEFAULT 'PENDING_ACCEPTANCE'::text NOT NULL,
  lat double precision,
  lng double precision,
  accuracy double precision,
  heading double precision,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  accepted_at timestamp with time zone,
  completed_at timestamp with time zone
);

CREATE TABLE public.emergency_contacts (
  id text DEFAULT ('ec_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  owner_user_id text NOT NULL,
  contact_user_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.endorsements (
  id text DEFAULT ('en_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  from_user_id text NOT NULL,
  provider_id text NOT NULL,
  skill text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.entity_password_attempts (
  owner_user_id text NOT NULL,
  kind text NOT NULL,
  fail_count integer DEFAULT 0 NOT NULL,
  locked_until timestamp with time zone,
  last_attempt_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.entity_recovery_attempts (
  owner_user_id text NOT NULL,
  kind text NOT NULL,
  fail_count integer DEFAULT 0 NOT NULL,
  locked_until timestamp with time zone,
  last_attempt_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.fcm_tokens (
  user_id text NOT NULL,
  token text NOT NULL,
  platform text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.follows (
  id text DEFAULT ('f_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  follower_user_id text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.gate_passes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  society_id uuid NOT NULL,
  provider_user_id text NOT NULL,
  issued_by_user_id text NOT NULL,
  purpose text DEFAULT ''::text NOT NULL,
  valid_from timestamp with time zone DEFAULT now() NOT NULL,
  valid_until timestamp with time zone NOT NULL,
  status text DEFAULT 'ACTIVE'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.group_buy_tokens (
  id text DEFAULT ('gt_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  token_code text NOT NULL,
  agreement_id text NOT NULL,
  request_id text NOT NULL,
  holder_user_id text NOT NULL,
  issuer_user_id text NOT NULL,
  business_id text,
  quantity integer DEFAULT 1 NOT NULL,
  unit_price numeric(10,2),
  item_label text,
  status text DEFAULT 'ISSUED'::text NOT NULL,
  redeemed_at timestamp with time zone,
  redeemed_by text,
  valid_until timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  pickup_pin text
);

CREATE TABLE public.handoff_attempts (
  delivery_id text NOT NULL,
  fail_count integer DEFAULT 0 NOT NULL,
  locked_until timestamp with time zone,
  last_attempt_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.leaderboard_points (
  user_id text NOT NULL,
  points integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.leads (
  id text DEFAULT ('ld_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  business_id text,
  provider_id text,
  from_user_id text,
  kind text NOT NULL,
  note text DEFAULT ''::text,
  handled boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.live_share_recipients (
  share_id text NOT NULL,
  recipient_user_id text NOT NULL,
  conversation_id text,
  message_id text
);

CREATE TABLE public.live_shares (
  id text DEFAULT ('ls_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  sharer_user_id text NOT NULL,
  status text DEFAULT 'ACTIVE'::text NOT NULL,
  lat double precision,
  lng double precision,
  accuracy double precision,
  heading double precision,
  started_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  ended_at timestamp with time zone,
  expires_at timestamp with time zone DEFAULT (now() + '08:00:00'::interval) NOT NULL
);

CREATE TABLE public.location_share_grants (
  id text DEFAULT ('lsg_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  owner_user_id text NOT NULL,
  requester_user_id text NOT NULL,
  status text DEFAULT 'PENDING'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone
);

CREATE TABLE public.loyalty_cards (
  id text DEFAULT ('lc_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  business_id text NOT NULL,
  target integer DEFAULT 10 NOT NULL,
  reward text DEFAULT 'Free item'::text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.messages (
  id text DEFAULT ('msg_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  conversation_id text NOT NULL,
  sender_id text NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  image_url text,
  kind text DEFAULT 'TEXT'::text,
  meta jsonb
);

CREATE TABLE public.notifications (
  id text DEFAULT ('n_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  user_id text NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text DEFAULT ''::text NOT NULL,
  deep_link text DEFAULT '/home'::text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  entity_type text,
  entity_id text,
  metadata jsonb
);

CREATE TABLE public.offers (
  id text DEFAULT ('o_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  business_id text,
  title text NOT NULL,
  description text,
  code text,
  valid_until date,
  is_active boolean DEFAULT true
);

CREATE TABLE public.payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  agreement_id text NOT NULL,
  payer_user_id text NOT NULL,
  razorpay_order_id text NOT NULL,
  razorpay_payment_id text,
  razorpay_signature text,
  amount integer NOT NULL,
  currency text DEFAULT 'INR'::text NOT NULL,
  status text DEFAULT 'CREATED'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  escrow_status text DEFAULT 'PENDING'::text NOT NULL
);

CREATE TABLE public.places (
  id text DEFAULT ('pl_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  submitted_by_user_id text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  address_line1 text,
  city text,
  lat double precision,
  lng double precision,
  geom geography(Point,4326),
  cover_image text,
  gallery text[] DEFAULT '{}'::text[] NOT NULL,
  status entity_status DEFAULT 'PENDING'::entity_status NOT NULL,
  rejection_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  best_time_to_visit text,
  entry_fee text,
  opening_hours text,
  visit_duration text,
  difficulty text,
  how_to_reach text,
  parking_info text,
  distance_from_city_km numeric(5,1),
  safety_tips text,
  weather_note text
);

CREATE TABLE public.poll_votes (
  post_id text NOT NULL,
  user_id text NOT NULL,
  option_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.portfolio_items (
  id text DEFAULT ('pp_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  provider_id text,
  url text NOT NULL,
  caption text,
  sort_order integer DEFAULT 0
);

CREATE TABLE public.post_comments (
  id text DEFAULT ('pc_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  post_id text NOT NULL,
  author_user_id text,
  author_name text DEFAULT 'Neighbor'::text NOT NULL,
  author_avatar text DEFAULT ''::text,
  body text NOT NULL,
  listing_type text,
  listing_id text,
  created_at timestamp with time zone DEFAULT now(),
  shared_phone text,
  phone_visibility text,
  parent_id text,
  mentions jsonb DEFAULT '[]'::jsonb NOT NULL,
  pinned_at timestamp with time zone,
  edited_at timestamp with time zone
);

CREATE TABLE public.post_likes (
  post_id text NOT NULL,
  user_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.post_saves (
  post_id text NOT NULL,
  user_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.pro_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  user_id text NOT NULL,
  plan text NOT NULL,
  amount integer NOT NULL,
  razorpay_order_id text,
  razorpay_payment_id text,
  status text DEFAULT 'PENDING'::text NOT NULL,
  valid_until timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.profile_deletion_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  reason text,
  status text DEFAULT 'PENDING'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.proposal_counters (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  proposal_id text NOT NULL,
  by_user_id text NOT NULL,
  amount numeric NOT NULL,
  message text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.proposals (
  id text DEFAULT ('pr_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  request_id text,
  responder_user_id text,
  responder_type text,
  responder_tagline text,
  price integer NOT NULL,
  message text,
  eta text,
  status proposal_status DEFAULT 'SUBMITTED'::proposal_status,
  is_boosted boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  responder_name text,
  responder_avatar text,
  broadcast_to_metoo boolean DEFAULT false NOT NULL,
  responder_entity_id text
);

CREATE TABLE public.provider_packages (
  id text DEFAULT ('pk_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  provider_id text NOT NULL,
  name text NOT NULL,
  description text DEFAULT ''::text NOT NULL,
  price integer NOT NULL,
  duration text DEFAULT ''::text NOT NULL,
  instant_book boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.provider_view_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider_id text NOT NULL,
  viewed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.providers (
  id text DEFAULT ('p_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  user_id text,
  display_name text NOT NULL,
  category_id text,
  category_name text,
  sub_category text,
  bio text,
  avatar text,
  lat double precision,
  lng double precision,
  geom geography(Point,4326),
  service_radius_km integer DEFAULT 5,
  starting_price integer,
  availability_note text,
  status entity_status DEFAULT 'PENDING'::entity_status,
  is_verified boolean DEFAULT false,
  rating_avg numeric(2,1) DEFAULT 0,
  rating_count integer DEFAULT 0,
  jobs_done integer DEFAULT 0,
  response_time text,
  is_new boolean DEFAULT false,
  skills text[] DEFAULT '{}'::text[],
  phone text,
  created_at timestamp with time zone DEFAULT now(),
  is_available_now boolean DEFAULT false,
  available_until timestamp with time zone,
  view_count integer DEFAULT 0,
  rejection_reason text,
  verification_status text DEFAULT 'NONE'::text,
  verification_document_url text,
  lead_credits integer DEFAULT 0 NOT NULL,
  owner_enabled boolean DEFAULT true NOT NULL,
  disabled_at timestamp with time zone,
  deleted_at timestamp with time zone,
  email text,
  upi_id text,
  show_phone_publicly boolean DEFAULT true,
  show_email_publicly boolean DEFAULT false,
  location_public boolean DEFAULT false,
  payment_timing text DEFAULT 'AT_APPOINTMENT'::text NOT NULL,
  boost_reminder_sent boolean DEFAULT false NOT NULL,
  verification_reason text,
  verification_reviewed_at timestamp with time zone,
  verification_reviewed_by text,
  verification_documents text[] DEFAULT '{}'::text[] NOT NULL,
  deposit_percent integer DEFAULT 0 NOT NULL,
  is_open_now boolean DEFAULT true,
  package_key text,
  bookings_enabled boolean,
  upi_qr_url text
);

CREATE TABLE public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id text NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.qna_upvotes (
  id text DEFAULT ('qu_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  qna_id text NOT NULL,
  user_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.queue_settings (
  business_id text NOT NULL,
  is_open boolean DEFAULT false NOT NULL,
  avg_service_min integer DEFAULT 8 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  last_activity_at timestamp with time zone DEFAULT now(),
  line_changed_at timestamp with time zone
);

CREATE TABLE public.queue_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  business_id text NOT NULL,
  customer_user_id text,
  customer_name text DEFAULT 'Guest'::text NOT NULL,
  party_size text DEFAULT '1 person'::text NOT NULL,
  status text DEFAULT 'WAITING'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  payment_status text DEFAULT 'UNPAID'::text NOT NULL,
  payment_method text,
  payment_amount integer,
  payment_reference text,
  arrived_at timestamp with time zone,
  closed_reason text
);

CREATE TABLE public.ratings (
  id text DEFAULT ('rv_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  rater_user_id text,
  ratee_type text NOT NULL,
  ratee_id text NOT NULL,
  rating integer NOT NULL,
  comment text,
  tip integer,
  created_at timestamp with time zone DEFAULT now(),
  is_verified_booking boolean DEFAULT false NOT NULL,
  agreement_id text,
  owner_reply text,
  owner_reply_at timestamp with time zone
);

CREATE TABLE public.reports (
  id text DEFAULT ('rp_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  target_name text NOT NULL,
  reason text NOT NULL,
  details text DEFAULT ''::text,
  reporter_user_id text,
  status text DEFAULT 'OPEN'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.request_me_toos (
  request_id text NOT NULL,
  user_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  quantity integer DEFAULT 1 NOT NULL,
  notes text,
  delivery_address text
);

CREATE TABLE public.requests (
  id text DEFAULT ('r_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  requester_user_id text,
  title text NOT NULL,
  description text,
  category_id text,
  category_name text,
  budget_min integer,
  budget_max integer,
  area text,
  lat double precision,
  lng double precision,
  geom geography(Point,4326),
  radius_km integer DEFAULT 5,
  deadline text,
  status request_status DEFAULT 'OPEN'::request_status,
  is_boosted boolean DEFAULT false,
  view_count integer DEFAULT 0,
  photos text[] DEFAULT '{}'::text[],
  me_too_count integer DEFAULT 0,
  is_group_buy boolean DEFAULT false,
  group_buy_target integer,
  is_urgent boolean DEFAULT false,
  is_recurring boolean DEFAULT false,
  is_anonymous boolean DEFAULT false,
  expires_in_hrs integer,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  sub_category text,
  proposal_count integer DEFAULT 0 NOT NULL,
  bulk_price_per_unit numeric(10,2),
  fulfillment_type text,
  group_agreement_id text
);

CREATE TABLE public.saved_searches (
  id text DEFAULT ('ss_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  user_id text NOT NULL,
  query text NOT NULL,
  lat double precision,
  lng double precision,
  radius_km numeric DEFAULT 5 NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.settlements (
  id text DEFAULT ('stl_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  agreement_id text NOT NULL,
  user_id text NOT NULL,
  with_user_id text NOT NULL,
  amount integer DEFAULT 0 NOT NULL,
  mode text DEFAULT 'CASH'::text NOT NULL,
  note text DEFAULT ''::text NOT NULL,
  tip integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.societies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  address text DEFAULT ''::text NOT NULL,
  city text DEFAULT ''::text NOT NULL,
  pincode text DEFAULT ''::text NOT NULL,
  lat double precision,
  lng double precision,
  unit_count integer DEFAULT 0,
  join_code text DEFAULT upper(substr(md5((random())::text), 1, 6)) NOT NULL,
  admin_user_id text,
  verified boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.society_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  society_id uuid NOT NULL,
  user_id text NOT NULL,
  unit_number text DEFAULT ''::text NOT NULL,
  role text DEFAULT 'RESIDENT'::text NOT NULL,
  approved boolean DEFAULT false,
  joined_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.stories (
  id text DEFAULT ('st_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  owner_type text NOT NULL,
  owner_id text NOT NULL,
  author_name text NOT NULL,
  author_avatar text DEFAULT ''::text NOT NULL,
  image_url text NOT NULL,
  caption text DEFAULT ''::text NOT NULL,
  cta text DEFAULT 'None'::text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  user_id text,
  lat double precision,
  lng double precision,
  geom geography(Point,4326),
  visibility text DEFAULT 'everyone'::text NOT NULL,
  allowed_user_ids text[] DEFAULT '{}'::text[],
  hidden_user_ids text[] DEFAULT '{}'::text[],
  is_highlighted boolean DEFAULT false NOT NULL
);

CREATE TABLE public.story_views (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  story_id text NOT NULL,
  viewer_user_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  reaction text
);

CREATE TABLE public.subscription_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  subscription_id uuid NOT NULL,
  log_date date DEFAULT CURRENT_DATE NOT NULL,
  status text DEFAULT 'PRESENT'::text NOT NULL,
  note text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  requester_user_id text NOT NULL,
  provider_user_id text NOT NULL,
  provider_name text DEFAULT ''::text NOT NULL,
  provider_avatar text DEFAULT ''::text NOT NULL,
  title text NOT NULL,
  description text DEFAULT ''::text NOT NULL,
  frequency text DEFAULT 'DAILY'::text NOT NULL,
  price_per_period integer DEFAULT 0 NOT NULL,
  status text DEFAULT 'ACTIVE'::text NOT NULL,
  start_date date DEFAULT CURRENT_DATE NOT NULL,
  next_due date,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.support_tickets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id text,
  category text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  status text DEFAULT 'OPEN'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.switch_pin_attempts (
  user_id text NOT NULL,
  fail_count integer DEFAULT 0 NOT NULL,
  locked_until timestamp with time zone,
  last_attempt_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.terms_acceptances (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id text NOT NULL,
  version text NOT NULL,
  accepted_at timestamp with time zone DEFAULT now() NOT NULL,
  user_agent text
);

CREATE TABLE public.tracking_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  agreement_id text,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  appointment_id text
);

CREATE TABLE public.user_blocks (
  blocker_user_id text NOT NULL,
  blocked_user_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_list_items (
  id text DEFAULT ('sli_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  list_id text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.user_lists (
  id text DEFAULT ('sl_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  user_id text NOT NULL,
  name text NOT NULL,
  emoji text DEFAULT '🌟'::text NOT NULL,
  shared boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.user_saved_coupons (
  id text DEFAULT ('uco_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  user_id text NOT NULL,
  offer_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.user_stamps (
  id text DEFAULT ('us_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  user_id text NOT NULL,
  card_id text NOT NULL,
  stamps integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.users (
  id text NOT NULL,
  name text NOT NULL,
  phone text,
  avatar text,
  roles text[] DEFAULT '{customer}'::text[] NOT NULL,
  area text,
  city text,
  rating_avg numeric(2,1) DEFAULT 0,
  rating_count integer DEFAULT 0,
  language text DEFAULT 'en'::text,
  notification_radius_km integer DEFAULT 5,
  created_at timestamp with time zone DEFAULT now(),
  lat double precision,
  lng double precision,
  society_id uuid,
  unit_number text,
  alias text,
  customer_enabled boolean DEFAULT true NOT NULL,
  customer_deleted_at timestamp with time zone,
  show_posts_publicly boolean DEFAULT true,
  show_asks_publicly boolean DEFAULT true,
  show_badges_publicly boolean DEFAULT true,
  show_phone_publicly boolean DEFAULT true,
  show_city_publicly boolean DEFAULT true,
  show_rating_publicly boolean DEFAULT true,
  admin_login_id text,
  email text,
  show_email_publicly boolean DEFAULT false,
  location_public boolean DEFAULT false,
  onboarding_completed_at timestamp with time zone,
  show_name_publicly boolean DEFAULT false,
  switch_pin_hash text,
  terms_accepted_version text,
  terms_accepted_at timestamp with time zone,
  business_password_hash text,
  provider_password_hash text,
  business_recovery_question_id text,
  business_recovery_question_text text,
  business_recovery_answer_hash text,
  provider_recovery_question_id text,
  provider_recovery_question_text text,
  provider_recovery_answer_hash text,
  notif_new_business boolean DEFAULT true NOT NULL,
  notif_nearby_requests boolean DEFAULT true NOT NULL,
  notif_offers boolean DEFAULT true NOT NULL,
  notif_silent boolean DEFAULT false NOT NULL,
  notif_quiet_hours boolean DEFAULT false NOT NULL,
  timezone text,
  interest_category_ids text[],
  notif_nearby_alerts boolean DEFAULT true NOT NULL
);

CREATE TABLE public.vouches (
  id text DEFAULT ('vc_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  from_user_id text NOT NULL,
  provider_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);


-- ════════════════════════════════════════════════════════════
-- Constraints (328)
-- ════════════════════════════════════════════════════════════

ALTER TABLE ONLY account_appeals ADD CONSTRAINT account_appeals_entity_type_check CHECK ((entity_type = ANY (ARRAY['BUSINESS'::text, 'PROVIDER'::text])));

ALTER TABLE ONLY account_appeals ADD CONSTRAINT account_appeals_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text])));

ALTER TABLE ONLY account_appeals ADD CONSTRAINT account_appeals_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES users(id);

ALTER TABLE ONLY account_appeals ADD CONSTRAINT account_appeals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY admin_login_resolve_attempts ADD CONSTRAINT admin_login_resolve_attempts_pkey PRIMARY KEY (login_id);

ALTER TABLE ONLY agreements ADD CONSTRAINT agreements_request_id_fkey FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL;

ALTER TABLE ONLY agreements ADD CONSTRAINT agreements_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES users(id);

ALTER TABLE ONLY agreements ADD CONSTRAINT agreements_responder_user_id_fkey FOREIGN KEY (responder_user_id) REFERENCES users(id);

ALTER TABLE ONLY agreements ADD CONSTRAINT agreements_tracking_token_fkey FOREIGN KEY (tracking_token) REFERENCES tracking_tokens(id);

ALTER TABLE ONLY agreements ADD CONSTRAINT agreements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY appointment_deliveries ADD CONSTRAINT appointment_deliveries_cancel_reason_check CHECK (((cancel_reason IS NULL) OR (cancel_reason = ANY (ARRAY['CUSTOMER_UNAVAILABLE'::text, 'ADDRESS_PROBLEM'::text, 'CUSTOMER_REFUSED'::text, 'UNSAFE'::text, 'AGENT_EMERGENCY'::text, 'OTHER'::text]))));

ALTER TABLE ONLY appointment_deliveries ADD CONSTRAINT appointment_deliveries_cancelled_by_check CHECK (((cancelled_by IS NULL) OR (cancelled_by = ANY (ARRAY['AGENT'::text, 'BUSINESS'::text]))));

ALTER TABLE ONLY appointment_deliveries ADD CONSTRAINT appointment_deliveries_live_status_check CHECK (((live_status IS NULL) OR (live_status = ANY (ARRAY['LEAVING'::text, 'ON_THE_WAY'::text, 'ARRIVED'::text, 'DONE'::text]))));

ALTER TABLE ONLY appointment_deliveries ADD CONSTRAINT appointment_deliveries_status_check CHECK ((status = ANY (ARRAY['ASSIGNED'::text, 'EN_ROUTE'::text, 'ARRIVED'::text, 'DELIVERED'::text, 'CANCELLED'::text])));

ALTER TABLE ONLY appointment_deliveries ADD CONSTRAINT appointment_deliveries_agent_user_id_fkey FOREIGN KEY (agent_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY appointment_deliveries ADD CONSTRAINT appointment_deliveries_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;

ALTER TABLE ONLY appointment_deliveries ADD CONSTRAINT appointment_deliveries_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES delivery_batches(id) ON DELETE SET NULL;

ALTER TABLE ONLY appointment_deliveries ADD CONSTRAINT appointment_deliveries_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE ONLY appointment_deliveries ADD CONSTRAINT appointment_deliveries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY appointment_items ADD CONSTRAINT appointment_items_quantity_check CHECK ((quantity > 0));

ALTER TABLE ONLY appointment_items ADD CONSTRAINT appointment_items_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;

ALTER TABLE ONLY appointment_items ADD CONSTRAINT appointment_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY appointments ADD CONSTRAINT appointments_cancelled_by_check CHECK ((cancelled_by = ANY (ARRAY['CUSTOMER'::text, 'OWNER'::text, 'SYSTEM'::text])));

ALTER TABLE ONLY appointments ADD CONSTRAINT appointments_fulfillment_type_check CHECK ((fulfillment_type = ANY (ARRAY['IN_STORE'::text, 'DELIVERY'::text])));

ALTER TABLE ONLY appointments ADD CONSTRAINT appointments_party_size_positive CHECK ((party_size >= 1));

ALTER TABLE ONLY appointments ADD CONSTRAINT appointments_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACCEPTED'::text, 'REJECTED'::text, 'COMPLETED'::text, 'CANCELLED'::text, 'NO_SHOW'::text])));

ALTER TABLE ONLY appointments ADD CONSTRAINT appointments_target_package_key_check CHECK (((target_package_key IS NULL) OR (target_package_key = ANY (ARRAY['clinic'::text, 'diagnostics'::text, 'vet'::text, 'pharmacy'::text, 'dining'::text, 'takeaway'::text, 'salon'::text, 'shop'::text, 'homeservice'::text, 'learning'::text, 'fitness'::text, 'professional'::text, 'events'::text, 'generic'::text]))));

ALTER TABLE ONLY appointments ADD CONSTRAINT appointments_target_type_check CHECK ((target_type = ANY (ARRAY['BUSINESS'::text, 'PROVIDER'::text])));

ALTER TABLE ONLY appointments ADD CONSTRAINT appointments_customer_user_id_fkey FOREIGN KEY (customer_user_id) REFERENCES users(id);

ALTER TABLE ONLY appointments ADD CONSTRAINT appointments_rescheduled_from_fkey FOREIGN KEY (rescheduled_from) REFERENCES appointments(id);

ALTER TABLE ONLY appointments ADD CONSTRAINT appointments_target_owner_user_id_fkey FOREIGN KEY (target_owner_user_id) REFERENCES users(id);

ALTER TABLE ONLY appointments ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY blocked_slots ADD CONSTRAINT blocked_slots_date_or_weekday CHECK ((((recurring = false) AND (date IS NOT NULL) AND (weekday IS NULL)) OR ((recurring = true) AND (weekday IS NOT NULL) AND (date IS NULL))));

ALTER TABLE ONLY blocked_slots ADD CONSTRAINT blocked_slots_target_type_check CHECK ((target_type = ANY (ARRAY['BUSINESS'::text, 'PROVIDER'::text])));

ALTER TABLE ONLY blocked_slots ADD CONSTRAINT blocked_slots_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)));

ALTER TABLE ONLY blocked_slots ADD CONSTRAINT blocked_slots_target_owner_user_id_fkey FOREIGN KEY (target_owner_user_id) REFERENCES users(id);

ALTER TABLE ONLY blocked_slots ADD CONSTRAINT blocked_slots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY bookmarks ADD CONSTRAINT bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY bookmarks ADD CONSTRAINT bookmarks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY bookmarks ADD CONSTRAINT bookmarks_user_id_target_type_target_id_key UNIQUE (user_id, target_type, target_id);

ALTER TABLE ONLY boosts ADD CONSTRAINT boosts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY bug_reports ADD CONSTRAINT bug_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE ONLY bug_reports ADD CONSTRAINT bug_reports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY bulk_deal_pledges ADD CONSTRAINT bulk_deal_pledges_deposit_method_check CHECK ((deposit_method = ANY (ARRAY['UPI'::text, 'CASH'::text])));

ALTER TABLE ONLY bulk_deal_pledges ADD CONSTRAINT bulk_deal_pledges_deposit_status_check CHECK ((deposit_status = ANY (ARRAY['UNPAID'::text, 'PENDING_CONFIRM'::text, 'PAID'::text, 'REJECTED'::text])));

ALTER TABLE ONLY bulk_deal_pledges ADD CONSTRAINT bulk_deal_pledges_quantity_check CHECK ((quantity > 0));

ALTER TABLE ONLY bulk_deal_pledges ADD CONSTRAINT bulk_deal_pledges_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES bulk_deals(id) ON DELETE CASCADE;

ALTER TABLE ONLY bulk_deal_pledges ADD CONSTRAINT bulk_deal_pledges_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY bulk_deal_pledges ADD CONSTRAINT bulk_deal_pledges_pkey PRIMARY KEY (id);

ALTER TABLE ONLY bulk_deal_pledges ADD CONSTRAINT bulk_deal_pledges_deal_id_user_id_key UNIQUE (deal_id, user_id);

ALTER TABLE ONLY bulk_deal_tokens ADD CONSTRAINT bulk_deal_tokens_quantity_check CHECK ((quantity > 0));

ALTER TABLE ONLY bulk_deal_tokens ADD CONSTRAINT bulk_deal_tokens_status_check CHECK ((status = ANY (ARRAY['ISSUED'::text, 'REDEEMED'::text, 'EXPIRED'::text])));

ALTER TABLE ONLY bulk_deal_tokens ADD CONSTRAINT bulk_deal_tokens_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id);

ALTER TABLE ONLY bulk_deal_tokens ADD CONSTRAINT bulk_deal_tokens_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES bulk_deals(id) ON DELETE CASCADE;

ALTER TABLE ONLY bulk_deal_tokens ADD CONSTRAINT bulk_deal_tokens_holder_user_id_fkey FOREIGN KEY (holder_user_id) REFERENCES users(id);

ALTER TABLE ONLY bulk_deal_tokens ADD CONSTRAINT bulk_deal_tokens_issuer_user_id_fkey FOREIGN KEY (issuer_user_id) REFERENCES users(id);

ALTER TABLE ONLY bulk_deal_tokens ADD CONSTRAINT bulk_deal_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY bulk_deal_tokens ADD CONSTRAINT bulk_deal_tokens_token_code_key UNIQUE (token_code);

ALTER TABLE ONLY bulk_deals ADD CONSTRAINT bulk_deals_available_quota_check CHECK (((available_quota IS NULL) OR (available_quota >= 0)));

ALTER TABLE ONLY bulk_deals ADD CONSTRAINT bulk_deals_close_outcome_valid CHECK (((close_outcome IS NULL) OR (close_outcome = ANY (ARRAY['FULFILLED'::text, 'REFUNDED'::text]))));

ALTER TABLE ONLY bulk_deals ADD CONSTRAINT bulk_deals_deposit_amount_sane CHECK (((deposit_amount IS NULL) OR ((deposit_amount > (0)::numeric) AND (deposit_amount <= regular_price))));

ALTER TABLE ONLY bulk_deals ADD CONSTRAINT bulk_deals_fulfillment_type_check CHECK (((fulfillment_type IS NULL) OR (fulfillment_type = ANY (ARRAY['ON_SITE_CAMP'::text, 'CLINIC_VISIT'::text, 'STORE_PICKUP'::text, 'CENTRAL_DROP'::text, 'DOORSTEP'::text]))));

ALTER TABLE ONLY bulk_deals ADD CONSTRAINT bulk_deals_moq_check CHECK ((moq >= 1));

ALTER TABLE ONLY bulk_deals ADD CONSTRAINT bulk_deals_regular_price_check CHECK ((regular_price > (0)::numeric));

ALTER TABLE ONLY bulk_deals ADD CONSTRAINT bulk_deals_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE ONLY bulk_deals ADD CONSTRAINT bulk_deals_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES users(id);

ALTER TABLE ONLY bulk_deals ADD CONSTRAINT bulk_deals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY business_access_sessions ADD CONSTRAINT business_access_sessions_access_level_check CHECK ((access_level = ANY (ARRAY['FULL'::text, 'SCOPED'::text])));

ALTER TABLE ONLY business_access_sessions ADD CONSTRAINT business_access_sessions_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'EXPIRED'::text, 'REVOKED'::text, 'DENIED'::text])));

ALTER TABLE ONLY business_access_sessions ADD CONSTRAINT business_access_sessions_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE ONLY business_access_sessions ADD CONSTRAINT business_access_sessions_grantee_user_id_fkey FOREIGN KEY (grantee_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY business_access_sessions ADD CONSTRAINT business_access_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY business_login_attempts ADD CONSTRAINT business_login_attempts_attempted_by_fkey FOREIGN KEY (attempted_by) REFERENCES users(id);

ALTER TABLE ONLY business_login_attempts ADD CONSTRAINT business_login_attempts_pkey PRIMARY KEY (login_id, attempted_by);

ALTER TABLE ONLY business_login_credentials ADD CONSTRAINT business_login_credentials_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE ONLY business_login_credentials ADD CONSTRAINT business_login_credentials_pkey PRIMARY KEY (business_id);

ALTER TABLE ONLY business_packages ADD CONSTRAINT business_packages_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE ONLY business_packages ADD CONSTRAINT business_packages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY business_portfolio_items ADD CONSTRAINT business_portfolio_items_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE ONLY business_portfolio_items ADD CONSTRAINT business_portfolio_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY business_qna ADD CONSTRAINT business_qna_asker_user_id_fkey FOREIGN KEY (asker_user_id) REFERENCES users(id);

ALTER TABLE ONLY business_qna ADD CONSTRAINT business_qna_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE ONLY business_qna ADD CONSTRAINT business_qna_pkey PRIMARY KEY (id);

ALTER TABLE ONLY business_team_members ADD CONSTRAINT business_team_members_role_check CHECK ((role = ANY (ARRAY['OWNER'::text, 'MANAGER'::text, 'STAFF'::text])));

ALTER TABLE ONLY business_team_members ADD CONSTRAINT business_team_members_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE ONLY business_team_members ADD CONSTRAINT business_team_members_pkey PRIMARY KEY (id);

ALTER TABLE ONLY business_view_logs ADD CONSTRAINT business_view_logs_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE ONLY business_view_logs ADD CONSTRAINT business_view_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY businesses ADD CONSTRAINT businesses_capacity_positive CHECK (((default_slot_capacity >= 1) AND ((max_concurrent_bookings IS NULL) OR (max_concurrent_bookings >= 1))));

ALTER TABLE ONLY businesses ADD CONSTRAINT businesses_deposit_percent_check CHECK (((deposit_percent >= 0) AND (deposit_percent <= 100)));

ALTER TABLE ONLY businesses ADD CONSTRAINT businesses_location_review_status_check CHECK ((location_review_status = ANY (ARRAY['NONE'::text, 'PENDING'::text])));

ALTER TABLE ONLY businesses ADD CONSTRAINT businesses_package_key_check CHECK (((package_key IS NULL) OR (package_key = ANY (ARRAY['clinic'::text, 'diagnostics'::text, 'vet'::text, 'pharmacy'::text, 'dining'::text, 'takeaway'::text, 'salon'::text, 'shop'::text, 'homeservice'::text, 'learning'::text, 'fitness'::text, 'professional'::text, 'events'::text, 'generic'::text]))));

ALTER TABLE ONLY businesses ADD CONSTRAINT businesses_verification_status_check CHECK ((verification_status = ANY (ARRAY['NONE'::text, 'UNDER_REVIEW'::text, 'APPROVED'::text, 'REJECTED'::text])));

ALTER TABLE ONLY businesses ADD CONSTRAINT businesses_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);

ALTER TABLE ONLY businesses ADD CONSTRAINT businesses_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES users(id);

ALTER TABLE ONLY businesses ADD CONSTRAINT businesses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY businesses ADD CONSTRAINT businesses_slug_key UNIQUE (slug);

ALTER TABLE ONLY catalog_items ADD CONSTRAINT catalog_items_inventory_type_check CHECK ((inventory_type = ANY (ARRAY['INFINITE'::text, 'FINITE'::text])));

ALTER TABLE ONLY catalog_items ADD CONSTRAINT catalog_items_max_party_positive CHECK ((max_party_size >= 1));

ALTER TABLE ONLY catalog_items ADD CONSTRAINT catalog_items_slot_capacity_positive CHECK (((slot_capacity IS NULL) OR (slot_capacity >= 1)));

ALTER TABLE ONLY catalog_items ADD CONSTRAINT catalog_items_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE ONLY catalog_items ADD CONSTRAINT catalog_items_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;

ALTER TABLE ONLY catalog_items ADD CONSTRAINT catalog_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY categories ADD CONSTRAINT categories_package_key_check CHECK (((package_key IS NULL) OR (package_key = ANY (ARRAY['clinic'::text, 'diagnostics'::text, 'vet'::text, 'pharmacy'::text, 'dining'::text, 'takeaway'::text, 'salon'::text, 'shop'::text, 'homeservice'::text, 'learning'::text, 'fitness'::text, 'professional'::text, 'events'::text, 'generic'::text]))));

ALTER TABLE ONLY categories ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES categories(id);

ALTER TABLE ONLY categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY client_errors ADD CONSTRAINT client_errors_pkey PRIMARY KEY (id);

ALTER TABLE ONLY comment_reactions ADD CONSTRAINT comment_reactions_emoji_check CHECK ((emoji = ANY (ARRAY['👍'::text, '❤️'::text, '😂'::text, '😮'::text, '🙏'::text, '💡'::text])));

ALTER TABLE ONLY comment_reactions ADD CONSTRAINT comment_reactions_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES post_comments(id) ON DELETE CASCADE;

ALTER TABLE ONLY comment_reactions ADD CONSTRAINT comment_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY comment_reactions ADD CONSTRAINT comment_reactions_pkey PRIMARY KEY (comment_id, user_id);

ALTER TABLE ONLY community_posts ADD CONSTRAINT community_posts_author_type_check CHECK ((author_type = ANY (ARRAY['user'::text, 'business'::text, 'provider'::text])));

ALTER TABLE ONLY community_posts ADD CONSTRAINT community_posts_comment_policy_check CHECK ((comment_policy = ANY (ARRAY['EVERYONE'::text, 'NEIGHBORS'::text, 'MUTUALS'::text, 'OFF'::text])));

ALTER TABLE ONLY community_posts ADD CONSTRAINT community_posts_media_len_check CHECK ((COALESCE(array_length(media, 1), 0) <= 4)) NOT VALID;

ALTER TABLE ONLY community_posts ADD CONSTRAINT community_posts_severity_check CHECK (((severity IS NULL) OR (severity = ANY (ARRAY['INFO'::text, 'WARNING'::text, 'URGENT'::text])))) NOT VALID;

ALTER TABLE ONLY community_posts ADD CONSTRAINT community_posts_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES users(id);

ALTER TABLE ONLY community_posts ADD CONSTRAINT community_posts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY conversations ADD CONSTRAINT conversations_participant_a_fkey FOREIGN KEY (participant_a) REFERENCES users(id);

ALTER TABLE ONLY conversations ADD CONSTRAINT conversations_participant_b_fkey FOREIGN KEY (participant_b) REFERENCES users(id);

ALTER TABLE ONLY conversations ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY custom_payments ADD CONSTRAINT custom_payments_amount_check CHECK ((amount > (0)::numeric));

ALTER TABLE ONLY custom_payments ADD CONSTRAINT custom_payments_method_check CHECK ((method = ANY (ARRAY['UPI'::text, 'CASH'::text])));

ALTER TABLE ONLY custom_payments ADD CONSTRAINT custom_payments_status_check CHECK ((status = ANY (ARRAY['PENDING_CONFIRM'::text, 'PAID'::text, 'REJECTED'::text])));

ALTER TABLE ONLY custom_payments ADD CONSTRAINT custom_payments_target_type_check CHECK ((target_type = ANY (ARRAY['BUSINESS'::text, 'PROVIDER'::text])));

ALTER TABLE ONLY custom_payments ADD CONSTRAINT custom_payments_payer_user_id_fkey FOREIGN KEY (payer_user_id) REFERENCES users(id);

ALTER TABLE ONLY custom_payments ADD CONSTRAINT custom_payments_target_owner_user_id_fkey FOREIGN KEY (target_owner_user_id) REFERENCES users(id);

ALTER TABLE ONLY custom_payments ADD CONSTRAINT custom_payments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY delivery_agent_duty ADD CONSTRAINT delivery_agent_duty_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY delivery_agent_duty ADD CONSTRAINT delivery_agent_duty_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY delivery_batches ADD CONSTRAINT delivery_batches_status_check CHECK ((status = ANY (ARRAY['PENDING_ACCEPTANCE'::text, 'ACCEPTED'::text, 'DECLINED'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'CANCELLED'::text])));

ALTER TABLE ONLY delivery_batches ADD CONSTRAINT delivery_batches_agent_user_id_fkey FOREIGN KEY (agent_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY delivery_batches ADD CONSTRAINT delivery_batches_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE ONLY delivery_batches ADD CONSTRAINT delivery_batches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY emergency_contacts ADD CONSTRAINT emergency_contacts_contact_user_id_fkey FOREIGN KEY (contact_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY emergency_contacts ADD CONSTRAINT emergency_contacts_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY emergency_contacts ADD CONSTRAINT emergency_contacts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY emergency_contacts ADD CONSTRAINT emergency_contacts_owner_user_id_contact_user_id_key UNIQUE (owner_user_id, contact_user_id);

ALTER TABLE ONLY endorsements ADD CONSTRAINT endorsements_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY endorsements ADD CONSTRAINT endorsements_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;

ALTER TABLE ONLY endorsements ADD CONSTRAINT endorsements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY endorsements ADD CONSTRAINT endorsements_from_user_id_provider_id_skill_key UNIQUE (from_user_id, provider_id, skill);

ALTER TABLE ONLY entity_password_attempts ADD CONSTRAINT entity_password_attempts_kind_check CHECK ((kind = ANY (ARRAY['business'::text, 'provider'::text])));

ALTER TABLE ONLY entity_password_attempts ADD CONSTRAINT entity_password_attempts_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY entity_password_attempts ADD CONSTRAINT entity_password_attempts_pkey PRIMARY KEY (owner_user_id, kind);

ALTER TABLE ONLY entity_recovery_attempts ADD CONSTRAINT entity_recovery_attempts_kind_check CHECK ((kind = ANY (ARRAY['business'::text, 'provider'::text])));

ALTER TABLE ONLY entity_recovery_attempts ADD CONSTRAINT entity_recovery_attempts_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY entity_recovery_attempts ADD CONSTRAINT entity_recovery_attempts_pkey PRIMARY KEY (owner_user_id, kind);

ALTER TABLE ONLY fcm_tokens ADD CONSTRAINT fcm_tokens_platform_check CHECK ((platform = ANY (ARRAY['android'::text, 'ios'::text])));

ALTER TABLE ONLY fcm_tokens ADD CONSTRAINT fcm_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY fcm_tokens ADD CONSTRAINT fcm_tokens_pkey PRIMARY KEY (user_id, token);

ALTER TABLE ONLY follows ADD CONSTRAINT follows_follower_user_id_fkey FOREIGN KEY (follower_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY follows ADD CONSTRAINT follows_pkey PRIMARY KEY (id);

ALTER TABLE ONLY follows ADD CONSTRAINT follows_follower_user_id_target_type_target_id_key UNIQUE (follower_user_id, target_type, target_id);

ALTER TABLE ONLY gate_passes ADD CONSTRAINT gate_passes_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'USED'::text, 'EXPIRED'::text, 'REVOKED'::text])));

ALTER TABLE ONLY gate_passes ADD CONSTRAINT gate_passes_issued_by_user_id_fkey FOREIGN KEY (issued_by_user_id) REFERENCES users(id);

ALTER TABLE ONLY gate_passes ADD CONSTRAINT gate_passes_provider_user_id_fkey FOREIGN KEY (provider_user_id) REFERENCES users(id);

ALTER TABLE ONLY gate_passes ADD CONSTRAINT gate_passes_society_id_fkey FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE;

ALTER TABLE ONLY gate_passes ADD CONSTRAINT gate_passes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY group_buy_tokens ADD CONSTRAINT group_buy_tokens_quantity_check CHECK ((quantity > 0));

ALTER TABLE ONLY group_buy_tokens ADD CONSTRAINT group_buy_tokens_status_check CHECK ((status = ANY (ARRAY['ISSUED'::text, 'REDEEMED'::text, 'EXPIRED'::text])));

ALTER TABLE ONLY group_buy_tokens ADD CONSTRAINT group_buy_tokens_holder_user_id_fkey FOREIGN KEY (holder_user_id) REFERENCES users(id);

ALTER TABLE ONLY group_buy_tokens ADD CONSTRAINT group_buy_tokens_issuer_user_id_fkey FOREIGN KEY (issuer_user_id) REFERENCES users(id);

ALTER TABLE ONLY group_buy_tokens ADD CONSTRAINT group_buy_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY group_buy_tokens ADD CONSTRAINT group_buy_tokens_token_code_key UNIQUE (token_code);

ALTER TABLE ONLY handoff_attempts ADD CONSTRAINT handoff_attempts_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES appointment_deliveries(id) ON DELETE CASCADE;

ALTER TABLE ONLY handoff_attempts ADD CONSTRAINT handoff_attempts_pkey PRIMARY KEY (delivery_id);

ALTER TABLE ONLY leaderboard_points ADD CONSTRAINT leaderboard_points_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY leads ADD CONSTRAINT leads_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE ONLY leads ADD CONSTRAINT leads_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES users(id);

ALTER TABLE ONLY leads ADD CONSTRAINT leads_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;

ALTER TABLE ONLY leads ADD CONSTRAINT leads_pkey PRIMARY KEY (id);

ALTER TABLE ONLY live_share_recipients ADD CONSTRAINT live_share_recipients_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY live_share_recipients ADD CONSTRAINT live_share_recipients_share_id_fkey FOREIGN KEY (share_id) REFERENCES live_shares(id) ON DELETE CASCADE;

ALTER TABLE ONLY live_share_recipients ADD CONSTRAINT live_share_recipients_pkey PRIMARY KEY (share_id, recipient_user_id);

ALTER TABLE ONLY live_shares ADD CONSTRAINT live_shares_sharer_user_id_fkey FOREIGN KEY (sharer_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY live_shares ADD CONSTRAINT live_shares_pkey PRIMARY KEY (id);

ALTER TABLE ONLY location_share_grants ADD CONSTRAINT location_share_grants_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY location_share_grants ADD CONSTRAINT location_share_grants_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY location_share_grants ADD CONSTRAINT location_share_grants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY location_share_grants ADD CONSTRAINT location_share_grants_owner_user_id_requester_user_id_key UNIQUE (owner_user_id, requester_user_id);

ALTER TABLE ONLY loyalty_cards ADD CONSTRAINT loyalty_cards_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE ONLY loyalty_cards ADD CONSTRAINT loyalty_cards_pkey PRIMARY KEY (id);

ALTER TABLE ONLY loyalty_cards ADD CONSTRAINT loyalty_cards_business_id_key UNIQUE (business_id);

ALTER TABLE ONLY messages ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id);

ALTER TABLE ONLY messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY offers ADD CONSTRAINT offers_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE ONLY offers ADD CONSTRAINT offers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY payments ADD CONSTRAINT payments_escrow_status_check CHECK ((escrow_status = ANY (ARRAY['PENDING'::text, 'HELD'::text, 'RELEASED'::text, 'REFUNDED'::text])));

ALTER TABLE ONLY payments ADD CONSTRAINT payments_status_check CHECK ((status = ANY (ARRAY['CREATED'::text, 'PAID'::text, 'FAILED'::text])));

ALTER TABLE ONLY payments ADD CONSTRAINT payments_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES agreements(id) ON DELETE CASCADE;

ALTER TABLE ONLY payments ADD CONSTRAINT payments_payer_user_id_fkey FOREIGN KEY (payer_user_id) REFERENCES users(id);

ALTER TABLE ONLY payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY places ADD CONSTRAINT places_category_check CHECK ((category = ANY (ARRAY['MOUNTAIN'::text, 'TREK'::text, 'SPORTS_VENUE'::text, 'TOURIST_SPOT'::text, 'OTHER'::text])));

ALTER TABLE ONLY places ADD CONSTRAINT places_difficulty_check CHECK (((difficulty IS NULL) OR (difficulty = ANY (ARRAY['EASY'::text, 'MODERATE'::text, 'HARD'::text]))));

ALTER TABLE ONLY places ADD CONSTRAINT places_submitted_by_user_id_fkey FOREIGN KEY (submitted_by_user_id) REFERENCES users(id);

ALTER TABLE ONLY places ADD CONSTRAINT places_pkey PRIMARY KEY (id);

ALTER TABLE ONLY poll_votes ADD CONSTRAINT poll_votes_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY poll_votes ADD CONSTRAINT poll_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE ONLY poll_votes ADD CONSTRAINT poll_votes_pkey PRIMARY KEY (post_id, user_id);

ALTER TABLE ONLY portfolio_items ADD CONSTRAINT portfolio_items_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;

ALTER TABLE ONLY portfolio_items ADD CONSTRAINT portfolio_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY post_comments ADD CONSTRAINT post_comments_phone_visibility_check CHECK (((phone_visibility IS NULL) OR (phone_visibility = ANY (ARRAY['OWNER'::text, 'PUBLIC'::text]))));

ALTER TABLE ONLY post_comments ADD CONSTRAINT post_comments_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES users(id);

ALTER TABLE ONLY post_comments ADD CONSTRAINT post_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES post_comments(id) ON DELETE CASCADE;

ALTER TABLE ONLY post_comments ADD CONSTRAINT post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY post_comments ADD CONSTRAINT post_comments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY post_likes ADD CONSTRAINT post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY post_likes ADD CONSTRAINT post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE ONLY post_likes ADD CONSTRAINT post_likes_pkey PRIMARY KEY (post_id, user_id);

ALTER TABLE ONLY post_saves ADD CONSTRAINT post_saves_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY post_saves ADD CONSTRAINT post_saves_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY post_saves ADD CONSTRAINT post_saves_pkey PRIMARY KEY (post_id, user_id);

ALTER TABLE ONLY pro_payments ADD CONSTRAINT pro_payments_entity_type_check CHECK ((entity_type = ANY (ARRAY['BUSINESS'::text, 'PROVIDER'::text])));

ALTER TABLE ONLY pro_payments ADD CONSTRAINT pro_payments_plan_check CHECK ((plan = ANY (ARRAY['BASIC'::text, 'PRO'::text, 'PREMIUM'::text, 'LEAD_PACK_10'::text, 'LEAD_PACK_50'::text])));

ALTER TABLE ONLY pro_payments ADD CONSTRAINT pro_payments_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'PAID'::text, 'FAILED'::text])));

ALTER TABLE ONLY pro_payments ADD CONSTRAINT pro_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE ONLY pro_payments ADD CONSTRAINT pro_payments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY profile_deletion_requests ADD CONSTRAINT deletion_requests_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'REVIEWING'::text, 'APPROVED'::text, 'COMPLETED'::text, 'REJECTED'::text])));

ALTER TABLE ONLY profile_deletion_requests ADD CONSTRAINT profile_deletion_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY profile_deletion_requests ADD CONSTRAINT profile_deletion_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY proposal_counters ADD CONSTRAINT proposal_counters_amount_check CHECK ((amount > (0)::numeric));

ALTER TABLE ONLY proposal_counters ADD CONSTRAINT proposal_counters_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE;

ALTER TABLE ONLY proposal_counters ADD CONSTRAINT proposal_counters_pkey PRIMARY KEY (id);

ALTER TABLE ONLY proposals ADD CONSTRAINT proposals_price_positive CHECK ((price > 0)) NOT VALID;

ALTER TABLE ONLY proposals ADD CONSTRAINT proposals_request_id_fkey FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE;

ALTER TABLE ONLY proposals ADD CONSTRAINT proposals_responder_user_id_fkey FOREIGN KEY (responder_user_id) REFERENCES users(id);

ALTER TABLE ONLY proposals ADD CONSTRAINT proposals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY provider_packages ADD CONSTRAINT provider_packages_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;

ALTER TABLE ONLY provider_packages ADD CONSTRAINT provider_packages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY provider_view_logs ADD CONSTRAINT provider_view_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY providers ADD CONSTRAINT providers_deposit_percent_check CHECK (((deposit_percent >= 0) AND (deposit_percent <= 100)));

ALTER TABLE ONLY providers ADD CONSTRAINT providers_package_key_check CHECK (((package_key IS NULL) OR (package_key = ANY (ARRAY['clinic'::text, 'diagnostics'::text, 'vet'::text, 'pharmacy'::text, 'dining'::text, 'takeaway'::text, 'salon'::text, 'shop'::text, 'homeservice'::text, 'learning'::text, 'fitness'::text, 'professional'::text, 'events'::text, 'generic'::text]))));

ALTER TABLE ONLY providers ADD CONSTRAINT providers_verification_status_check CHECK ((verification_status = ANY (ARRAY['NONE'::text, 'UNDER_REVIEW'::text, 'APPROVED'::text, 'REJECTED'::text])));

ALTER TABLE ONLY providers ADD CONSTRAINT providers_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);

ALTER TABLE ONLY providers ADD CONSTRAINT providers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE ONLY providers ADD CONSTRAINT providers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint);

ALTER TABLE ONLY qna_upvotes ADD CONSTRAINT qna_upvotes_qna_id_fkey FOREIGN KEY (qna_id) REFERENCES business_qna(id) ON DELETE CASCADE;

ALTER TABLE ONLY qna_upvotes ADD CONSTRAINT qna_upvotes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY qna_upvotes ADD CONSTRAINT qna_upvotes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY qna_upvotes ADD CONSTRAINT qna_upvotes_qna_id_user_id_key UNIQUE (qna_id, user_id);

ALTER TABLE ONLY queue_settings ADD CONSTRAINT queue_settings_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE ONLY queue_settings ADD CONSTRAINT queue_settings_pkey PRIMARY KEY (business_id);

ALTER TABLE ONLY queue_tokens ADD CONSTRAINT queue_tokens_status_check CHECK ((status = ANY (ARRAY['WAITING'::text, 'CALLED'::text, 'SERVED'::text, 'LEFT'::text, 'EXPIRED'::text])));

ALTER TABLE ONLY queue_tokens ADD CONSTRAINT queue_tokens_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE ONLY queue_tokens ADD CONSTRAINT queue_tokens_customer_user_id_fkey FOREIGN KEY (customer_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ONLY queue_tokens ADD CONSTRAINT queue_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY ratings ADD CONSTRAINT ratings_rating_check CHECK (((rating >= 1) AND (rating <= 5)));

ALTER TABLE ONLY ratings ADD CONSTRAINT ratings_rater_user_id_fkey FOREIGN KEY (rater_user_id) REFERENCES users(id);

ALTER TABLE ONLY ratings ADD CONSTRAINT ratings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY reports ADD CONSTRAINT reports_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'REVIEWING'::text, 'ACTION_TAKEN'::text, 'DISMISSED'::text])));

ALTER TABLE ONLY reports ADD CONSTRAINT reports_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES users(id);

ALTER TABLE ONLY reports ADD CONSTRAINT reports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY request_me_toos ADD CONSTRAINT request_me_toos_quantity_check CHECK ((quantity > 0));

ALTER TABLE ONLY request_me_toos ADD CONSTRAINT request_me_toos_request_id_fkey FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE;

ALTER TABLE ONLY request_me_toos ADD CONSTRAINT request_me_toos_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE ONLY request_me_toos ADD CONSTRAINT request_me_toos_pkey PRIMARY KEY (request_id, user_id);

ALTER TABLE ONLY requests ADD CONSTRAINT requests_fulfillment_type_check CHECK (((fulfillment_type IS NULL) OR (fulfillment_type = ANY (ARRAY['ON_SITE_CAMP'::text, 'CLINIC_VISIT'::text, 'STORE_PICKUP'::text, 'CENTRAL_DROP'::text, 'DOORSTEP'::text]))));

ALTER TABLE ONLY requests ADD CONSTRAINT requests_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);

ALTER TABLE ONLY requests ADD CONSTRAINT requests_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES users(id);

ALTER TABLE ONLY requests ADD CONSTRAINT requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY saved_searches ADD CONSTRAINT saved_searches_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY saved_searches ADD CONSTRAINT saved_searches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY saved_searches ADD CONSTRAINT saved_searches_user_id_query_key UNIQUE (user_id, query);

ALTER TABLE ONLY settlements ADD CONSTRAINT settlements_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES agreements(id) ON DELETE CASCADE;

ALTER TABLE ONLY settlements ADD CONSTRAINT settlements_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY settlements ADD CONSTRAINT settlements_with_user_id_fkey FOREIGN KEY (with_user_id) REFERENCES users(id);

ALTER TABLE ONLY settlements ADD CONSTRAINT settlements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY societies ADD CONSTRAINT societies_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES users(id);

ALTER TABLE ONLY societies ADD CONSTRAINT societies_pkey PRIMARY KEY (id);

ALTER TABLE ONLY societies ADD CONSTRAINT societies_join_code_key UNIQUE (join_code);

ALTER TABLE ONLY society_members ADD CONSTRAINT society_members_role_check CHECK ((role = ANY (ARRAY['ADMIN'::text, 'SECRETARY'::text, 'RESIDENT'::text])));

ALTER TABLE ONLY society_members ADD CONSTRAINT society_members_society_id_fkey FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE;

ALTER TABLE ONLY society_members ADD CONSTRAINT society_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY society_members ADD CONSTRAINT society_members_pkey PRIMARY KEY (id);

ALTER TABLE ONLY society_members ADD CONSTRAINT society_members_society_id_user_id_key UNIQUE (society_id, user_id);

ALTER TABLE ONLY stories ADD CONSTRAINT stories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY story_views ADD CONSTRAINT story_views_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE;

ALTER TABLE ONLY story_views ADD CONSTRAINT story_views_viewer_user_id_fkey FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY story_views ADD CONSTRAINT story_views_pkey PRIMARY KEY (id);

ALTER TABLE ONLY story_views ADD CONSTRAINT story_views_story_id_viewer_user_id_key UNIQUE (story_id, viewer_user_id);

ALTER TABLE ONLY subscription_logs ADD CONSTRAINT subscription_logs_status_check CHECK ((status = ANY (ARRAY['PRESENT'::text, 'ABSENT'::text, 'SKIPPED'::text])));

ALTER TABLE ONLY subscription_logs ADD CONSTRAINT subscription_logs_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE;

ALTER TABLE ONLY subscription_logs ADD CONSTRAINT subscription_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY subscription_logs ADD CONSTRAINT subscription_logs_subscription_id_log_date_key UNIQUE (subscription_id, log_date);

ALTER TABLE ONLY subscriptions ADD CONSTRAINT subscriptions_frequency_check CHECK ((frequency = ANY (ARRAY['DAILY'::text, 'WEEKLY'::text, 'MONTHLY'::text])));

ALTER TABLE ONLY subscriptions ADD CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'PAUSED'::text, 'CANCELLED'::text])));

ALTER TABLE ONLY subscriptions ADD CONSTRAINT subscriptions_provider_user_id_fkey FOREIGN KEY (provider_user_id) REFERENCES users(id);

ALTER TABLE ONLY subscriptions ADD CONSTRAINT subscriptions_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES users(id);

ALTER TABLE ONLY subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY support_tickets ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE ONLY support_tickets ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY switch_pin_attempts ADD CONSTRAINT switch_pin_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY switch_pin_attempts ADD CONSTRAINT switch_pin_attempts_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY terms_acceptances ADD CONSTRAINT terms_acceptances_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY terms_acceptances ADD CONSTRAINT terms_acceptances_pkey PRIMARY KEY (id);

ALTER TABLE ONLY tracking_tokens ADD CONSTRAINT tracking_tokens_one_target CHECK (((agreement_id IS NOT NULL) <> (appointment_id IS NOT NULL)));

ALTER TABLE ONLY tracking_tokens ADD CONSTRAINT tracking_tokens_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES agreements(id) ON DELETE CASCADE;

ALTER TABLE ONLY tracking_tokens ADD CONSTRAINT tracking_tokens_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;

ALTER TABLE ONLY tracking_tokens ADD CONSTRAINT tracking_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY user_blocks ADD CONSTRAINT user_blocks_not_self CHECK ((blocker_user_id <> blocked_user_id));

ALTER TABLE ONLY user_blocks ADD CONSTRAINT user_blocks_blocked_user_id_fkey FOREIGN KEY (blocked_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY user_blocks ADD CONSTRAINT user_blocks_blocker_user_id_fkey FOREIGN KEY (blocker_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY user_blocks ADD CONSTRAINT user_blocks_pkey PRIMARY KEY (blocker_user_id, blocked_user_id);

ALTER TABLE ONLY user_list_items ADD CONSTRAINT user_list_items_list_id_fkey FOREIGN KEY (list_id) REFERENCES user_lists(id) ON DELETE CASCADE;

ALTER TABLE ONLY user_list_items ADD CONSTRAINT user_list_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY user_list_items ADD CONSTRAINT user_list_items_list_id_target_type_target_id_key UNIQUE (list_id, target_type, target_id);

ALTER TABLE ONLY user_lists ADD CONSTRAINT user_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY user_lists ADD CONSTRAINT user_lists_pkey PRIMARY KEY (id);

ALTER TABLE ONLY user_saved_coupons ADD CONSTRAINT user_saved_coupons_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE;

ALTER TABLE ONLY user_saved_coupons ADD CONSTRAINT user_saved_coupons_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY user_saved_coupons ADD CONSTRAINT user_saved_coupons_pkey PRIMARY KEY (id);

ALTER TABLE ONLY user_saved_coupons ADD CONSTRAINT user_saved_coupons_user_id_offer_id_key UNIQUE (user_id, offer_id);

ALTER TABLE ONLY user_stamps ADD CONSTRAINT user_stamps_card_id_fkey FOREIGN KEY (card_id) REFERENCES loyalty_cards(id) ON DELETE CASCADE;

ALTER TABLE ONLY user_stamps ADD CONSTRAINT user_stamps_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY user_stamps ADD CONSTRAINT user_stamps_pkey PRIMARY KEY (id);

ALTER TABLE ONLY user_stamps ADD CONSTRAINT user_stamps_user_id_card_id_key UNIQUE (user_id, card_id);

ALTER TABLE ONLY users ADD CONSTRAINT users_society_id_fkey FOREIGN KEY (society_id) REFERENCES societies(id);

ALTER TABLE ONLY users ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY vouches ADD CONSTRAINT vouches_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ONLY vouches ADD CONSTRAINT vouches_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE;

ALTER TABLE ONLY vouches ADD CONSTRAINT vouches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY vouches ADD CONSTRAINT vouches_from_user_id_provider_id_key UNIQUE (from_user_id, provider_id);


-- ════════════════════════════════════════════════════════════
-- Row level security (90)
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.account_appeals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.admin_login_resolve_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.appointment_deliveries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.appointment_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.blocked_slots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.boosts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bulk_deal_pledges ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bulk_deal_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bulk_deals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.business_access_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.business_login_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.business_login_credentials ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.business_packages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.business_portfolio_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.business_qna ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.business_team_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.business_view_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.custom_payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.delivery_agent_duty ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.delivery_batches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.endorsements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.entity_password_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.entity_recovery_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gate_passes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_buy_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.handoff_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leaderboard_points ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.live_share_recipients ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.live_shares ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.location_share_grants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.loyalty_cards ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.post_saves ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pro_payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profile_deletion_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.proposal_counters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.provider_packages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.provider_view_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.qna_upvotes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.queue_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.queue_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.request_me_toos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.societies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.society_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.subscription_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.switch_pin_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tracking_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_list_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_lists ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_saved_coupons ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_stamps ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vouches ENABLE ROW LEVEL SECURITY;


-- ════════════════════════════════════════════════════════════
-- Views (0)
-- ════════════════════════════════════════════════════════════




-- ════════════════════════════════════════════════════════════
-- Functions (245)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._bulk_deal_close_internal(p_deal_id text, p_trigger text, p_outcome text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_deal public.bulk_deals%rowtype;
  v_paid_qty integer;
  v_unit_price numeric;
  v_tier jsonb;
  v_deposit_paid numeric;
  v_balance_due numeric;
  m record;
begin
  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.closed_at is not null then return; end if; -- already closed

  -- BLK-1: Count pledges where deposit was PAID OR deal had no deposit requirement
  select coalesce(sum(quantity), 0) into v_paid_qty
    from public.bulk_deal_pledges
   where deal_id = p_deal_id
     and (v_deal.deposit_amount is null or v_deal.deposit_amount = 0 or deposit_status = 'PAID');

  if p_outcome is null and v_paid_qty >= v_deal.moq then
    p_outcome := 'FULFILLED';
  end if;

  update public.bulk_deals set closed_at = now(), close_outcome = p_outcome where id = p_deal_id;

  if p_outcome = 'FULFILLED' then
    select t into v_tier
      from jsonb_array_elements(coalesce(v_deal.tiers, '[]'::jsonb)) as t
     where (t->>'minQty')::numeric <= v_paid_qty
     order by (t->>'minQty')::numeric desc
     limit 1;
    v_unit_price := coalesce((v_tier->>'unitPrice')::numeric, v_deal.regular_price);

    for m in
      select user_id, quantity, deposit_amount_paid
        from public.bulk_deal_pledges
       where deal_id = p_deal_id
         and (v_deal.deposit_amount is null or v_deal.deposit_amount = 0 or deposit_status = 'PAID')
    loop
      v_deposit_paid := coalesce(m.deposit_amount_paid, 0);
      v_balance_due := greatest(0, (m.quantity * coalesce(v_unit_price, 0)) - v_deposit_paid);

      insert into public.bulk_deal_tokens (
        token_code, deal_id, holder_user_id, issuer_user_id, business_id,
        quantity, unit_price, item_label, deposit_paid, balance_due
      ) values (
        'STRYT-D-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)) || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4)),
        p_deal_id, m.user_id, v_deal.owner_user_id, v_deal.business_id,
        m.quantity, v_unit_price, v_deal.title, v_deposit_paid, v_balance_due
      )
      on conflict (deal_id, holder_user_id) do update
        set unit_price = excluded.unit_price,
            deposit_paid = excluded.deposit_paid,
            balance_due = excluded.balance_due;

      insert into public.notifications (user_id, type, title, body, deep_link)
      values (m.user_id, 'BULK_DEAL_UNLOCKED', 'Claim pass ready — "' || v_deal.title || '"',
              'The campaign closed and hit its target — your claim pass is ready.', '/community/activity');
    end loop;

  elsif p_outcome = 'REFUNDED' then
    for m in select user_id from public.bulk_deal_pledges where deal_id = p_deal_id and deposit_status = 'PAID' loop
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (m.user_id, 'BULK_DEAL_REFUNDED', '"' || v_deal.title || '" didn''t reach its target',
              'The business will refund your deposit directly.', '/business/' || v_deal.business_id);
    end loop;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._enforce_business_owner_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public._normalize_recovery_answer(p_answer text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select lower(trim(coalesce(p_answer, '')));
$function$
;

CREATE OR REPLACE FUNCTION public._user_blocks_exists(p_a text, p_b text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_blocks
    where (blocker_user_id = p_a and blocked_user_id = p_b)
       or (blocker_user_id = p_b and blocked_user_id = p_a)
  );
$function$
;

CREATE OR REPLACE FUNCTION public._validate_recovery_question(p_kind text, p_question_id text, p_question_text text)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_allowed text[];
begin
  if p_kind not in ('business', 'provider') then
    raise exception 'Invalid kind';
  end if;

  v_allowed := case p_kind
    when 'business' then array['first_shop', 'business_city', 'phone_last4', 'year_started', 'custom']
    else array['first_service', 'work_city', 'upi_last4', 'custom']
  end;

  if p_question_id is null or not (p_question_id = any (v_allowed)) then
    raise exception 'Invalid recovery question';
  end if;

  if p_question_id = 'custom' then
    if length(trim(coalesce(p_question_text, ''))) < 3 then
      raise exception 'Custom question must be at least 3 characters';
    end if;
    if length(trim(p_question_text)) > 120 then
      raise exception 'Custom question must be at most 120 characters';
    end if;
  elsif p_question_text is not null and length(trim(p_question_text)) > 0 then
  -- Preset ids must not carry custom text (ignore stray text rather than fail).
    null;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._verify_entity_password(p_kind text, p_owner_user_id text, p_password text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_hash text;
  v_attempt public.entity_password_attempts%rowtype;
  v_matches boolean;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
  v_dummy_hash constant text := '$2a$10$CXSUxhkNpnbyeflgDI/sMei3m6s9krMAI2wx72jT.YBXr.Agkk6H2';
begin
  if p_owner_user_id is null or p_kind not in ('business','provider') then return false; end if;

  select * into v_attempt from public.entity_password_attempts
   where owner_user_id = p_owner_user_id and kind = p_kind for update;
  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return false;
  end if;

  select case p_kind when 'business' then business_password_hash else provider_password_hash end
    into v_hash from public.users where id = p_owner_user_id;

  -- Always run one bcrypt comparison, even with no password set, so response
  -- timing can't reveal whether one exists (same trick as verify_switch_pin).
  v_matches := crypt(coalesce(p_password, ''), coalesce(v_hash, v_dummy_hash)) = coalesce(v_hash, v_dummy_hash);

  if v_hash is not null and v_matches then
    delete from public.entity_password_attempts where owner_user_id = p_owner_user_id and kind = p_kind;
    return true;
  end if;

  insert into public.entity_password_attempts (owner_user_id, kind, fail_count, last_attempt_at, locked_until)
  values (p_owner_user_id, p_kind, 1, now(), null)
  on conflict (owner_user_id, kind) do update
  set fail_count = case
        when entity_password_attempts.last_attempt_at <= now() - v_window
          or entity_password_attempts.locked_until is not null
        then 1 else entity_password_attempts.fail_count + 1 end,
      last_attempt_at = now(),
      locked_until = case
        when (case
          when entity_password_attempts.last_attempt_at <= now() - v_window
            or entity_password_attempts.locked_until is not null
          then 1 else entity_password_attempts.fail_count + 1 end) >= v_max_attempts
        then now() + v_window else null end;

  return false;
end $function$
;

CREATE OR REPLACE FUNCTION public._verify_entity_recovery_answer(p_kind text, p_owner_user_id text, p_answer text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_hash text;
  v_attempt public.entity_recovery_attempts%rowtype;
  v_normalized text;
  v_matches boolean;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
  v_dummy_hash constant text := '$2a$10$CXSUxhkNpnbyeflgDI/sMei3m6s9krMAI2wx72jT.YBXr.Agkk6H2';
begin
  if p_owner_user_id is null or p_kind not in ('business', 'provider') then
    return false;
  end if;

  select * into v_attempt
    from public.entity_recovery_attempts
   where owner_user_id = p_owner_user_id and kind = p_kind
   for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return false;
  end if;

  select case p_kind
           when 'business' then business_recovery_answer_hash
           else provider_recovery_answer_hash
         end
    into v_hash
    from public.users
   where id = p_owner_user_id;

  v_normalized := public._normalize_recovery_answer(p_answer);

  -- Always run one bcrypt comparison, even with no recovery set, so response
  -- timing can't reveal whether a recovery question exists.
  v_matches := crypt(
    coalesce(v_normalized, ''),
    coalesce(v_hash, v_dummy_hash)
  ) = coalesce(v_hash, v_dummy_hash);

  if v_hash is not null and v_matches then
    delete from public.entity_recovery_attempts
     where owner_user_id = p_owner_user_id and kind = p_kind;
    return true;
  end if;

  insert into public.entity_recovery_attempts (owner_user_id, kind, fail_count, last_attempt_at, locked_until)
  values (p_owner_user_id, p_kind, 1, now(), null)
  on conflict (owner_user_id, kind) do update
  set fail_count = case
        when entity_recovery_attempts.last_attempt_at <= now() - v_window
          or entity_recovery_attempts.locked_until is not null
        then 1
        else entity_recovery_attempts.fail_count + 1
      end,
      last_attempt_at = now(),
      locked_until = case
        when (case
          when entity_recovery_attempts.last_attempt_at <= now() - v_window
            or entity_recovery_attempts.locked_until is not null
          then 1
          else entity_recovery_attempts.fail_count + 1
        end) >= v_max_attempts
        then now() + v_window
        else null
      end;

  return false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_delivery_batch(p_batch_id text, p_stop_order text[] DEFAULT NULL::text[])
 RETURNS delivery_batches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_batch public.delivery_batches%rowtype;
  v_id text;
  v_i int := 0;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_batch from public.delivery_batches where id = p_batch_id for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if v_uid is distinct from v_batch.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_batch.status <> 'PENDING_ACCEPTANCE' then raise exception 'INVALID_BATCH_STATE'; end if;

  if p_stop_order is not null then
    foreach v_id in array p_stop_order loop
      v_i := v_i + 1;
      update public.appointment_deliveries set stop_order = v_i
        where id = v_id and batch_id = p_batch_id;
    end loop;
  end if;

  update public.delivery_batches set status = 'ACCEPTED', accepted_at = now()
    where id = p_batch_id returning * into v_batch;
  return v_batch;
end $function$
;

CREATE OR REPLACE FUNCTION public.accept_proposal(p_proposal_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_proposal public.proposals%rowtype;
  v_request public.requests%rowtype;
  v_agreement_id text;
  v_rejected_responder text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_proposal from public.proposals
  where id = p_proposal_id for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  select * into v_request from public.requests
  where id = v_proposal.request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  if v_request.requester_user_id is distinct from v_uid then
    raise exception 'NOT_REQUEST_OWNER';
  end if;
  if v_request.status <> 'OPEN' or v_proposal.status <> 'SUBMITTED' then
    raise exception 'REQUEST_NOT_OPEN';
  end if;
  if v_proposal.price is null or v_proposal.price <= 0 then
    raise exception 'INVALID_PRICE';
  end if;

  if exists (select 1 from public.agreements a
             where a.request_id = v_request.id or a.proposal_id = p_proposal_id) then
    raise exception 'AGREEMENT_ALREADY_EXISTS';
  end if;

  update public.proposals set status = 'ACCEPTED'
  where id = p_proposal_id and status = 'SUBMITTED';
  if not found then raise exception 'PROPOSAL_ALREADY_DECIDED'; end if;

  insert into public.agreements (
    request_id, request_title, proposal_id, requester_user_id, responder_user_id,
    responder_entity_id, responder_type,
    agreed_price, terms, requester_confirmed, responder_confirmed, payment_mode, status
  ) values (
    v_request.id, v_request.title, p_proposal_id,
    v_request.requester_user_id, v_proposal.responder_user_id,
    v_proposal.responder_entity_id, v_proposal.responder_type,
    v_proposal.price, coalesce(v_proposal.message, ''), false, false, 'OFFLINE', 'PENDING'
  ) returning id into v_agreement_id;

  update public.requests set status = 'IN_PROGRESS'
  where id = v_request.id and status = 'OPEN';
  if not found then raise exception 'REQUEST_ALREADY_DECIDED'; end if;

  for v_rejected_responder in
    update public.proposals set status = 'REJECTED'
    where request_id = v_request.id and id <> p_proposal_id and status = 'SUBMITTED'
    returning responder_user_id
  loop
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_rejected_responder, 'PROPOSAL', 'Quote not accepted',
        'The requester went with another quote for "' || left(coalesce(v_request.title, 'this request'), 60) || '".',
        '/request/' || v_request.id);
    exception when others then null;
    end;
  end loop;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    v_proposal.responder_user_id, 'AGREEMENT', 'Your quote was accepted! 🎉',
    'Confirm within 12 hours to lock in "' || left(coalesce(v_request.title, 'this request'), 60) || '".',
    '/agreement/' || v_agreement_id,
    jsonb_build_object('amount', v_proposal.price, 'amountLabel', 'Accepted at', 'statusPill', 'Confirm now', 'tone', 'success')
  );

  return v_agreement_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.accept_proposal_at_price(p_proposal_id text, p_final_price integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_original_price integer;
  v_counter_id text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select p.price into v_original_price
  from public.proposals p
  join public.requests r on r.id = p.request_id
  where p.id = p_proposal_id and r.requester_user_id = v_uid;
  if not found then raise exception 'NOT_REQUEST_OWNER'; end if;

  if p_final_price = v_original_price then
    return public.accept_proposal(p_proposal_id);
  end if;

  select c.id into v_counter_id
  from public.proposal_counters c
  join public.proposals p on p.id = c.proposal_id
  where c.proposal_id = p_proposal_id
    and c.by_user_id = p.responder_user_id
    and c.amount = p_final_price
  order by c.created_at desc, c.id desc
  limit 1;

  if v_counter_id is null then raise exception 'PRICE_NOT_NEGOTIATED'; end if;
  return public.accept_proposal_counter(p_proposal_id, v_counter_id);
end
$function$
;

CREATE OR REPLACE FUNCTION public.accept_proposal_counter(p_proposal_id text, p_counter_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_proposal public.proposals%rowtype;
  v_request public.requests%rowtype;
  v_counter public.proposal_counters%rowtype;
  v_agreement_id text;
  v_rejected_responder text;
  v_is_requester boolean := false;
  v_is_responder boolean := false;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_proposal from public.proposals
  where id = p_proposal_id for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  select * into v_request from public.requests
  where id = v_proposal.request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  if v_request.status <> 'OPEN' or v_proposal.status <> 'SUBMITTED' then
    raise exception 'REQUEST_NOT_OPEN';
  end if;

  select * into v_counter
  from public.proposal_counters c
  where c.proposal_id = p_proposal_id
  order by c.created_at desc, c.id desc
  limit 1 for update;

  if not found or v_counter.id is distinct from p_counter_id then
    raise exception 'COUNTER_NOT_LATEST';
  end if;
  if v_counter.amount is null or v_counter.amount <= 0 then
    raise exception 'INVALID_PRICE';
  end if;

  -- Determine party role and validate bilateral counter offer author
  if v_uid = v_request.requester_user_id then
    v_is_requester := true;
    if v_counter.by_user_id is distinct from v_proposal.responder_user_id then
      raise exception 'COUNTER_NOT_OFFERED_BY_RESPONDER';
    end if;
  elsif v_uid = v_proposal.responder_user_id
        or (v_proposal.responder_type = 'business' and public.has_business_scope(v_proposal.responder_entity_id, v_uid, 'leads'))
        or (v_proposal.responder_type = 'provider' and exists(select 1 from public.providers p where p.id = v_proposal.responder_entity_id and p.user_id = v_uid))
        or public.is_admin(v_uid) then
    v_is_responder := true;
    if v_counter.by_user_id is distinct from v_request.requester_user_id then
      raise exception 'COUNTER_NOT_OFFERED_BY_REQUESTER';
    end if;
  else
    raise exception 'NOT_AUTHORIZED_TO_ACCEPT_COUNTER';
  end if;

  if exists (select 1 from public.agreements a
             where a.request_id = v_request.id or a.proposal_id = p_proposal_id) then
    raise exception 'AGREEMENT_ALREADY_EXISTS';
  end if;

  update public.proposals set status = 'ACCEPTED'
  where id = p_proposal_id and status = 'SUBMITTED';
  if not found then raise exception 'PROPOSAL_ALREADY_DECIDED'; end if;

  insert into public.agreements (
    request_id, request_title, proposal_id, requester_user_id, responder_user_id,
    responder_entity_id, responder_type,
    agreed_price, terms, requester_confirmed, responder_confirmed, payment_mode, status
  ) values (
    v_request.id, v_request.title, p_proposal_id,
    v_request.requester_user_id, v_proposal.responder_user_id,
    v_proposal.responder_entity_id, v_proposal.responder_type,
    v_counter.amount::integer, coalesce(v_proposal.message, ''),
    -- Pre-confirm the party that called accept_proposal_counter
    v_is_requester, v_is_responder,
    'OFFLINE', 'PENDING'
  ) returning id into v_agreement_id;

  update public.requests set status = 'IN_PROGRESS'
  where id = v_request.id and status = 'OPEN';
  if not found then raise exception 'REQUEST_ALREADY_DECIDED'; end if;

  for v_rejected_responder in
    update public.proposals set status = 'REJECTED'
    where request_id = v_request.id and id <> p_proposal_id and status = 'SUBMITTED'
    returning responder_user_id
  loop
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_rejected_responder, 'PROPOSAL', 'Quote not accepted',
        'The requester went with another quote for "' || left(coalesce(v_request.title, 'this request'), 60) || '".',
        '/request/' || v_request.id);
    exception when others then null;
    end;
  end loop;

  -- Notify other party of accepted counter
  declare
    v_notif_target text := case when v_is_requester then v_proposal.responder_user_id else v_request.requester_user_id end;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      v_notif_target, 'AGREEMENT', 'Counter-offer accepted! 🎉',
      'The counter of ₹' || v_counter.amount::text || ' was accepted. Confirm within 12 hours to lock in.',
      '/agreement/' || v_agreement_id,
      jsonb_build_object('amount', v_counter.amount, 'amountLabel', 'Agreed at', 'statusPill', 'Confirm now', 'tone', 'success')
    );
  exception when others then null;
  end;

  return v_agreement_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_cancel_request(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null or not public.is_admin(v_uid) then raise exception 'NOT_ALLOWED'; end if;

  update public.requests set status = 'CANCELLED' where id = p_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.admin_delete_comment(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null or not public.is_admin(v_uid) then raise exception 'NOT_ALLOWED'; end if;

  delete from public.comment_reactions where comment_id = p_id;
  -- Nested replies would otherwise be orphaned behind a removed parent.
  delete from public.post_comments where parent_id = p_id;
  delete from public.post_comments where id = p_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.admin_delete_post(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null or not public.is_admin(v_uid) then raise exception 'NOT_ALLOWED'; end if;

  delete from public.post_comments where post_id = p_id;
  delete from public.post_likes where post_id = p_id;
  delete from public.poll_votes where post_id = p_id;
  delete from public.community_posts where id = p_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.admin_recent_users()
 RETURNS SETOF users
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.users where id = auth.uid()::text and 'admin' = any(roles)) then
    raise exception 'NOT_ADMIN';
  end if;
  return query select * from public.users order by created_at desc limit 30;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_resolve_agreement_dispute(p_id text, p_resolution text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if not exists (
    select 1 from public.users u
    where u.id = v_uid and u.roles && array['admin', 'super_admin']::text[]
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_resolution not in ('COMPLETED', 'CANCELLED') then raise exception 'INVALID_RESOLUTION'; end if;

  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_agreement.status <> 'DISPUTED' then raise exception 'INVALID_TRANSITION'; end if;

  update public.agreements
  set status = p_resolution::public.agreement_status
  where id = p_id and status = 'DISPUTED';
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  update public.payments
  set escrow_status = case when p_resolution = 'COMPLETED' then 'RELEASED' else 'REFUNDED' end
  where agreement_id = p_id and escrow_status = 'HELD';

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    select party_id, 'AGREEMENT', 'Dispute resolved',
      case when p_resolution = 'COMPLETED'
        then 'The disputed agreement was resolved as completed.'
        else 'The disputed agreement was cancelled.' end,
      '/agreement/' || p_id
    from (values (v_agreement.requester_user_id), (v_agreement.responder_user_id)) v(party_id)
    where party_id is not null;
  exception when others then null;
  end;
end
$function$
;

CREATE OR REPLACE FUNCTION public.admin_search_users(term text)
 RETURNS SETOF users
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.users where id = auth.uid()::text and 'admin' = any(roles)) then
    raise exception 'NOT_ADMIN';
  end if;
  return query
    select * from public.users
    where name ilike '%' || term || '%'
       or phone ilike '%' || term || '%'
       or email ilike '%' || term || '%'
    limit 20;
end $function$
;

CREATE OR REPLACE FUNCTION public.agreement_cancel(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
  v_other text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid is distinct from v_agreement.requester_user_id
     and v_uid is distinct from v_agreement.responder_user_id
     and not (v_agreement.responder_entity_id is not null and public.has_business_scope(v_agreement.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_A_PARTY';
  end if;

  if v_agreement.status <> 'ACTIVE' then raise exception 'INVALID_TRANSITION'; end if;
  if coalesce(v_agreement.payment_status, 'UNPAID') not in ('UNPAID', 'REJECTED') then
    raise exception 'PAYMENT_IN_PROGRESS';
  end if;

  update public.agreements set status = 'CANCELLED' where id = p_id and status = 'ACTIVE';
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  update public.requests set status = 'OPEN' where id = v_agreement.request_id;
  update public.proposals set status = 'SUBMITTED'
  where request_id = v_agreement.request_id and status in ('ACCEPTED', 'REJECTED');

  v_other := case when v_uid = v_agreement.requester_user_id
    then v_agreement.responder_user_id else v_agreement.requester_user_id end;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_other, 'AGREEMENT', 'Agreement cancelled',
      'The agreement for "' || coalesce(v_agreement.request_title, 'your request') || '" was cancelled before payment.',
      '/agreement/' || p_id);
  exception when others then null;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.agreement_claim_payment(p_id text, p_method text, p_amount integer DEFAULT NULL::integer, p_reference text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text; v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.requester_user_id then raise exception 'NOT_REQUESTER'; end if;
  if v_agreement.status <> 'ACTIVE' then raise exception 'INVALID_TRANSITION'; end if;
  if v_agreement.payment_status not in ('UNPAID', 'REJECTED') then raise exception 'PAYMENT_ALREADY_CLAIMED'; end if;
  if p_method not in ('UPI', 'CASH') then raise exception 'INVALID_METHOD'; end if;
  if v_agreement.agreed_price <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  update public.agreements
  set payment_method = p_method,
      payment_status = 'PENDING_CONFIRM',
      payment_amount = agreed_price,
      payment_reference = nullif(left(trim(coalesce(p_reference, '')), 200), '')
  where id = p_id and status = 'ACTIVE'
    and payment_status in ('UNPAID', 'REJECTED');
  if not found then raise exception 'PAYMENT_ALREADY_CLAIMED'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_agreement.responder_user_id, 'AGREEMENT', 'Payment claim to verify',
      'The requester says they paid ₹' || v_agreement.agreed_price::text
        || ' for "' || left(coalesce(v_agreement.request_title, 'this agreement'), 60) || '" — confirm or reject.',
      '/agreement/' || p_id);
  exception when others then null;
  end;
end
$function$
;

CREATE OR REPLACE FUNCTION public.agreement_complete(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text; v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.requester_user_id then raise exception 'NOT_REQUESTER'; end if;
  if v_agreement.status <> 'REVIEW' then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements set status = 'COMPLETED'
  where id = p_id and status = 'REVIEW';
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  update public.payments set escrow_status = 'RELEASED'
  where agreement_id = p_id and escrow_status = 'HELD';
end $function$
;

CREATE OR REPLACE FUNCTION public.agreement_confirm(p_id text)
 RETURNS agreements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
  v_other text;
  v_was_confirmed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_agreement from public.agreements
  where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_agreement.status <> 'PENDING' then raise exception 'INVALID_TRANSITION'; end if;
  if v_agreement.created_at is not null
     and v_agreement.created_at <= now() - interval '12 hours' then
    raise exception 'AGREEMENT_EXPIRED';
  end if;

  if v_uid = v_agreement.requester_user_id then
    v_was_confirmed := coalesce(v_agreement.requester_confirmed, false);
    v_other := v_agreement.responder_user_id;
    update public.agreements set requester_confirmed = true where id = p_id;
  elsif v_uid = v_agreement.responder_user_id
        or (v_agreement.responder_entity_id is not null and public.has_business_scope(v_agreement.responder_entity_id, v_uid, 'leads'))
        or (v_agreement.responder_type = 'provider' and exists(select 1 from public.providers p where p.id = v_agreement.responder_entity_id and p.user_id = v_uid))
        or public.is_admin(v_uid) then
    v_was_confirmed := coalesce(v_agreement.responder_confirmed, false);
    v_other := v_agreement.requester_user_id;
    update public.agreements set responder_confirmed = true where id = p_id;
  else
    raise exception 'NOT_A_PARTY';
  end if;

  update public.agreements
  set status = 'ACTIVE'
  where id = p_id
    and coalesce(requester_confirmed, false)
    and coalesce(responder_confirmed, false);

  select * into v_agreement from public.agreements where id = p_id;

  if not v_was_confirmed and v_agreement.status = 'PENDING' and v_other is not null then
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_other, 'AGREEMENT', 'Confirm within 12 hours',
        'The other side confirmed — confirm now or this agreement will auto-cancel.',
        '/agreement/' || p_id);
    exception when others then null;
    end;
  end if;

  return v_agreement;
end
$function$
;

CREATE OR REPLACE FUNCTION public.agreement_confirm_payment(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid is distinct from v_agreement.responder_user_id
     and not (v_agreement.responder_entity_id is not null and public.has_business_scope(v_agreement.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_RESPONDER';
  end if;

  if v_agreement.status <> 'ACTIVE' or v_agreement.payment_status <> 'PENDING_CONFIRM' then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.agreements
  set payment_status = 'PAID', status = 'DEPOSIT_PAID'
  where id = p_id and status = 'ACTIVE' and payment_status = 'PENDING_CONFIRM';
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_agreement.requester_user_id, 'AGREEMENT', 'Payment confirmed ✓',
      'Your payment for "' || left(coalesce(v_agreement.request_title, 'this agreement'), 60) || '" was confirmed.',
      '/agreement/' || p_id);
  exception when others then null;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.agreement_create_tracking_token(p_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
  v_token uuid;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.requester_user_id then raise exception 'NOT_REQUESTER'; end if;
  if v_agreement.status <> 'IN_PROGRESS' then raise exception 'INVALID_TRANSITION'; end if;

  if v_agreement.tracking_token is not null
     and exists (select 1 from public.tracking_tokens t
                 where t.id = v_agreement.tracking_token and t.expires_at > now()) then
    return v_agreement.tracking_token;
  end if;

  insert into public.tracking_tokens (agreement_id, expires_at)
  values (p_id, now() + interval '4 hours')
  returning id into v_token;

  update public.agreements set tracking_token = v_token where id = p_id;
  return v_token;
end
$function$
;

CREATE OR REPLACE FUNCTION public.agreement_dispute(p_id text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_ag public.agreements%rowtype;
  v_other text;
begin
  select * into v_ag from public.agreements where id = p_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid not in (v_ag.requester_user_id, v_ag.responder_user_id)
     and not (v_ag.responder_entity_id is not null and public.has_business_scope(v_ag.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_A_PARTY';
  end if;

  if v_ag.status not in ('IN_PROGRESS', 'REVIEW', 'DEPOSIT_PAID', 'ACTIVE') then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.agreements set status = 'DISPUTED', dispute_reason = p_reason where id = p_id;

  v_other := case when v_uid = v_ag.requester_user_id then v_ag.responder_user_id else v_ag.requester_user_id end;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_other, 'AGREEMENT', 'Dispute raised on agreement',
      'A dispute was raised on "' || left(coalesce(v_ag.request_title, 'this agreement'), 60) || '". Reason: ' || left(coalesce(p_reason, 'None stated'), 80),
      '/agreement/' || p_id);
  exception when others then null;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.agreement_reject_payment(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid is distinct from v_agreement.responder_user_id
     and not (v_agreement.responder_entity_id is not null and public.has_business_scope(v_agreement.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_RESPONDER';
  end if;

  if v_agreement.status <> 'ACTIVE' or v_agreement.payment_status <> 'PENDING_CONFIRM' then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.agreements set payment_status = 'REJECTED'
  where id = p_id and status = 'ACTIVE' and payment_status = 'PENDING_CONFIRM';
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_agreement.requester_user_id, 'AGREEMENT', 'Payment not verified',
      'Your payment claim for "' || left(coalesce(v_agreement.request_title, 'this agreement'), 60) || '" wasn''t confirmed. Try again.',
      '/agreement/' || p_id);
  exception when others then null;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.agreement_start_work(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_ag public.agreements%rowtype;
begin
  select * into v_ag from public.agreements where id = p_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid is distinct from v_ag.responder_user_id
     and not (v_ag.responder_entity_id is not null and public.has_business_scope(v_ag.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_RESPONDER';
  end if;

  if v_ag.status <> 'DEPOSIT_PAID' then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements set status = 'IN_PROGRESS' where id = p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.agreement_submit_review(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_ag public.agreements%rowtype;
begin
  select * into v_ag from public.agreements where id = p_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid is distinct from v_ag.responder_user_id
     and not (v_ag.responder_entity_id is not null and public.has_business_scope(v_ag.responder_entity_id, v_uid, 'leads'))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_RESPONDER';
  end if;

  if v_ag.status <> 'IN_PROGRESS' then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements set status = 'REVIEW' where id = p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.agreement_update_live_status(p_id text, p_status text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS agreements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_status not in ('CONFIRMED', 'LEAVING', 'ON_THE_WAY', 'ARRIVED', 'WORKING', 'DONE') then
    raise exception 'INVALID_LIVE_STATUS';
  end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then raise exception 'INVALID_LATITUDE'; end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then raise exception 'INVALID_LONGITUDE'; end if;

  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.responder_user_id then raise exception 'NOT_RESPONDER'; end if;
  if v_agreement.status <> 'IN_PROGRESS' then raise exception 'INVALID_TRANSITION'; end if;

  update public.agreements
  set live_status = p_status,
      provider_lat = coalesce(p_lat, provider_lat),
      provider_lng = coalesce(p_lng, provider_lng)
  where id = p_id and status = 'IN_PROGRESS'
  returning * into v_agreement;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  return v_agreement;
end
$function$
;

CREATE OR REPLACE FUNCTION public.aliases_available(p_aliases text[])
 RETURNS TABLE(alias text, available boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    t.candidate as alias,
    not exists (
      select 1
        from public.users u
       where lower(u.alias) = lower(t.candidate)
         and u.alias is not null
         and u.alias <> ''
         and u.id <> coalesce(auth.uid()::text, '')
    ) as available
  from unnest(p_aliases) as t(candidate)
  limit 10;
$function$
;

CREATE OR REPLACE FUNCTION public.appointment_accept_with_eta(p_id text, p_eta_text text)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_apt public.appointments%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_apt from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if v_apt.target_type <> 'BUSINESS'
     or not public.has_business_scope(v_apt.target_id, v_uid, 'appointments') then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_apt.status <> 'PENDING' then raise exception 'INVALID_TRANSITION'; end if;

  -- Set the ETA and the status in one UPDATE so the AFTER trigger sees both and
  -- can put the ETA in its message. No notification inserted here — doing so
  -- duplicated the trigger's.
  update public.appointments
     set status = 'ACCEPTED',
         delivery_eta_text = nullif(trim(coalesce(p_eta_text, '')), '')
   where id = p_id returning * into v_apt;

  return v_apt;
end $function$
;

CREATE OR REPLACE FUNCTION public.appointment_claim_payment(p_id text, p_method text, p_amount numeric DEFAULT NULL::numeric, p_reference text DEFAULT NULL::text)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_amount numeric;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_method not in ('UPI', 'CASH') then raise exception 'INVALID_METHOD'; end if;

  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if v_appointment.customer_user_id is distinct from v_uid or v_appointment.is_walk_in then
    raise exception 'NOT_CUSTOMER';
  end if;
  if v_appointment.status not in ('PENDING', 'ACCEPTED', 'COMPLETED') then
    raise exception 'INVALID_TRANSITION';
  end if;
  if v_appointment.payment_status not in ('UNPAID', 'REJECTED') then
    raise exception 'PAYMENT_ALREADY_CLAIMED';
  end if;

  v_amount := coalesce(v_appointment.package_price, p_amount);
  if v_amount is null or v_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  update public.appointments
  set payment_method = p_method,
      payment_status = 'PENDING_CONFIRM',
      payment_amount = v_amount,
      payment_reference = nullif(left(trim(coalesce(p_reference, '')), 200), '')
  where id = p_id and payment_status in ('UNPAID', 'REJECTED')
  returning * into v_appointment;
  if not found then raise exception 'PAYMENT_ALREADY_CLAIMED'; end if;
  return v_appointment;
end
$function$
;

CREATE OR REPLACE FUNCTION public.appointment_confirm_payment(p_id text)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_allowed := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_scope(v_appointment.target_id, v_uid, 'appointments'));
  if not v_allowed then raise exception 'NOT_TARGET_MANAGER'; end if;
  if v_appointment.payment_status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.appointments set payment_status = 'PAID'
  where id = p_id and payment_status = 'PENDING_CONFIRM'
  returning * into v_appointment;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  return v_appointment;
end
$function$
;

CREATE OR REPLACE FUNCTION public.appointment_create(p_target_type text, p_target_id text, p_scheduled_for timestamp with time zone, p_date_label text, p_time_label text, p_notes text DEFAULT NULL::text, p_photo_url text DEFAULT NULL::text, p_package_id text DEFAULT NULL::text, p_package_name text DEFAULT NULL::text, p_package_price numeric DEFAULT NULL::numeric, p_items jsonb DEFAULT NULL::jsonb, p_fulfillment_type text DEFAULT 'IN_STORE'::text, p_delivery_address_line text DEFAULT NULL::text, p_delivery_lat double precision DEFAULT NULL::double precision, p_delivery_lng double precision DEFAULT NULL::double precision, p_requested_delivery_window text DEFAULT NULL::text, p_party_size integer DEFAULT 1, p_target_package_key text DEFAULT NULL::text)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_owner text; v_target_name text; v_target_avatar text;
  v_customer_name text; v_customer_avatar text;
  v_appointment public.appointments%rowtype;
  v_items jsonb := p_items;
  v_delivery_ok boolean;
  v_accepting boolean;
  v_target_lat double precision;
  v_target_lng double precision;
  v_own_radius double precision;
  v_cust_lat double precision;
  v_cust_lng double precision;
  v_distance_km double precision;
  v_is_out_of_range boolean := false;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_target_type not in ('BUSINESS', 'PROVIDER') then raise exception 'INVALID_TARGET_TYPE'; end if;
  if p_scheduled_for is null or p_scheduled_for <= now() then raise exception 'INVALID_APPOINTMENT_TIME'; end if;
  if p_fulfillment_type not in ('IN_STORE', 'DELIVERY') then raise exception 'INVALID_FULFILLMENT_TYPE'; end if;
  if p_fulfillment_type = 'DELIVERY' and (p_delivery_lat is null or p_delivery_lng is null) then
    raise exception 'DELIVERY_ADDRESS_REQUIRED';
  end if;
  if coalesce(p_party_size, 1) < 1 then raise exception 'INVALID_PARTY_SIZE'; end if;

  if p_target_type = 'BUSINESS' then
    select b.owner_user_id, b.name, b.cover_image, b.delivery_enabled, b.is_open_now,
           b.lat, b.lng, b.broadcast_radius
    into v_owner, v_target_name, v_target_avatar, v_delivery_ok, v_accepting,
         v_target_lat, v_target_lng, v_own_radius
    from public.businesses b where b.id = p_target_id;
  else
    select p.user_id, p.display_name, p.avatar, false, p.is_open_now,
           p.lat, p.lng, p.service_radius_km
    into v_owner, v_target_name, v_target_avatar, v_delivery_ok, v_accepting,
         v_target_lat, v_target_lng, v_own_radius
    from public.providers p where p.id = p_target_id;
  end if;
  if v_owner is null then raise exception 'TARGET_NOT_FOUND'; end if;

  if coalesce(v_accepting, true) = false then
    raise exception 'NOT_ACCEPTING_APPOINTMENTS';
  end if;

  if p_fulfillment_type = 'DELIVERY' and coalesce(v_delivery_ok, false) = false then
    raise exception 'DELIVERY_NOT_OFFERED';
  end if;

  if p_fulfillment_type = 'DELIVERY' then
    v_cust_lat := p_delivery_lat;
    v_cust_lng := p_delivery_lng;
  else
    select u.lat, u.lng into v_cust_lat, v_cust_lng from public.users u where u.id = v_uid;
  end if;

  if v_target_lat is not null and v_target_lng is not null and v_cust_lat is not null and v_cust_lng is not null then
    v_distance_km := ST_Distance(
      ST_SetSRID(ST_MakePoint(v_target_lng, v_target_lat), 4326)::geography,
      ST_SetSRID(ST_MakePoint(v_cust_lng, v_cust_lat), 4326)::geography
    ) / 1000.0;
    if v_distance_km > greatest(coalesce(nullif(v_own_radius, 0), 5), 0) then
      v_is_out_of_range := true;
    end if;
  end if;

  select coalesce(nullif(trim(u.name), ''), 'Customer'), u.avatar
  into v_customer_name, v_customer_avatar
  from public.users u where u.id = v_uid;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, customer_avatar,
    scheduled_for, date_label, time_label, notes, photo_url,
    package_id, package_name, package_price, status,
    fulfillment_type, delivery_address_line, delivery_lat, delivery_lng,
    requested_delivery_window, party_size, target_package_key, is_out_of_range
  ) values (
    p_target_type, p_target_id, v_owner, v_target_name, v_target_avatar,
    v_uid, v_customer_name, v_customer_avatar,
    p_scheduled_for, p_date_label, p_time_label,
    nullif(left(trim(coalesce(p_notes, '')), 2000), ''), p_photo_url,
    p_package_id, p_package_name, p_package_price, 'PENDING',
    p_fulfillment_type, nullif(trim(coalesce(p_delivery_address_line, '')), ''), p_delivery_lat, p_delivery_lng,
    nullif(trim(coalesce(p_requested_delivery_window, '')), ''), coalesce(p_party_size, 1),
    nullif(p_target_package_key, ''), v_is_out_of_range
  ) returning * into v_appointment;

  if (v_items is null or jsonb_array_length(v_items) = 0) and p_package_id is not null then
    v_items := jsonb_build_array(jsonb_build_object(
      'catalog_item_id', p_package_id,
      'item_name', coalesce(p_package_name, 'Item'),
      'unit_price', round(coalesce(p_package_price, 0) / greatest(coalesce(p_party_size, 1), 1), 2),
      'quantity', greatest(coalesce(p_party_size, 1), 1)
    ));
  end if;

  if v_items is not null and jsonb_array_length(v_items) > 0 then
    insert into public.appointment_items (appointment_id, catalog_item_id, item_name, unit_price, quantity)
    select v_appointment.id, x.catalog_item_id, coalesce(x.item_name, 'Item'), coalesce(x.unit_price, 0), x.quantity
    from jsonb_to_recordset(v_items) as x(catalog_item_id text, item_name text, unit_price numeric, quantity int)
    where coalesce(x.quantity, 0) > 0;

    perform public.reserve_catalog_items(v_items);
  end if;

  return v_appointment;
end
$function$
;

CREATE OR REPLACE FUNCTION public.appointment_create_tracking_token(p_appointment_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text; v_biz text; v_customer text; v_existing uuid; v_token uuid;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select a.target_id, a.customer_user_id into v_biz, v_customer from public.appointments a
    where a.id = p_appointment_id and a.target_type = 'BUSINESS';
  if v_biz is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if not (public.has_business_scope(v_biz, v_uid, 'appointments')
          or v_uid = v_customer
          or exists (select 1 from public.appointment_deliveries d
                     where d.appointment_id = p_appointment_id and d.agent_user_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;
  select id into v_existing from public.tracking_tokens
    where appointment_id = p_appointment_id and expires_at > now()
    order by expires_at desc limit 1;
  if v_existing is not null then return v_existing; end if;
  insert into public.tracking_tokens (appointment_id, expires_at)
    values (p_appointment_id, now() + interval '4 hours') returning id into v_token;
  return v_token;
end $function$
;

CREATE OR REPLACE FUNCTION public.appointment_create_walk_in(p_target_type text, p_target_id text, p_customer_name text, p_customer_phone text, p_scheduled_for timestamp with time zone, p_date_label text, p_time_label text, p_package_id text DEFAULT NULL::text, p_package_name text DEFAULT NULL::text, p_package_price numeric DEFAULT NULL::numeric, p_items jsonb DEFAULT NULL::jsonb, p_party_size integer DEFAULT 1, p_target_package_key text DEFAULT NULL::text)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_owner text;
  v_target_name text;
  v_target_avatar text;
  v_appointment public.appointments%rowtype;
  v_allowed boolean := false;
  v_items jsonb := p_items;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_target_type not in ('BUSINESS', 'PROVIDER') then raise exception 'INVALID_TARGET_TYPE'; end if;
  if nullif(trim(coalesce(p_customer_name, '')), '') is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if p_scheduled_for is null or p_scheduled_for <= now() then raise exception 'INVALID_APPOINTMENT_TIME'; end if;
  if coalesce(p_party_size, 1) < 1 then raise exception 'INVALID_PARTY_SIZE'; end if;

  if p_target_type = 'BUSINESS' then
    select b.owner_user_id, b.name, b.cover_image
    into v_owner, v_target_name, v_target_avatar
    from public.businesses b where b.id = p_target_id;
    v_allowed := public.has_business_scope(p_target_id, v_uid, 'appointments');
  else
    select p.user_id, p.display_name, p.avatar
    into v_owner, v_target_name, v_target_avatar
    from public.providers p where p.id = p_target_id;
    v_allowed := v_owner = v_uid;
  end if;
  if v_owner is null then raise exception 'TARGET_NOT_FOUND'; end if;
  if not v_allowed then raise exception 'NOT_TARGET_MANAGER'; end if;

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, scheduled_for, date_label, time_label,
    notes, package_id, package_name, package_price, status, is_walk_in, party_size,
    target_package_key
  ) values (
    p_target_type, p_target_id, v_owner, v_target_name, v_target_avatar,
    v_uid, left(trim(p_customer_name), 200), p_scheduled_for,
    p_date_label, p_time_label,
    case when nullif(trim(coalesce(p_customer_phone, '')), '') is null
      then 'Walk-in'
      else 'Walk-in • ' || left(trim(p_customer_phone), 30) end,
    p_package_id, p_package_name, p_package_price, 'ACCEPTED', true, coalesce(p_party_size, 1),
    nullif(p_target_package_key, '')
  ) returning * into v_appointment;

  if (v_items is null or jsonb_array_length(v_items) = 0) and p_package_id is not null then
    -- package_price is the line TOTAL for the whole party, so the per-unit
    -- price is recovered by dividing it back out. Quantity is the party size,
    -- which is what reserve_catalog_items() needs in order to hold the right
    -- amount of stock.
    v_items := jsonb_build_array(jsonb_build_object(
      'catalog_item_id', p_package_id,
      'item_name', coalesce(p_package_name, 'Item'),
      'unit_price', round(coalesce(p_package_price, 0) / greatest(coalesce(p_party_size, 1), 1), 2),
      'quantity', greatest(coalesce(p_party_size, 1), 1)
    ));
  end if;

  if v_items is not null and jsonb_array_length(v_items) > 0 then
    insert into public.appointment_items (appointment_id, catalog_item_id, item_name, unit_price, quantity)
    select v_appointment.id, x.catalog_item_id, coalesce(x.item_name, 'Item'), coalesce(x.unit_price, 0), x.quantity
    from jsonb_to_recordset(v_items) as x(catalog_item_id text, item_name text, unit_price numeric, quantity int)
    where coalesce(x.quantity, 0) > 0;

    perform public.reserve_catalog_items(v_items);
  end if;

  return v_appointment;
end
$function$
;

CREATE OR REPLACE FUNCTION public.appointment_create_walk_in_payment(p_target_id text, p_package_name text, p_package_price numeric, p_method text, p_reference text DEFAULT NULL::text, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_owner text;
  v_target_name text;
  v_target_avatar text;
  v_customer_name text;
  v_customer_avatar text;
  v_appointment public.appointments%rowtype;
  v_items jsonb := p_items;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_method not in ('UPI', 'CASH') then raise exception 'INVALID_METHOD'; end if;
  if p_package_price is null or p_package_price <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if nullif(trim(coalesce(p_package_name, '')), '') is null then raise exception 'PACKAGE_NAME_REQUIRED'; end if;

  select b.owner_user_id, b.name, b.cover_image
  into v_owner, v_target_name, v_target_avatar
  from public.businesses b where b.id = p_target_id;
  if v_owner is null then raise exception 'TARGET_NOT_FOUND'; end if;
  if v_owner = v_uid then raise exception 'OWNER_CANNOT_SELF_PAY'; end if;

  select coalesce(nullif(trim(u.name), ''), 'Customer'), u.avatar
  into v_customer_name, v_customer_avatar
  from public.users u where u.id = v_uid;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, customer_avatar,
    scheduled_for, date_label, time_label,
    package_id, package_name, package_price, status, is_walk_in,
    payment_method, payment_status, payment_amount, payment_reference
  ) values (
    'BUSINESS', p_target_id, v_owner, v_target_name, v_target_avatar,
    v_uid, v_customer_name, v_customer_avatar,
    now(), 'Today', 'Walk-in',
    'walkin_cart', left(trim(p_package_name), 200), p_package_price, 'ACCEPTED', false,
    p_method, 'PENDING_CONFIRM', p_package_price,
    nullif(left(trim(coalesce(p_reference, '')), 200), '')
  ) returning * into v_appointment;

  if v_items is not null and jsonb_array_length(v_items) > 0 then
    insert into public.appointment_items (appointment_id, catalog_item_id, item_name, unit_price, quantity)
    select v_appointment.id, x.catalog_item_id, coalesce(x.item_name, 'Item'), coalesce(x.unit_price, 0), x.quantity
    from jsonb_to_recordset(v_items) as x(catalog_item_id text, item_name text, unit_price numeric, quantity int)
    where coalesce(x.quantity, 0) > 0;

    perform public.reserve_catalog_items(v_items);
  end if;

  return v_appointment;
end
$function$
;

CREATE OR REPLACE FUNCTION public.appointment_record_walk_in_payment(p_id text, p_method text, p_amount numeric DEFAULT NULL::numeric, p_reference text DEFAULT NULL::text)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_allowed boolean;
  v_amount numeric;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_method not in ('UPI', 'CASH') then raise exception 'INVALID_METHOD'; end if;

  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  v_allowed := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_scope(v_appointment.target_id, v_uid, 'appointments'));
  if not v_allowed then raise exception 'NOT_APPOINTMENT_MANAGER'; end if;
  if v_appointment.payment_status not in ('UNPAID', 'REJECTED') then raise exception 'INVALID_TRANSITION'; end if;

  v_amount := coalesce(p_amount, v_appointment.package_price);
  if v_amount is null or v_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  update public.appointments
  set payment_method = p_method, payment_status = 'PAID', payment_amount = v_amount,
      payment_reference = nullif(left(trim(coalesce(p_reference, '')), 200), '')
  where id = p_id and payment_status in ('UNPAID', 'REJECTED')
  returning * into v_appointment;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  return v_appointment;
end
$function$
;

CREATE OR REPLACE FUNCTION public.appointment_reject_payment(p_id text)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_allowed := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_scope(v_appointment.target_id, v_uid, 'appointments'));
  if not v_allowed then raise exception 'NOT_TARGET_MANAGER'; end if;
  if v_appointment.payment_status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.appointments set payment_status = 'REJECTED'
  where id = p_id and payment_status = 'PENDING_CONFIRM'
  returning * into v_appointment;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  return v_appointment;
end
$function$
;

CREATE OR REPLACE FUNCTION public.appointment_set_unpaid_amount(p_id text, p_amount numeric)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  v_allowed := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_scope(v_appointment.target_id, v_uid, 'appointments'));
  if not v_allowed then raise exception 'NOT_APPOINTMENT_MANAGER'; end if;

  update public.appointments
  set package_price = p_amount, payment_amount = p_amount, payment_status = 'UNPAID'
  where id = p_id
  returning * into v_appointment;
  return v_appointment;
end
$function$
;

CREATE OR REPLACE FUNCTION public.appointment_transition(p_id text, p_status text, p_response_note text DEFAULT NULL::text)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_appointment public.appointments%rowtype;
  v_is_customer boolean;
  v_is_manager boolean;
  v_cancelled_by text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_appointment from public.appointments where id = p_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;

  v_is_customer := v_appointment.customer_user_id = v_uid and not v_appointment.is_walk_in;
  v_is_manager := v_appointment.target_owner_user_id = v_uid
    or (v_appointment.target_type = 'BUSINESS'
        and public.has_business_scope(v_appointment.target_id, v_uid, 'appointments'));

  if v_is_customer and p_status = 'CANCELLED'
     and v_appointment.status in ('PENDING', 'ACCEPTED') then
    v_cancelled_by := 'CUSTOMER';
  elsif v_is_manager and v_appointment.status = 'PENDING'
        and p_status in ('ACCEPTED', 'REJECTED') then
    v_cancelled_by := null;
  elsif v_is_manager and v_appointment.status = 'ACCEPTED'
        and p_status = 'CANCELLED' then
    v_cancelled_by := 'OWNER';
  elsif v_is_manager and v_appointment.status = 'COMPLETED'
        and p_status = 'NO_SHOW' then
    v_cancelled_by := null;
  else
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.appointments
  set status = p_status,
      response_note = case when p_response_note is null then response_note
        else nullif(left(trim(p_response_note), 1000), '') end,
      cancelled_by = case when p_status = 'CANCELLED' then v_cancelled_by else cancelled_by end
  where id = p_id and status = v_appointment.status
  returning * into v_appointment;
  if not found then raise exception 'INVALID_TRANSITION'; end if;
  return v_appointment;
end
$function$
;

CREATE OR REPLACE FUNCTION public.appointment_update_delivery_status(p_delivery_id text, p_status text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS appointment_deliveries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_row public.appointment_deliveries%rowtype;
  v_old_status text;
  v_new text;
  v_batch public.delivery_batches%rowtype;
  v_customer text;
  v_remaining int;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_status not in ('LEAVING','ON_THE_WAY','ARRIVED','DONE') then raise exception 'INVALID_LIVE_STATUS'; end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then raise exception 'INVALID_LATITUDE'; end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then raise exception 'INVALID_LONGITUDE'; end if;
  select * into v_row from public.appointment_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_uid is distinct from v_row.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_row.status in ('DELIVERED','CANCELLED') then raise exception 'INVALID_TRANSITION'; end if;
  if p_status = 'DONE' and v_row.handoff_code is not null and not v_row.handoff_verified then
    raise exception 'HANDOFF_NOT_VERIFIED';
  end if;

  v_old_status := v_row.status;

  if v_row.batch_id is not null then
    select * into v_batch from public.delivery_batches where id = v_row.batch_id for update;
    if v_batch.status not in ('ACCEPTED','IN_PROGRESS') then
      raise exception 'BATCH_NOT_ACCEPTED';
    end if;
  end if;

  v_new := case when p_status in ('LEAVING','ON_THE_WAY') then 'EN_ROUTE'
                when p_status = 'ARRIVED' then 'ARRIVED'
                when p_status = 'DONE' then 'DELIVERED' end;

  update public.appointment_deliveries
     set live_status = p_status, status = v_new,
         lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng),
         delivered_at = case when p_status = 'DONE' then now() else delivered_at end
   where id = p_delivery_id returning * into v_row;

  if v_batch.id is not null then
    if v_batch.status = 'ACCEPTED' and v_new = 'EN_ROUTE' then
      update public.delivery_batches set status = 'IN_PROGRESS' where id = v_batch.id;
    end if;
    if v_new in ('DELIVERED','CANCELLED') then
      select count(*) into v_remaining from public.appointment_deliveries
        where batch_id = v_batch.id and status not in ('DELIVERED','CANCELLED');
      if v_remaining = 0 then
        update public.delivery_batches set status = 'COMPLETED', completed_at = now() where id = v_batch.id;
      end if;
    end if;
  end if;

  select a.customer_user_id into v_customer from public.appointments a where a.id = v_row.appointment_id;
  if v_customer is not null then
    begin
      if v_new = 'EN_ROUTE' and v_old_status is distinct from 'EN_ROUTE' then
        insert into public.notifications (user_id, type, title, body, deep_link)
        values (v_customer, 'DELIVERY', 'Your order is out for delivery',
                'Your delivery agent is on the way.', '/appointments');
      elsif v_new = 'DELIVERED' then
        insert into public.notifications (user_id, type, title, body, deep_link)
        values (v_customer, 'DELIVERY', 'Delivered ✓', 'Your order has been delivered.', '/appointments');
      end if;
    exception when others then null; end;
  end if;

  return v_row;
end $function$
;

CREATE OR REPLACE FUNCTION public.assign_delivery(p_appointment_id text, p_agent_user_id text)
 RETURNS appointment_deliveries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text; v_biz text; v_row public.appointment_deliveries%rowtype; v_code text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select a.target_id into v_biz from public.appointments a
    where a.id = p_appointment_id and a.target_type = 'BUSINESS';
  if v_biz is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if not public.has_business_scope(v_biz, v_uid, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  if not public.has_business_access(v_biz, p_agent_user_id) then raise exception 'AGENT_NOT_TEAM_MEMBER'; end if;
  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  select * into v_row from public.appointment_deliveries
    where appointment_id = p_appointment_id and status in ('ASSIGNED','EN_ROUTE','ARRIVED') for update;
  if found then
    update public.appointment_deliveries
       set agent_user_id = p_agent_user_id,
           status = 'ASSIGNED',
           handoff_verified = false,
           handoff_code = v_code,
           batch_id = null,
           stop_order = null
     where id = v_row.id returning * into v_row;
  else
    insert into public.appointment_deliveries (appointment_id, business_id, agent_user_id, status, handoff_code)
    values (p_appointment_id, v_biz, p_agent_user_id, 'ASSIGNED', v_code) returning * into v_row;
  end if;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (p_agent_user_id, 'QUEUE_UPDATE', 'New delivery assigned', 'You have a new delivery to complete.', '/delivery');
  exception when others then null; end;
  return v_row;
end $function$
;

CREATE OR REPLACE FUNCTION public.assign_delivery_batch(p_appointment_ids text[], p_agent_user_id text)
 RETURNS delivery_batches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_biz text;
  v_count int;
  v_batch public.delivery_batches%rowtype;
  v_apt_id text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_appointment_ids is null or array_length(p_appointment_ids, 1) is null then
    raise exception 'NO_APPOINTMENTS_SELECTED';
  end if;

  select a.target_id into v_biz from public.appointments a
    where a.id = p_appointment_ids[1] and a.target_type = 'BUSINESS';
  if v_biz is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if not public.has_business_scope(v_biz, v_uid, 'appointments') then raise exception 'NOT_ALLOWED'; end if;
  if not public.has_business_access(v_biz, p_agent_user_id) then raise exception 'AGENT_NOT_TEAM_MEMBER'; end if;

  select count(*) into v_count
    from public.appointments a
    where a.id = any(p_appointment_ids)
      and a.target_type = 'BUSINESS' and a.target_id = v_biz
      and a.fulfillment_type = 'DELIVERY' and a.status = 'ACCEPTED'
      and not exists (
        select 1 from public.appointment_deliveries d
        where d.appointment_id = a.id and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
      );
  if v_count <> array_length(p_appointment_ids, 1) then
    raise exception 'SOME_APPOINTMENTS_NOT_ELIGIBLE';
  end if;

  insert into public.delivery_batches (business_id, agent_user_id)
    values (v_biz, p_agent_user_id) returning * into v_batch;

  foreach v_apt_id in array p_appointment_ids loop
    insert into public.appointment_deliveries (appointment_id, business_id, agent_user_id, status, handoff_code, batch_id)
    values (v_apt_id, v_biz, p_agent_user_id, 'ASSIGNED',
            lpad((floor(random() * 1000000))::int::text, 6, '0'), v_batch.id);
  end loop;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (p_agent_user_id, 'QUEUE_UPDATE', 'New delivery run',
            'You have ' || array_length(p_appointment_ids, 1) || ' deliveries to accept.', '/delivery');
  exception when others then null; end;

  return v_batch;
end $function$
;

CREATE OR REPLACE FUNCTION public.booked_slots(p_target_id text)
 RETURNS TABLE(scheduled_for timestamp with time zone, package_id text, used_spots integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.scheduled_for, a.package_id, sum(a.party_size)::int
  from public.appointments a
  where a.target_id = p_target_id
    and (
      a.status = 'ACCEPTED'
      or (
        a.status = 'PENDING'
        and a.created_at > now() - interval '2 hours'
        and coalesce(a.is_out_of_range, false) = false
      )
    )
  group by a.scheduled_for, a.package_id;
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_deal_close(p_deal_id text, p_outcome text DEFAULT NULL::text)
 RETURNS bulk_deals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;

  -- BLK-3: Support delegated team member with catalog scope
  if v_deal.owner_user_id <> v_uid
     and not public.has_business_scope(v_deal.business_id, v_uid, 'catalog')
     and not public.is_admin(v_uid) then
    raise exception 'NOT_OWNER';
  end if;

  if v_deal.closed_at is not null then raise exception 'DEAL_ALREADY_CLOSED'; end if;
  if p_outcome is not null and p_outcome not in ('FULFILLED','REFUNDED') then
    raise exception 'INVALID_OUTCOME';
  end if;

  perform public._bulk_deal_close_internal(p_deal_id, 'MANUAL', p_outcome);

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  return v_deal;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_deal_delete(p_deal_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledger text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;

  if v_deal.owner_user_id <> v_uid
     and not public.has_business_scope(v_deal.business_id, v_uid, 'catalog')
     and not public.is_admin(v_uid) then
    raise exception 'NOT_ALLOWED';
  end if;

  -- BLK-2: Prevent deleting campaign if active unredeemed passes exist
  if exists (
    select 1 from public.bulk_deal_tokens
    where deal_id = p_deal_id and status = 'ISSUED'
  ) then
    raise exception 'CANNOT_DELETE_ACTIVE_TOKENS';
  end if;

  for v_pledger in
    select user_id from public.bulk_deal_pledges
    where deal_id = p_deal_id and deposit_status = 'PAID'
  loop
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_pledger, 'BULK_DEAL_DEPOSIT_REJECTED', 'Campaign cancelled',
        'The business removed "' || left(v_deal.title, 60) || '" — your paid deposit needs to be sorted out with them directly.',
        '/business/' || v_deal.business_id);
    exception when others then null;
    end;
  end loop;

  delete from public.bulk_deals where id = p_deal_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_deal_extend(p_deal_id text, p_new_closes_at timestamp with time zone)
 RETURNS bulk_deals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledger record;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;

  -- BLK-3: Support delegated team member with catalog scope
  if v_deal.owner_user_id <> v_uid
     and not public.has_business_scope(v_deal.business_id, v_uid, 'catalog')
     and not public.is_admin(v_uid) then
    raise exception 'NOT_OWNER';
  end if;

  if v_deal.close_outcome is not null then raise exception 'DEAL_ALREADY_RESOLVED'; end if;
  if p_new_closes_at <= now() then raise exception 'DEADLINE_MUST_BE_FUTURE'; end if;

  update public.bulk_deals set closes_at = p_new_closes_at, closed_at = null where id = p_deal_id
  returning * into v_deal;

  for v_pledger in select user_id from public.bulk_deal_pledges where deal_id = p_deal_id loop
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_pledger.user_id, 'BULK_DEAL_EXTENDED', '"' || v_deal.title || '" got more time',
            'The business extended this campaign — it''s still collecting pledges.', '/business/' || v_deal.business_id);
  end loop;

  return v_deal;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_deal_pledge_claim_deposit(p_deal_id text, p_method text, p_reference text DEFAULT NULL::text)
 RETURNS bulk_deal_pledges
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledge public.bulk_deal_pledges%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_method not in ('UPI','CASH') then raise exception 'INVALID_METHOD'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.closed_at is not null then raise exception 'DEAL_CLOSED'; end if;

  select * into v_pledge from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = v_uid for update;
  if not found then raise exception 'NOT_PLEDGED'; end if;
  if v_pledge.deposit_status not in ('UNPAID','REJECTED') then raise exception 'INVALID_TRANSITION'; end if;

  if v_deal.deposit_amount is null then raise exception 'NO_DEPOSIT_REQUIRED'; end if;

  update public.bulk_deal_pledges
     set deposit_method = p_method,
         deposit_status = 'PENDING_CONFIRM',
         deposit_amount = v_deal.deposit_amount,
         deposit_reference = nullif(left(trim(coalesce(p_reference,'')), 200), '')
   where deal_id = p_deal_id and user_id = v_uid
  returning * into v_pledge;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_deal.owner_user_id, 'BULK_DEAL_DEPOSIT_CLAIMED', 'Deposit claim to verify',
      'A pledger says they paid the ₹' || v_deal.deposit_amount::text
        || ' deposit for "' || left(v_deal.title, 60) || '" — confirm or reject.',
      '/business/' || v_deal.business_id || '/manage/bulk-deals/' || v_deal.id);
  exception when others then null;
  end;

  return v_pledge;
end
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_deal_pledge_confirm_deposit(p_deal_id text, p_pledger_user_id text)
 RETURNS bulk_deal_pledges
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledge public.bulk_deal_pledges%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if not public.has_business_access(v_deal.business_id, v_uid) then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_pledge from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = p_pledger_user_id for update;
  if not found then raise exception 'PLEDGE_NOT_FOUND'; end if;
  if v_pledge.deposit_status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.bulk_deal_pledges set deposit_status = 'PAID'
   where deal_id = p_deal_id and user_id = p_pledger_user_id
  returning * into v_pledge;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (p_pledger_user_id, 'BULK_DEAL_DEPOSIT_CONFIRMED', 'Deposit confirmed',
          'Your deposit for "' || v_deal.title || '" was confirmed.', '/business/' || v_deal.business_id);

  -- The UPDATE above already fired trg_check_bulk_deal_target (it watches
  -- deposit_status) — this is exactly the moment a pledge starts counting
  -- toward MOQ, and the trigger, not this function, is what checks it.

  return v_pledge;
end
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_deal_pledge_join(p_deal_id text, p_quantity integer DEFAULT 1, p_notes text DEFAULT NULL::text, p_delivery_address text DEFAULT NULL::text)
 RETURNS bulk_deals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_mine integer;
  v_others integer;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'INVALID_QUANTITY'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.status <> 'ACTIVE' then raise exception 'DEAL_NOT_ACTIVE'; end if;
  if v_deal.closed_at is not null then raise exception 'DEAL_CLOSED'; end if;
  if v_deal.owner_user_id = v_uid then raise exception 'OWNER_CANNOT_PLEDGE'; end if;

  if v_deal.fulfillment_type = 'DOORSTEP'
     and nullif(trim(coalesce(p_delivery_address, '')), '') is null then
    raise exception 'DELIVERY_ADDRESS_REQUIRED';
  end if;

  if v_deal.available_quota is not null then
    select quantity into v_mine
      from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = v_uid;
    v_others := greatest(coalesce(v_deal.pledged_quantity, 0) - coalesce(v_mine, 0), 0);
    if v_others + p_quantity > v_deal.available_quota then
      raise exception 'INSUFFICIENT_QUOTA';
    end if;
  end if;

  insert into public.bulk_deal_pledges (deal_id, user_id, quantity, notes, delivery_address)
  values (p_deal_id, v_uid, p_quantity,
          nullif(left(trim(coalesce(p_notes,'')), 300), ''),
          nullif(left(trim(coalesce(p_delivery_address,'')), 400), ''))
  on conflict (deal_id, user_id) do update
    set quantity = excluded.quantity,
        notes = excluded.notes,
        delivery_address = excluded.delivery_address;

  update public.bulk_deals
     set pledged_quantity = (select coalesce(sum(quantity), 0) from public.bulk_deal_pledges where deal_id = p_deal_id)
   where id = p_deal_id
  returning * into v_deal;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_deal.owner_user_id, 'BULK_DEAL_PLEDGE', 'New pledge',
      'Someone pledged ' || p_quantity::text || (case when p_quantity = 1 then ' unit' else ' units' end)
        || ' to "' || left(v_deal.title, 60) || '".',
      '/business/' || v_deal.business_id || '/manage/bulk-deals/' || v_deal.id);
  exception when others then null;
  end;

  return v_deal;
end
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_deal_pledge_leave(p_deal_id text)
 RETURNS bulk_deals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id for update;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if v_deal.closed_at is not null then raise exception 'DEAL_CLOSED'; end if;

  delete from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = v_uid;

  update public.bulk_deals
     set pledged_quantity = (select coalesce(sum(quantity), 0) from public.bulk_deal_pledges where deal_id = p_deal_id)
   where id = p_deal_id
  returning * into v_deal;

  return v_deal;
end
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_deal_pledge_reject_deposit(p_deal_id text, p_pledger_user_id text)
 RETURNS bulk_deal_pledges
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
  v_pledge public.bulk_deal_pledges%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if not public.has_business_access(v_deal.business_id, v_uid) then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_pledge from public.bulk_deal_pledges where deal_id = p_deal_id and user_id = p_pledger_user_id for update;
  if not found then raise exception 'PLEDGE_NOT_FOUND'; end if;
  if v_pledge.deposit_status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.bulk_deal_pledges set deposit_status = 'REJECTED'
   where deal_id = p_deal_id and user_id = p_pledger_user_id
  returning * into v_pledge;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (p_pledger_user_id, 'BULK_DEAL_DEPOSIT_REJECTED', 'Couldn''t verify your deposit',
          'The business could not verify your deposit for "' || v_deal.title || '". You can try again.', '/business/' || v_deal.business_id);

  return v_pledge;
end
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_deal_redemption_stats(p_deal_id text)
 RETURNS TABLE(total integer, redeemed integer, pending integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::int,
         count(*) filter (where status = 'REDEEMED')::int,
         count(*) filter (where status = 'ISSUED')::int
    from public.bulk_deal_tokens
   where deal_id = p_deal_id;
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_deal_token_redeem(p_token_code text)
 RETURNS bulk_deal_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_token public.bulk_deal_tokens%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_token from public.bulk_deal_tokens
   where token_code = upper(trim(p_token_code)) for update;
  if not found then raise exception 'TOKEN_NOT_FOUND'; end if;

  if not (
    v_token.issuer_user_id = v_uid
    or (v_token.business_id is not null and public.has_business_scope(v_token.business_id, v_uid, 'appointments'))
  ) then
    raise exception 'NOT_AUTHORIZED_TO_REDEEM';
  end if;

  if v_token.status = 'REDEEMED' then raise exception 'ALREADY_REDEEMED'; end if;
  if v_token.status = 'EXPIRED' or (v_token.valid_until is not null and v_token.valid_until < now()) then
    raise exception 'TOKEN_EXPIRED';
  end if;

  update public.bulk_deal_tokens
     set status = 'REDEEMED', redeemed_at = now(), redeemed_by = v_uid
   where id = v_token.id and status = 'ISSUED'
  returning * into v_token;

  if not found then raise exception 'ALREADY_REDEEMED'; end if;
  return v_token;
end
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_deal_token_redeem(p_token_code text, p_business_id text DEFAULT NULL::text)
 RETURNS bulk_deal_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_token public.bulk_deal_tokens%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_token from public.bulk_deal_tokens
   where token_code = upper(trim(p_token_code)) for update;
  if not found then raise exception 'TOKEN_NOT_FOUND'; end if;

  -- BLK-5: Guard against cross-store redemption for multi-location businesses
  if p_business_id is not null and v_token.business_id is not null and v_token.business_id <> p_business_id then
    raise exception 'WRONG_BUSINESS_LOCATION';
  end if;

  if not (
    v_token.issuer_user_id = v_uid
    or (v_token.business_id is not null and public.has_business_scope(v_token.business_id, v_uid, 'appointments'))
    or (v_token.business_id is not null and public.has_business_scope(v_token.business_id, v_uid, 'catalog'))
    or public.is_admin(v_uid)
  ) then
    raise exception 'NOT_AUTHORIZED_TO_REDEEM';
  end if;

  if v_token.status = 'REDEEMED' then raise exception 'ALREADY_REDEEMED'; end if;
  if v_token.status = 'EXPIRED' or (v_token.valid_until is not null and v_token.valid_until < now()) then
    raise exception 'TOKEN_EXPIRED';
  end if;

  update public.bulk_deal_tokens
     set status = 'REDEEMED', redeemed_at = now(), redeemed_by = v_uid
   where id = v_token.id and status = 'ISSUED'
  returning * into v_token;

  if not found then raise exception 'ALREADY_REDEEMED'; end if;
  return v_token;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bulk_deal_tokens_for_deal(p_deal_id text)
 RETURNS SETOF bulk_deal_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_deal public.bulk_deals%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found then raise exception 'DEAL_NOT_FOUND'; end if;
  if not (public.has_business_access(v_deal.business_id, v_uid) or public.is_admin()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query select * from public.bulk_deal_tokens where deal_id = p_deal_id order by created_at desc;
end
$function$
;

CREATE OR REPLACE FUNCTION public.bump_business_metric(p_business_id text, p_metric text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_metric = 'view' then
    update public.businesses
      set view_count = coalesce(view_count, 0) + 1
      where id = p_business_id;

    insert into public.business_view_logs(business_id)
      values (p_business_id);

  elsif p_metric = 'call' then
    update public.businesses
      set call_count = coalesce(call_count, 0) + 1
      where id = p_business_id;

  elsif p_metric = 'directions' then
    update public.businesses
      set directions_count = coalesce(directions_count, 0) + 1
      where id = p_business_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bump_provider_views(p_provider_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.providers
     SET view_count = COALESCE(view_count, 0) + 1
   WHERE id = p_provider_id;

  INSERT INTO public.provider_view_logs (provider_id, viewed_at)
  VALUES (p_provider_id, now());
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bump_queue_line_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_business_id text;
begin
  if tg_op = 'DELETE' then
    v_business_id := old.business_id;
  else
    v_business_id := new.business_id;
  end if;

  -- now() is fixed for the transaction, so a bulk change (e.g.
  -- close_stale_queue_tokens) announces each business's line once, not per row.
  update public.queue_settings
     set line_changed_at = now()
   where business_id = v_business_id
     and line_changed_at is distinct from now();

  -- A token moving between businesses isn't expected, but announce both lines.
  if tg_op = 'UPDATE' and old.business_id is distinct from new.business_id then
    update public.queue_settings
       set line_changed_at = now()
     where business_id = old.business_id
       and line_changed_at is distinct from now();
  end if;

  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.business_active_deliveries(p_business_id text)
 RETURNS TABLE(id text, appointment_id text, status text, live_status text, agent_user_id text, agent_name text, agent_avatar text, agent_phone text, customer_name text, delivery_address_line text, delivery_lat double precision, delivery_lng double precision, delivery_eta_text text, scheduled_for timestamp with time zone, date_label text, time_label text, batch_id text, stop_order integer, batch_status text, agent_lat double precision, agent_lng double precision, agent_heading double precision, handoff_verified boolean, created_at timestamp with time zone, delivered_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.has_business_scope(p_business_id, v_uid, 'appointments') then
    raise exception 'NOT_ALLOWED';
  end if;

  return query
  select d.id, d.appointment_id,
    d.status, d.live_status,
    d.agent_user_id, coalesce(au.name, 'Delivery agent'), au.avatar, au.phone,
    coalesce(a.customer_name, 'Customer'), a.delivery_address_line,
    a.delivery_lat, a.delivery_lng,
    a.delivery_eta_text,
    a.scheduled_for, a.date_label, a.time_label,
    d.batch_id, d.stop_order, batch.status,
    coalesce(batch.lat, d.lat), coalesce(batch.lng, d.lng), batch.heading,
    d.handoff_verified,
    d.created_at, d.delivered_at
  from public.appointment_deliveries d
  join public.appointments a on a.id = d.appointment_id
  left join public.users au on au.id = d.agent_user_id
  left join public.delivery_batches batch on batch.id = d.batch_id
  where d.business_id = p_business_id
  order by
    case d.status when 'EN_ROUTE' then 0 when 'ARRIVED' then 1 when 'ASSIGNED' then 2 else 3 end,
    coalesce(d.stop_order, 999),
    d.created_at desc;
end $function$
;

CREATE OR REPLACE FUNCTION public.business_login_attempt(p_login_id text, p_password text)
 RETURNS TABLE(status text, business_id text, session_id uuid, business_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_login_key text := lower(trim(coalesce(p_login_id, '')));
  v_attempt public.business_login_attempts%rowtype;
  v_credential public.business_login_credentials%rowtype;
  v_owner text;
  v_name text;
  v_cover text;
  v_grantee text;
  v_existing public.business_access_sessions%rowtype;
  v_status text;
  v_expires timestamptz;
  v_id uuid;
  v_hash text;
  v_password_matches boolean;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
  v_dummy_hash constant text := '$2a$10$CXSUxhkNpnbyeflgDI/sMei3m6s9krMAI2wx72jT.YBXr.Agkk6H2';
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  if v_login_key = '' then
    return query select 'INVALID_CREDENTIALS'::text, null::text, null::uuid,
      'Invalid login id or password'::text;
    return;
  end if;

  select * into v_attempt
  from public.business_login_attempts
  where login_id = v_login_key and attempted_by = v_uid
  for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return query select 'LOCKED'::text, null::text, null::uuid,
      ('Too many failed attempts. Try again in ' ||
       greatest(1, ceil(extract(epoch from (v_attempt.locked_until - now())) / 60)::integer) ||
       ' minute(s).')::text;
    return;
  end if;

  select * into v_credential
  from public.business_login_credentials c
  where lower(trim(c.login_id)) = v_login_key and c.is_enabled = true;

  v_hash := coalesce(nullif(v_credential.password_hash, ''), v_dummy_hash);
  v_password_matches := crypt(coalesce(p_password, ''), v_hash) = v_hash;

  if v_credential.business_id is null or p_password is null or not v_password_matches then
    insert into public.business_login_attempts
      (login_id, attempted_by, fail_count, last_attempt_at, locked_until)
    values (v_login_key, v_uid, 1, now(), null)
    on conflict (login_id, attempted_by) do update
    set fail_count = case
          when business_login_attempts.last_attempt_at <= now() - v_window
            or business_login_attempts.locked_until is not null
          then 1 else business_login_attempts.fail_count + 1 end,
        last_attempt_at = now(),
        locked_until = case
          when (case
            when business_login_attempts.last_attempt_at <= now() - v_window
              or business_login_attempts.locked_until is not null
            then 1 else business_login_attempts.fail_count + 1 end) >= v_max_attempts
          then now() + v_window else null end
    returning * into v_attempt;

    if v_attempt.locked_until is not null then
      return query select 'LOCKED'::text, null::text, null::uuid,
        'Too many failed attempts. Try again in 15 minutes.'::text;
    else
      return query select 'INVALID_CREDENTIALS'::text, null::text, null::uuid,
        'Invalid login id or password'::text;
    end if;
    return;
  end if;

  delete from public.business_login_attempts
  where login_id = v_login_key and attempted_by = v_uid;

  select b.owner_user_id, b.name, b.cover_image into v_owner, v_name, v_cover
  from public.businesses b where b.id = v_credential.business_id;
  if v_owner = v_uid then raise exception 'OWNER_ALREADY_HAS_ACCESS'; end if;

  select coalesce(nullif(trim(u.alias), ''), u.name, 'Someone') into v_grantee
  from public.users u where u.id = v_uid;

  perform pg_advisory_xact_lock(
    hashtextextended(v_credential.business_id || ':' || v_uid, 0)
  );

  update public.business_access_sessions
  set status = 'EXPIRED', decided_at = coalesce(decided_at, now())
  where business_id = v_credential.business_id and grantee_user_id = v_uid
    and status in ('PENDING', 'ACTIVE')
    and expires_at is not null and expires_at <= now();

  select * into v_existing
  from public.business_access_sessions s
  where s.business_id = v_credential.business_id
    and s.grantee_user_id = v_uid
    and s.status in ('PENDING', 'ACTIVE')
  order by s.requested_at desc, s.id desc
  limit 1 for update;

  if v_existing.id is not null then
    return query select v_existing.status, v_existing.business_id, v_existing.id, v_name;
    return;
  end if;

  if v_credential.require_approval then
    v_status := 'PENDING';
    v_expires := now() + interval '30 seconds';
  else
    v_status := 'ACTIVE';
    v_expires := now() + make_interval(
      hours => least(greatest(coalesce(v_credential.session_hours, 8), 1), 720)
    );
  end if;

  insert into public.business_access_sessions
    (business_id, grantee_user_id, status, decided_at, expires_at)
  values (
    v_credential.business_id, v_uid, v_status,
    case when v_status = 'ACTIVE' then now() else null end,
    v_expires
  ) returning id into v_id;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      v_owner, 'BUSINESS_ACCESS',
      case when v_status = 'PENDING' then 'Access request' else 'Business login' end,
      v_grantee || case when v_status = 'PENDING'
        then ' wants to manage ' || coalesce(v_name, 'your business') || '. Approve within 30 seconds.'
        else ' logged in to manage ' || coalesce(v_name, 'your business') || '.' end,
      '/account/business-access',
      jsonb_build_object('avatarUrl', v_cover, 'actorName', v_grantee,
        'statusPill', case when v_status = 'PENDING' then 'Pending' else 'Active' end,
        'tone', case when v_status = 'PENDING' then 'warning' else 'info' end)
    );
  exception when others then null;
  end;

  return query select v_status, v_credential.business_id, v_id, v_name;
end
$function$
;

CREATE OR REPLACE FUNCTION public.business_slot_capacities(p_business_id text)
 RETURNS TABLE(package_id text, slot_capacity integer, max_party_size integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select ci.id,
         greatest(1, coalesce(ci.slot_capacity,
           (select b.default_slot_capacity from public.businesses b where b.id = p_business_id), 1)),
         greatest(1, ci.max_party_size)
  from public.catalog_items ci
  where ci.business_id = p_business_id;
$function$
;

CREATE OR REPLACE FUNCTION public.businesses_nearby(in_lng double precision, in_lat double precision, in_radius_km double precision DEFAULT 50, in_category text DEFAULT NULL::text, in_limit integer DEFAULT 20, in_offset integer DEFAULT 0, in_category_ids text[] DEFAULT NULL::text[])
 RETURNS SETOF businesses
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select b.*
  from public.businesses b
  where b.status = 'ACTIVE'
    and b.owner_enabled = true
    and b.deleted_at is null
    and b.geom is not null
    and (in_category is null or b.category_id = in_category)
    and (in_category_ids is null or b.category_id = any(in_category_ids))
    and ST_DWithin(
      b.geom,
      ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography,
      in_radius_km * 1000
    )
  order by ST_Distance(b.geom, ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography) asc
  limit in_limit offset in_offset;
$function$
;

CREATE OR REPLACE FUNCTION public.can_comment_on_post(p_post_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  COMMENT_NEIGHBOR_KM constant double precision := 5;
  -- Deliberately generous for a human conversation and cheap for a script:
  -- 10 comments/minute is far past normal typing speed but well short of a flood.
  COMMENT_RATE_LIMIT  constant integer := 10;
  COMMENT_RATE_WINDOW constant interval := interval '1 minute';

  v_uid    text := auth.uid()::text;
  v_post   public.community_posts%rowtype;
  v_policy text;
  v_author text;
  v_radius double precision;
  v_lat    double precision;
  v_lng    double precision;
  v_recent integer;
begin
  if v_uid is null then return false; end if;

  select * into v_post from public.community_posts where id = p_post_id;
  if not found then return false; end if;

  v_author := v_post.author_user_id;
  -- coalesce covers a row written by an old client that only set the boolean.
  v_policy := coalesce(v_post.comment_policy, case when v_post.allow_comments then 'MUTUALS' else 'OFF' end);

  -- (a) The author may always comment on their own post, under every policy,
  --     and is exempt from the rate limit's window being consumed by others.
  if v_author is not null and v_author = v_uid then
    return true;
  end if;

  -- (b) Blocking wins over any policy, in both directions. Calls the internal
  --     pair-checker directly (v_uid/v_author are already known) rather than
  --     the client-facing is_blocked_between(text), which hardcodes one side
  --     to auth.uid() — that's still v_uid here, but going through the
  --     private helper avoids re-deriving it.
  if v_author is not null and public._user_blocks_exists(v_uid, v_author) then
    return false;
  end if;

  -- (c) Rate limit. Applied before the policy branches so it holds no matter
  --     which policy let the caller in. The advisory lock serializes
  --     concurrent calls from the SAME author for the rest of this
  --     transaction, closing the check-then-act race where two parallel
  --     comment inserts both read the count below before either commits and
  --     both slip in under the limit.
  perform pg_advisory_xact_lock(hashtextextended('comment_rate:' || v_uid, 0));
  select count(*) into v_recent
    from public.post_comments
   where author_user_id = v_uid
     and created_at > now() - COMMENT_RATE_WINDOW;
  if v_recent >= COMMENT_RATE_LIMIT then
    return false;
  end if;

  -- (d) The policy itself.
  if v_policy = 'OFF' then
    return false;
  end if;

  if v_policy = 'EVERYONE' then
    return true;
  end if;

  if v_policy = 'NEIGHBORS' and v_post.geom is not null then
    select lat, lng into v_lat, v_lng from public.users where id = v_uid;
    if v_lat is null or v_lng is null then
      -- No location on file: fall through to the MUTUALS test below rather than
      -- treating an unknown distance as "nearby".
      null;
    else
      v_radius := COMMENT_NEIGHBOR_KM;
      if v_post.author_type = 'business' then
        select least(v_radius, greatest(coalesce(nullif(b.broadcast_radius, 0), 5), 0))
          into v_radius
          from public.businesses b where b.id = v_post.author_ref_id;
      elsif v_post.author_type = 'provider' then
        select least(v_radius, greatest(coalesce(nullif(p.service_radius_km, 0), 5), 0))
          into v_radius
          from public.providers p where p.id = v_post.author_ref_id;
      end if;

      if ST_DWithin(
           v_post.geom,
           ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::geography,
           coalesce(v_radius, COMMENT_NEIGHBOR_KM) * 1000
         ) then
        return true;
      end if;
      return false;
    end if;
  end if;

  -- (e) MUTUALS — and the fallback for a NEIGHBORS post that can't be measured.
  --     Unchanged from 20260832: both directions must exist in `follows`.
  if v_author is null then return false; end if;
  return exists (
      select 1 from public.follows f
      where f.follower_user_id = v_uid
        and f.target_id = v_author
        and f.target_type in ('USER', 'user')
    ) and exists (
      select 1 from public.follows f
      where f.follower_user_id = v_author
        and f.target_id = v_uid
        and f.target_type in ('USER', 'user')
    );
end
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_business(p_business_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    exists (
      select 1 from public.businesses b
      where b.id = p_business_id and b.owner_user_id = auth.uid()::text
    )
    or exists (
      select 1 from public.business_access_sessions s
      where s.business_id = p_business_id
        and s.grantee_user_id = auth.uid()::text
        and s.status = 'ACTIVE'
        and (s.expires_at is null or s.expires_at > now())
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_react_to_comment(p_comment_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (
      select public.can_comment_on_post(c.post_id)
      from public.post_comments c
      where c.id = p_comment_id
    ),
    false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_delivery(p_delivery_id text, p_reason text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid        text := auth.uid()::text;
  v_row        public.appointment_deliveries%rowtype;
  v_is_agent   boolean;
  v_is_manager boolean;
  v_actor      text;
  v_note       text := nullif(btrim(coalesce(p_note, '')), '');
  v_remaining  int;
  v_biz_name   text;
  v_owner_uid  text;
  v_customer   text;
  v_agent_uid  text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  if p_reason is null or p_reason not in (
    'CUSTOMER_UNAVAILABLE','ADDRESS_PROBLEM','CUSTOMER_REFUSED',
    'UNSAFE','AGENT_EMERGENCY','OTHER'
  ) then
    raise exception 'INVALID_REASON';
  end if;

  if p_reason = 'OTHER' and v_note is null then
    raise exception 'Add a short note so the business knows what happened.';
  end if;

  select * into v_row from public.appointment_deliveries
   where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;

  if v_row.status in ('DELIVERED','CANCELLED') then
    raise exception 'This delivery is already closed.';
  end if;

  v_is_agent   := v_uid is not distinct from v_row.agent_user_id;
  v_is_manager := public.has_business_scope(v_row.business_id, v_uid, 'appointments');
  if not (v_is_agent or v_is_manager) then raise exception 'NOT_ALLOWED'; end if;
  v_actor := case when v_is_agent then 'AGENT' else 'BUSINESS' end;

  v_agent_uid := v_row.agent_user_id;

  update public.appointment_deliveries
     set status        = 'CANCELLED',
         live_status   = null,
         cancelled_at  = now(),
         cancelled_by  = v_actor,
         cancel_reason = p_reason,
         cancel_note   = v_note
   where id = p_delivery_id;

  if v_row.batch_id is not null then
    select count(*) into v_remaining
      from public.appointment_deliveries
     where batch_id = v_row.batch_id
       and status in ('ASSIGNED','EN_ROUTE','ARRIVED');
    if v_remaining = 0 then
      update public.delivery_batches
         set status = 'COMPLETED', completed_at = now()
       where id = v_row.batch_id
         and status in ('PENDING_ACCEPTANCE','ACCEPTED','IN_PROGRESS');
    end if;
  end if;

  select b.name, b.owner_user_id into v_biz_name, v_owner_uid
    from public.businesses b where b.id = v_row.business_id;
  select a.customer_user_id into v_customer
    from public.appointments a where a.id = v_row.appointment_id;

  begin
    if v_actor = 'AGENT' then
      if v_owner_uid is not null then
        insert into public.notifications (user_id, type, title, body, deep_link)
        values (v_owner_uid, 'QUEUE_UPDATE', 'Delivery couldn''t be completed',
                'A delivery was marked undeliverable and needs reassigning.',
                '/business/' || v_row.business_id || '/manage/deliveries');
      end if;
    else
      if v_agent_uid is not null then
        insert into public.notifications (user_id, type, title, body, deep_link)
        values (v_agent_uid, 'QUEUE_UPDATE', 'Delivery cancelled',
                coalesce(v_biz_name, 'The business') || ' cancelled a delivery on your run.',
                '/delivery');
      end if;
    end if;

    if v_customer is not null then
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_customer, 'QUEUE_UPDATE', 'Delivery delayed',
              coalesce(v_biz_name, 'The business') || ' is arranging a new delivery for your order.',
              '/appointments');
    end if;
  exception when others then null;
  end;
end $function$
;

CREATE OR REPLACE FUNCTION public.cancel_expired_agreements()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ag record;
begin
  -- 12-hour confirmation window for PENDING agreements
  for v_ag in
    select * from public.agreements
    where status = 'PENDING'
      and created_at < now() - interval '12 hours'
  loop
    update public.agreements set status = 'CANCELLED' where id = v_ag.id;
    update public.requests set status = 'OPEN' where id = v_ag.request_id;
    -- Only revert proposals that were accepted or rejected, protecting WITHDRAWN proposals (A11)
    update public.proposals set status = 'SUBMITTED'
    where request_id = v_ag.request_id and status in ('ACCEPTED', 'REJECTED');
  end loop;

  -- 24h payment reminder
  insert into public.notifications (user_id, type, title, body, deep_link)
  select a.requester_user_id, 'AGREEMENT', 'Payment reminder',
         'You still need to pay for "' || coalesce(a.request_title, 'your agreement')
           || '" — this deal auto-cancels after 3 days unpaid.',
         '/agreement/' || a.id
    from public.agreements a
   where a.status = 'ACTIVE'
     and coalesce(a.payment_status, 'UNPAID') in ('UNPAID', 'REJECTED')
     and a.created_at < now() - interval '24 hours'
     and not exists (
       select 1 from public.notifications n
        where n.deep_link = '/agreement/' || a.id and n.title = 'Payment reminder'
     );

  -- 72h unpaid auto-cancel
  for v_ag in
    select * from public.agreements
    where status = 'ACTIVE'
      and coalesce(payment_status, 'UNPAID') in ('UNPAID', 'REJECTED')
      and created_at < now() - interval '72 hours'
  loop
    update public.agreements set status = 'CANCELLED' where id = v_ag.id;
    update public.requests set status = 'OPEN' where id = v_ag.request_id;
    update public.proposals set status = 'SUBMITTED'
    where request_id = v_ag.request_id and status in ('ACCEPTED', 'REJECTED');

    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values
        (v_ag.requester_user_id, 'AGREEMENT', 'Agreement auto-cancelled',
         'Payment was never made for "' || coalesce(v_ag.request_title, 'your agreement') || '" — it has been cancelled.',
         '/agreement/' || v_ag.id),
        (v_ag.responder_user_id, 'AGREEMENT', 'Agreement auto-cancelled',
         'The unpaid agreement for "' || coalesce(v_ag.request_title, 'your agreement') || '" has been cancelled.',
         '/agreement/' || v_ag.id);
    exception when others then null;
    end;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_bulk_deal_target_and_close(p_deal_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_deal public.bulk_deals%rowtype;
  v_paid_qty integer;
begin
  select * into v_deal from public.bulk_deals where id = p_deal_id;
  if not found or v_deal.closed_at is not null then return; end if;

  select coalesce(sum(quantity), 0) into v_paid_qty
    from public.bulk_deal_pledges
   where deal_id = p_deal_id and deposit_status = 'PAID';

  if v_paid_qty >= v_deal.moq then
    perform public._bulk_deal_close_internal(p_deal_id, 'TARGET_HIT', 'FULFILLED');
  end if;
end
$function$
;

CREATE OR REPLACE FUNCTION public.check_self_vouch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if exists (
    select 1 from public.providers
    where id = new.provider_id and user_id = new.from_user_id
  ) then
    raise exception 'CANNOT_VOUCH_FOR_SELF';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_first_admin(p_login_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then
    raise exception 'Sign in to your STRYT account first.';
  end if;

  perform pg_advisory_xact_lock(hashtext('claim_first_admin'));

  if exists (select 1 from public.users where roles @> array['admin']) then
    raise exception 'An admin account already exists. Ask an existing admin to grant access from the console.';
  end if;
  if exists (select 1 from public.users where admin_login_id = p_login_id) then
    raise exception 'That admin ID is already taken.';
  end if;

  perform set_config('app.role_change_ok', 'true', true);

  update public.users u
     set roles = array_append(u.roles, 'admin'), admin_login_id = p_login_id
   where u.id = v_uid
     and not exists (select 1 from public.users a where a.roles @> array['admin']);

  if not found then
    raise exception 'Could not claim the admin account. Try again.';
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.clear_entity_password(p_kind text, p_current_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_existing text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('business', 'provider') then raise exception 'Invalid kind'; end if;

  select case p_kind when 'business' then business_password_hash else provider_password_hash end
    into v_existing
    from public.users
   where id = v_uid;

  if v_existing is null then return; end if;

  if not public._verify_entity_password(p_kind, v_uid, coalesce(p_current_password, '')) then
    raise exception 'Current password is incorrect';
  end if;

  if p_kind = 'business' then
    update public.users
       set business_password_hash = null,
           business_recovery_question_id = null,
           business_recovery_question_text = null,
           business_recovery_answer_hash = null
     where id = v_uid;
  else
    update public.users
       set provider_password_hash = null,
           provider_recovery_question_id = null,
           provider_recovery_question_text = null,
           provider_recovery_answer_hash = null
     where id = v_uid;
  end if;

  delete from public.entity_password_attempts where owner_user_id = v_uid and kind = p_kind;
  delete from public.entity_recovery_attempts where owner_user_id = v_uid and kind = p_kind;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_switch_pin(p_current_pin text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_existing_hash text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select switch_pin_hash into v_existing_hash from public.users where id = v_uid;
  if v_existing_hash is null then return; end if;
  if not public.verify_switch_pin(coalesce(p_current_pin, '')) then
    raise exception 'Current PIN is incorrect';
  end if;
  update public.users set switch_pin_hash = null where id = v_uid;
  delete from public.switch_pin_attempts where user_id = v_uid;
end
$function$
;

CREATE OR REPLACE FUNCTION public.close_expired_bulk_deals()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d record;
begin
  for d in
    select id from public.bulk_deals
     where closed_at is null and closes_at is not null and closes_at < now()
  loop
    perform public._bulk_deal_close_internal(d.id, 'DEADLINE', null);
  end loop;
end
$function$
;

CREATE OR REPLACE FUNCTION public.close_expired_business_sessions()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.business_access_sessions
  set status = 'EXPIRED', decided_at = coalesce(decided_at, now())
  where status in ('PENDING', 'ACTIVE')
    and expires_at is not null
    and expires_at <= now();
$function$
;

CREATE OR REPLACE FUNCTION public.close_expired_requests()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.requests
  set status = 'EXPIRED'
  where status = 'OPEN'
    and expires_at is not null
    and expires_at < now();
$function$
;

CREATE OR REPLACE FUNCTION public.close_stale_queue_tokens()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  max_age     interval := interval '4 hours';
  inactivity  interval := interval '90 minutes';
  tz          text := 'Asia/Kolkata';
  today_start timestamptz := (date_trunc('day', now() at time zone tz) at time zone tz);
begin
  update public.queue_settings s
     set is_open = false, updated_at = now()
   where s.is_open = true
     and coalesce(s.last_activity_at, s.updated_at) < now() - inactivity
     and exists (
       select 1 from public.queue_tokens t
        where t.business_id = s.business_id
          and t.status in ('WAITING', 'CALLED')
     );

  with expired as (
    update public.queue_tokens t
       set status = 'EXPIRED',
           closed_reason = case
             when t.created_at < today_start        then 'DAY_ROLLOVER'
             when t.created_at < now() - max_age     then 'STALE'
             else 'SHOP_CLOSED' end
      from public.queue_settings s
     where t.business_id = s.business_id
       and t.status in ('WAITING', 'CALLED')
       and coalesce(t.payment_status, 'UNPAID') not in ('PENDING_CONFIRM', 'PAID')
       and (
            t.created_at < today_start
         or t.created_at < now() - max_age
         or (s.is_open = false and not (t.status = 'CALLED' and t.arrived_at is not null))
       )
    returning t.id, t.customer_user_id, t.business_id, t.closed_reason
  )
  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  select e.customer_user_id,
         'QUEUE_UPDATE',
         'Queue closed',
         coalesce(b.name, 'The shop') || ' closed its queue — you''ve been removed from the line.',
         '/queues',
         jsonb_build_object('avatarUrl', b.cover_image, 'actorName', b.name, 'statusPill', 'Closed', 'tone', 'neutral')
    from expired e
    left join public.businesses b on b.id = e.business_id
   where e.customer_user_id is not null;
exception
  when others then
    update public.queue_tokens t
       set status = 'EXPIRED',
           closed_reason = case
             when t.created_at < today_start    then 'DAY_ROLLOVER'
             when t.created_at < now() - max_age then 'STALE'
             else 'SHOP_CLOSED' end
      from public.queue_settings s
     where t.business_id = s.business_id
       and t.status in ('WAITING', 'CALLED')
       and coalesce(t.payment_status, 'UNPAID') not in ('PENDING_CONFIRM', 'PAID')
       and (
            t.created_at < today_start
         or t.created_at < now() - max_age
         or (s.is_open = false and not (t.status = 'CALLED' and t.arrived_at is not null))
       );
end
$function$
;

CREATE OR REPLACE FUNCTION public.comment_gate_reason(p_post_id text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid    text := auth.uid()::text;
  v_post   public.community_posts%rowtype;
  v_policy text;
begin
  if v_uid is null then return 'SIGN_IN'; end if;
  select * into v_post from public.community_posts where id = p_post_id;
  if not found then return 'NOT_FOUND'; end if;

  if v_post.author_user_id = v_uid then return 'OK'; end if;
  if public.can_comment_on_post(p_post_id) then return 'OK'; end if;

  v_policy := coalesce(v_post.comment_policy, case when v_post.allow_comments then 'MUTUALS' else 'OFF' end);
  if v_policy = 'OFF' then return 'OFF'; end if;
  if public._user_blocks_exists(v_uid, v_post.author_user_id) then return 'BLOCKED'; end if;
  if v_policy = 'NEIGHBORS' then return 'TOO_FAR'; end if;
  if v_policy = 'MUTUALS' then return 'NOT_MUTUAL'; end if;
  return 'RATE_LIMITED';
end
$function$
;

CREATE OR REPLACE FUNCTION public.community_comment_delete(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_comment public.post_comments%rowtype;
  v_post_author text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_comment from public.post_comments where id = p_id;
  if not found then raise exception 'COMMENT_NOT_FOUND'; end if;

  select author_user_id into v_post_author from public.community_posts where id = v_comment.post_id;

  if v_comment.author_user_id is distinct from v_uid
     and v_post_author is distinct from v_uid then
    raise exception 'NOT_ALLOWED';
  end if;

  -- Replies would otherwise dangle under a parent that no longer exists.
  delete from public.comment_reactions where comment_id = p_id;
  delete from public.post_comments where parent_id = p_id;
  delete from public.post_comments where id = p_id;
  -- comments_count is corrected by trg_sync_post_comments_count (20260922).
end
$function$
;

CREATE OR REPLACE FUNCTION public.community_comment_set_pinned(p_id text, p_pinned boolean)
 RETURNS post_comments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_comment public.post_comments%rowtype;
  v_post_author text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_comment from public.post_comments where id = p_id;
  if not found then raise exception 'COMMENT_NOT_FOUND'; end if;

  select author_user_id into v_post_author from public.community_posts where id = v_comment.post_id;
  if v_post_author is distinct from v_uid then raise exception 'NOT_POST_AUTHOR'; end if;

  if coalesce(p_pinned, false) then
    update public.post_comments set pinned_at = null
     where post_id = v_comment.post_id and pinned_at is not null;
    update public.post_comments set pinned_at = now() where id = p_id returning * into v_comment;
  else
    update public.post_comments set pinned_at = null where id = p_id returning * into v_comment;
  end if;

  return v_comment;
end
$function$
;

CREATE OR REPLACE FUNCTION public.community_comment_update(p_id text, p_body text)
 RETURNS post_comments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_comment public.post_comments%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if length(trim(coalesce(p_body, ''))) < 1 then raise exception 'EMPTY_BODY'; end if;

  select * into v_comment from public.post_comments where id = p_id for update;
  if not found then raise exception 'COMMENT_NOT_FOUND'; end if;
  if v_comment.author_user_id is distinct from v_uid then raise exception 'NOT_YOUR_COMMENT'; end if;

  update public.post_comments
     set body = left(trim(p_body), 2000), edited_at = now()
   where id = p_id
  returning * into v_comment;

  return v_comment;
end
$function$
;

CREATE OR REPLACE FUNCTION public.community_poll_close(p_id text)
 RETURNS community_posts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_post public.community_posts%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_post from public.community_posts where id = p_id for update;
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  if v_post.author_user_id is distinct from v_uid then raise exception 'NOT_YOUR_POST'; end if;
  if v_post.type is distinct from 'POLL' then raise exception 'NOT_A_POLL'; end if;

  update public.community_posts
     set poll_ends_at = least(coalesce(poll_ends_at, now()), now())
   where id = p_id
  returning * into v_post;

  return v_post;
end
$function$
;

CREATE OR REPLACE FUNCTION public.community_post_add_recommendation(p_post_id text, p_listing_type text, p_listing_id text, p_by_name text)
 RETURNS community_posts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid  text := auth.uid()::text;
  v_post public.community_posts%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_listing_type not in ('BUSINESS', 'PROVIDER') then raise exception 'INVALID_LISTING_TYPE'; end if;
  if nullif(trim(coalesce(p_listing_id, '')), '') is null then raise exception 'INVALID_LISTING'; end if;

  -- Row lock: serialises concurrent recommenders, so the append below always
  -- reads the array as it stands after any other in-flight append.
  select * into v_post from public.community_posts where id = p_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND'; end if;

  update public.community_posts
     set recommendations = coalesce(recommendations, '[]'::jsonb) || jsonb_build_array(
           jsonb_build_object(
             'listingType', p_listing_type,
             'listingId',   p_listing_id,
             'byName',      coalesce(nullif(trim(coalesce(p_by_name, '')), ''), 'Someone'),
             'byUserId',    v_uid
           ))
   where id = p_post_id
  returning * into v_post;

  return v_post;
end
$function$
;

CREATE OR REPLACE FUNCTION public.community_post_delete(p_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_author text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select author_user_id into v_author from public.community_posts where id = p_id for update;
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  if v_author is distinct from v_uid then raise exception 'NOT_YOUR_POST'; end if;

  delete from public.post_comments where post_id = p_id;
  delete from public.post_likes where post_id = p_id;
  delete from public.poll_votes where post_id = p_id;
  delete from public.community_posts where id = p_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.community_post_hot_score(in_likes integer, in_comments integer, in_created_at timestamp with time zone)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  select (coalesce(in_likes, 0) + coalesce(in_comments, 0) * 2)::double precision
       / power(
           greatest(extract(epoch from (now() - coalesce(in_created_at, now()))) / 3600.0, 0) + 2,
           1.5
         );
$function$
;

CREATE OR REPLACE FUNCTION public.community_post_set_profile_visibility(p_id text, p_show boolean)
 RETURNS community_posts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_post public.community_posts%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_post from public.community_posts where id = p_id for update;
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  if v_post.author_user_id is distinct from v_uid then raise exception 'NOT_YOUR_POST'; end if;

  update public.community_posts
     set show_on_profile = coalesce(p_show, true)
   where id = p_id
  returning * into v_post;

  return v_post;
end
$function$
;

CREATE OR REPLACE FUNCTION public.community_post_set_resolved(p_id text, p_resolved boolean)
 RETURNS community_posts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_post public.community_posts%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_post from public.community_posts where id = p_id for update;
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  if v_post.author_user_id is distinct from v_uid then raise exception 'NOT_YOUR_POST'; end if;

  update public.community_posts set resolved = p_resolved where id = p_id returning * into v_post;
  return v_post;
end
$function$
;

CREATE OR REPLACE FUNCTION public.community_post_update(p_id text, p_title text, p_body text DEFAULT NULL::text, p_image text DEFAULT NULL::text, p_media text[] DEFAULT NULL::text[], p_image_alt text DEFAULT NULL::text, p_last_seen text DEFAULT NULL::text, p_reward text DEFAULT NULL::text, p_pickup_note text DEFAULT NULL::text, p_tagged_listing jsonb DEFAULT NULL::jsonb, p_clear_tagged_listing boolean DEFAULT false, p_comment_policy text DEFAULT NULL::text, p_hide_like_count boolean DEFAULT NULL::boolean)
 RETURNS community_posts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_post public.community_posts%rowtype;
  v_media text[];
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_post from public.community_posts where id = p_id for update;
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  if v_post.author_user_id is distinct from v_uid then raise exception 'NOT_YOUR_POST'; end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then raise exception 'TITLE_REQUIRED'; end if;

  if p_comment_policy is not null
     and p_comment_policy not in ('EVERYONE', 'NEIGHBORS', 'MUTUALS', 'OFF') then
    raise exception 'INVALID_COMMENT_POLICY';
  end if;

  -- p_media null = "caller didn't say", so fall back to the single p_image it
  -- did send (that's the pre-media client, still shipping in an older app
  -- build / OTA bundle). An explicitly empty array means "remove the photos".
  v_media := coalesce(
    p_media,
    case when nullif(p_image, '') is null then '{}'::text[] else array[p_image] end
  );
  if coalesce(array_length(v_media, 1), 0) > 4 then
    raise exception 'TOO_MANY_PHOTOS';
  end if;

  update public.community_posts
     set title     = left(trim(p_title), 150),
         body      = nullif(left(trim(coalesce(p_body, '')), 2000), ''),
         media     = v_media,
         -- image stays the first photo so older read paths keep working.
         image     = v_media[1],
         image_alt = nullif(trim(coalesce(p_image_alt, '')), ''),

         last_seen = case when p_last_seen is null then last_seen
                          else nullif(left(trim(p_last_seen), 120), '') end,
         reward    = case when p_reward is null then reward
                          else nullif(left(trim(p_reward), 80), '') end,
         pickup_note = case when p_pickup_note is null then pickup_note
                            else nullif(left(trim(p_pickup_note), 140), '') end,
         -- The flag is the explicit "untag it"; a NULL payload without it just
         -- means the caller never mentioned the field.
         tagged_listing = case
                            when coalesce(p_clear_tagged_listing, false) then null
                            when p_tagged_listing is null then tagged_listing
                            when jsonb_typeof(p_tagged_listing) = 'null' then null
                            else p_tagged_listing
                          end,
         comment_policy = coalesce(p_comment_policy, comment_policy),
         -- allow_comments is the legacy mirror resolveCommentPolicy() falls
         -- back to. Kept consistent here so a post edited to OFF doesn't read
         -- as "on" to any path still looking at the boolean.
         allow_comments = case
                            when p_comment_policy is null then allow_comments
                            when p_comment_policy = 'OFF' then false
                            else true
                          end,
         hide_like_count = coalesce(p_hide_like_count, hide_like_count)
   where id = p_id
   returning * into v_post;

  return v_post;
end
$function$
;

CREATE OR REPLACE FUNCTION public.community_posts_feed(in_lng double precision DEFAULT NULL::double precision, in_lat double precision DEFAULT NULL::double precision, in_radius_km double precision DEFAULT 5, in_limit integer DEFAULT 20, in_offset integer DEFAULT 0, in_type text DEFAULT NULL::text, in_sort text DEFAULT 'recent'::text, in_query text DEFAULT NULL::text)
 RETURNS SETOF community_posts
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with viewer as (
    select
      case
        when in_lat is null or in_lng is null then null
        else ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography
      end as pt,
      public.community_search_tsquery(in_query) as q
  )
  select cp.*
  from public.community_posts cp
  cross join viewer v
  left join public.businesses b
    on cp.author_type = 'business' and b.id = cp.author_ref_id
  left join public.providers p
    on cp.author_type = 'provider' and p.id = cp.author_ref_id
  where
    -- Time-boxed posts drop out once they're done (20260891).
    (cp.expires_at is null or cp.expires_at > now())
    and (in_type is null or cp.type = in_type)
    -- A query of only punctuation scrubs down to nothing; v.q is then null and
    -- the search is treated as absent rather than as "match nothing".
    and (
      v.q is null
      or to_tsvector(
           'simple',
           coalesce(cp.title, '') || ' ' || coalesce(cp.body, '') || ' ' || coalesce(cp.author_name, '')
         ) @@ v.q
    )
    and (
      -- No viewer location: fall back to the global feed, the same behaviour
      -- communityService.feed() had on its no-coords branch.
      v.pt is null
      or (
        cp.geom is not null
        and ST_DWithin(
          cp.geom,
          v.pt,
          -- Author-radius capping, carried over verbatim from 20260866: a shop
          -- with a 2 km reach must not appear to someone 5 km away just because
          -- the viewer's own radius is wider.
          least(
            in_radius_km,
            case
              when cp.author_type = 'business' then greatest(coalesce(nullif(b.broadcast_radius, 0), 5), 0)
              when cp.author_type = 'provider'  then greatest(coalesce(nullif(p.service_radius_km, 0), 5), 0)
              else in_radius_km
            end
          ) * 1000
        )
      )
    )
  order by
    case when in_sort = 'trending' then
      public.community_post_hot_score(cp.likes_count, cp.comments_count, cp.created_at)
    end desc nulls last,
    case when in_sort = 'nearest' and v.pt is not null and cp.geom is not null then
      ST_Distance(cp.geom, v.pt)
    end asc nulls last,
    -- Always the final tiebreak, and the whole ordering for 'recent'. Without
    -- it, two posts with an identical hot score could swap places between
    -- pages and the same post would appear twice (or never).
    cp.created_at desc,
    cp.id desc
  limit greatest(coalesce(in_limit, 20), 1)
  offset greatest(coalesce(in_offset, 0), 0);
$function$
;

CREATE OR REPLACE FUNCTION public.community_posts_nearby(in_lng double precision, in_lat double precision, in_radius_km double precision DEFAULT 10, in_limit integer DEFAULT 50, in_offset integer DEFAULT 0)
 RETURNS SETOF community_posts
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select cp.*
  from public.community_posts cp
  left join public.businesses b
    on cp.author_type = 'business' and b.id = cp.author_ref_id
  left join public.providers p
    on cp.author_type = 'provider' and p.id = cp.author_ref_id
  where cp.geom is not null
    and (cp.expires_at is null or cp.expires_at > now())
    and ST_DWithin(
      cp.geom,
      ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography,
      least(
        in_radius_km,
        case
          when cp.author_type = 'business' then greatest(coalesce(nullif(b.broadcast_radius, 0), 5), 0)
          when cp.author_type = 'provider'  then greatest(coalesce(nullif(p.service_radius_km, 0), 5), 0)
          else in_radius_km
        end
      ) * 1000
    )
  order by cp.created_at desc
  limit in_limit offset in_offset;
$function$
;

CREATE OR REPLACE FUNCTION public.community_search_tsquery(p_q text)
 RETURNS tsquery
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select (
    select string_agg(tok || ':*', ' & ')::tsquery
    from unnest(
      string_to_array(
        regexp_replace(lower(trim(coalesce(p_q, ''))), '[^[:alnum:][:space:]]', ' ', 'g'),
        ' '
      )
    ) as tok
    where tok <> ''
  );
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_handoff(p_delivery_id text, p_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_row public.appointment_deliveries%rowtype;
  v_attempt public.handoff_attempts%rowtype;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
  v_matches boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.appointment_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_uid is distinct from v_row.agent_user_id then raise exception 'NOT_AGENT'; end if;

  select * into v_attempt from public.handoff_attempts where delivery_id = p_delivery_id for update;
  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    raise exception 'Too many wrong attempts — wait a few minutes and ask the customer to confirm again.';
  end if;

  v_matches := v_row.handoff_code is not distinct from p_code;

  if v_matches then
    delete from public.handoff_attempts where delivery_id = p_delivery_id;
    update public.appointment_deliveries
       set handoff_verified = true, status = case when status = 'EN_ROUTE' then 'ARRIVED' else status end
     where id = p_delivery_id;
    return true;
  end if;

  insert into public.handoff_attempts (delivery_id, fail_count, last_attempt_at, locked_until)
  values (p_delivery_id, 1, now(), null)
  on conflict (delivery_id) do update
  set fail_count = case
        when handoff_attempts.last_attempt_at <= now() - v_window
          or handoff_attempts.locked_until is not null
        then 1 else handoff_attempts.fail_count + 1 end,
      last_attempt_at = now(),
      locked_until = case
        when (case
          when handoff_attempts.last_attempt_at <= now() - v_window
            or handoff_attempts.locked_until is not null
          then 1 else handoff_attempts.fail_count + 1 end) >= v_max_attempts
        then now() + v_window else null end;

  return false;
end
$function$
;

CREATE OR REPLACE FUNCTION public.count_my_active_deliveries(p_business_id text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::int
  FROM public.appointment_deliveries d
  WHERE d.agent_user_id = auth.uid()::text
    AND d.status IN ('ASSIGNED', 'EN_ROUTE', 'ARRIVED')
    AND (p_business_id IS NULL OR d.business_id = p_business_id);
$function$
;

CREATE OR REPLACE FUNCTION public.create_settlements_on_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  req_title text;
  req_price int;
begin
  if new.status = 'COMPLETED' and (old.status is null or old.status <> 'COMPLETED') then
    req_title := coalesce(new.request_title, 'Agreement');
    req_price := coalesce(new.agreed_price, 0);
    insert into public.settlements (agreement_id, user_id, with_user_id, amount, mode, note)
    values (new.id, new.requester_user_id, new.responder_user_id, req_price, 'CASH', req_title)
    on conflict do nothing;
    if new.responder_user_id <> new.requester_user_id then
      insert into public.settlements (agreement_id, user_id, with_user_id, amount, mode, note)
      values (new.id, new.responder_user_id, new.requester_user_id, req_price, 'CASH', req_title)
      on conflict do nothing;
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.custom_payment_confirm(p_id text)
 RETURNS custom_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_row public.custom_payments%rowtype;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.custom_payments where id = p_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  v_allowed := v_row.target_owner_user_id = v_uid
    or (v_row.target_type = 'BUSINESS' and public.has_business_scope(v_row.target_id, v_uid, 'appointments'));
  if not v_allowed then raise exception 'NOT_TARGET_MANAGER'; end if;
  if v_row.status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.custom_payments set status = 'PAID', confirmed_at = now()
  where id = p_id and status = 'PENDING_CONFIRM'
  returning * into v_row;
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    v_row.payer_user_id, 'CUSTOM_PAYMENT_CONFIRMED', 'Payment confirmed',
    coalesce(v_row.target_name, 'The business') || ' confirmed your payment of ' || v_row.amount::text,
    case when v_row.target_type = 'BUSINESS' then '/business/' || v_row.target_id
         else '/provider/' || v_row.target_id end
  );

  return v_row;
end
$function$
;

CREATE OR REPLACE FUNCTION public.custom_payment_create(p_target_type text, p_target_id text, p_amount numeric, p_method text, p_note text DEFAULT NULL::text, p_reference text DEFAULT NULL::text)
 RETURNS custom_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_owner text;
  v_target_name text;
  v_payer_name text;
  v_payer_avatar text;
  v_row public.custom_payments%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_target_type not in ('BUSINESS','PROVIDER') then raise exception 'INVALID_TARGET_TYPE'; end if;
  if p_method not in ('UPI','CASH') then raise exception 'INVALID_METHOD'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  if p_target_type = 'BUSINESS' then
    select b.owner_user_id, b.name into v_owner, v_target_name
    from public.businesses b where b.id = p_target_id and b.status = 'ACTIVE';
  else
    select p.user_id, p.display_name into v_owner, v_target_name
    from public.providers p where p.id = p_target_id and p.status = 'ACTIVE';
  end if;
  if v_owner is null then raise exception 'TARGET_NOT_FOUND'; end if;
  if v_owner = v_uid then raise exception 'OWNER_CANNOT_SELF_PAY'; end if;

  select coalesce(nullif(trim(u.name), ''), 'Customer'), u.avatar
  into v_payer_name, v_payer_avatar
  from public.users u where u.id = v_uid;

  insert into public.custom_payments (
    target_type, target_id, target_owner_user_id, target_name,
    payer_user_id, payer_name, payer_avatar,
    amount, method, status, reference, note
  ) values (
    p_target_type, p_target_id, v_owner, v_target_name,
    v_uid, v_payer_name, v_payer_avatar,
    p_amount, p_method, 'PENDING_CONFIRM',
    nullif(left(trim(coalesce(p_reference, '')), 200), ''),
    nullif(left(trim(coalesce(p_note, '')), 300), '')
  ) returning * into v_row;

  -- Unlike an appointment/queue claim, the owner has no pre-existing record
  -- to already be watching, so a claim could go unnoticed without a push.
  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    v_owner, 'CUSTOM_PAYMENT_RECEIVED', 'New payment received',
    coalesce(v_payer_name, 'A customer') || ' sent ' || p_amount::text || ' via ' || p_method,
    case when p_target_type = 'BUSINESS' then '/business/' || p_target_id || '/manage/payments'
         else '/provider/' || p_target_id || '/manage/money' end
  );

  return v_row;
end
$function$
;

CREATE OR REPLACE FUNCTION public.custom_payment_reject(p_id text)
 RETURNS custom_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_row public.custom_payments%rowtype;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.custom_payments where id = p_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  v_allowed := v_row.target_owner_user_id = v_uid
    or (v_row.target_type = 'BUSINESS' and public.has_business_scope(v_row.target_id, v_uid, 'appointments'));
  if not v_allowed then raise exception 'NOT_TARGET_MANAGER'; end if;
  if v_row.status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.custom_payments set status = 'REJECTED'
  where id = p_id and status = 'PENDING_CONFIRM'
  returning * into v_row;
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    v_row.payer_user_id, 'CUSTOM_PAYMENT_REJECTED', 'Payment claim rejected',
    coalesce(v_row.target_name, 'The business') || ' couldn''t confirm your payment of ' || v_row.amount::text || ' — check the amount and try again',
    case when v_row.target_type = 'BUSINESS' then '/business/' || v_row.target_id
         else '/provider/' || v_row.target_id end
  );

  return v_row;
end
$function$
;

CREATE OR REPLACE FUNCTION public.decide_business_session(p_session_id uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_session public.business_access_sessions%rowtype;
  v_hours integer;
  v_business_name text;
  v_business_cover text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select s.* into v_session
  from public.business_access_sessions s
  join public.businesses b on b.id = s.business_id
  where s.id = p_session_id and b.owner_user_id = v_uid
  for update of s;

  if not found then raise exception 'NOT_ALLOWED'; end if;
  if v_session.status <> 'PENDING' then raise exception 'ALREADY_DECIDED'; end if;

  if v_session.expires_at is not null and v_session.expires_at <= now() then
    update public.business_access_sessions
    set status = 'EXPIRED', decided_at = coalesce(decided_at, now())
    where id = p_session_id and status = 'PENDING';
    return;
  end if;

  select least(greatest(coalesce(c.session_hours, 8), 1), 720), b.name, b.cover_image
  into v_hours, v_business_name, v_business_cover
  from public.businesses b
  left join public.business_login_credentials c on c.business_id = b.id
  where b.id = v_session.business_id;

  update public.business_access_sessions
  set status = case when p_approve then 'ACTIVE' else 'DENIED' end,
      decided_at = now(),
      expires_at = case when p_approve
        then now() + make_interval(hours => v_hours)
        else null end
  where id = p_session_id and status = 'PENDING';

  if not found then raise exception 'ALREADY_DECIDED'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      v_session.grantee_user_id, 'BUSINESS_ACCESS',
      case when p_approve then 'Access approved' else 'Access denied' end,
      case when p_approve
        then 'You can now manage ' || coalesce(v_business_name, 'the business') || '.'
        else 'Your request to manage ' || coalesce(v_business_name, 'the business') || ' was declined.' end,
      case when p_approve
        then '/business/' || v_session.business_id || '/manage'
        else '/account/business-access' end,
      jsonb_build_object('avatarUrl', v_business_cover, 'actorName', v_business_name,
        'statusPill', case when p_approve then 'Approved' else 'Denied' end,
        'tone', case when p_approve then 'success' else 'danger' end)
    );
  exception when others then null;
  end;
end
$function$
;

CREATE OR REPLACE FUNCTION public.decline_delivery_batch(p_batch_id text)
 RETURNS delivery_batches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_batch public.delivery_batches%rowtype;
  v_count int;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_batch from public.delivery_batches where id = p_batch_id for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if v_uid is distinct from v_batch.agent_user_id then raise exception 'NOT_AGENT'; end if;
  if v_batch.status <> 'PENDING_ACCEPTANCE' then raise exception 'INVALID_BATCH_STATE'; end if;

  select count(*) into v_count from public.appointment_deliveries where batch_id = p_batch_id;
  delete from public.appointment_deliveries where batch_id = p_batch_id;

  update public.delivery_batches set status = 'DECLINED'
    where id = p_batch_id returning * into v_batch;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    select b.owner_user_id, 'QUEUE_UPDATE', 'Delivery run declined',
           'Your agent declined ' || v_count || ' ' || (case when v_count = 1 then 'delivery' else 'deliveries' end) || ' — please reassign.',
           '/business/' || v_batch.business_id || '/manage/appointments'
    from public.businesses b where b.id = v_batch.business_id;
  exception when others then null; end;

  return v_batch;
end $function$
;

CREATE OR REPLACE FUNCTION public.delete_business(p_business_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid     text := auth.uid()::text;
  v_owner   text;
  v_status  text;
  v_live    int;
  v_biz_name text;
  v_grantee text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select owner_user_id, status::text into v_owner, v_status
    from public.businesses where id = p_business_id for update;
  if v_owner is null then raise exception 'BUSINESS_NOT_FOUND'; end if;

  if v_owner is distinct from v_uid then
    raise exception 'Only the business owner can delete this business.';
  end if;

  if v_status = 'DELETED' then
    raise exception 'This business is already deleted.';
  end if;

  select count(*) into v_live
    from public.appointments a
   where a.target_type = 'BUSINESS'
     and a.target_id = p_business_id
     and a.status in ('PENDING','ACCEPTED')
     and a.scheduled_for >= now();
  if v_live > 0 then
    raise exception 'You have % upcoming booking(s). Cancel or complete them before deleting.', v_live;
  end if;

  select name into v_biz_name from public.businesses where id = p_business_id;

  update public.businesses
     set status = 'DELETED', deleted_at = now()
   where id = p_business_id;

  for v_grantee in
    update public.business_access_sessions
       set status = 'REVOKED', decided_at = now()
     where business_id = p_business_id
       and status in ('PENDING','ACTIVE')
    returning grantee_user_id
  loop
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_grantee, 'QUEUE_UPDATE', 'Business closed',
              coalesce(v_biz_name, 'A business') || ' was deleted by its owner — your access has ended.',
              '/account/business-access');
    exception when others then null;
    end;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.derive_notification_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.entity_type is null then
    if new.deep_link ~ '^/business/[^/]+/manage' then
      new.entity_type := 'BUSINESS';
      new.entity_id := split_part(new.deep_link, '/', 3);
    elsif new.deep_link ~ '^/provider/[^/]+/manage' then
      new.entity_type := 'PROVIDER';
      new.entity_id := split_part(new.deep_link, '/', 3);
    else
      new.entity_type := 'CUSTOMER';
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.distance_km(in_lng double precision, in_lat double precision, row_lng double precision, row_lat double precision)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select ST_Distance(
    ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(row_lng, row_lat), 4326)::geography
  ) / 1000.0;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_business_location_freeze()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.lat IS DISTINCT FROM OLD.lat OR NEW.lng IS DISTINCT FROM OLD.lng) THEN
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Business location is frozen — submit a location change for admin approval';
    END IF;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.enforce_customer_daily_appointment_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_count integer;
begin
  if coalesce(new.is_walk_in, false) then
    return new;
  end if;

  if new.status in ('CANCELLED', 'REJECTED') then
    return new;
  end if;

  select count(*)
    into v_count
    from public.appointments a
   where a.customer_user_id = new.customer_user_id
     and a.id is distinct from new.id
     and coalesce(a.is_walk_in, false) = false
     and a.status not in ('CANCELLED', 'REJECTED')
     and a.scheduled_for >= date_trunc('day', new.scheduled_for)
     and a.scheduled_for <  date_trunc('day', new.scheduled_for) + interval '1 day';

  if v_count >= 5 then
    raise exception 'You''ve reached the limit of 5 appointments for this day. Please pick another date.';
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.enforce_manual_verification_decision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if auth.role() is distinct from 'service_role' then
    if tg_op = 'INSERT' then
      if new.verification_status in ('APPROVED', 'REJECTED') then
        raise exception 'verification_status can only be set to % by the verification review service', new.verification_status;
      end if;
      if new.is_verified = true then
        raise exception 'is_verified can only be set by the verification review service';
      end if;
    else
      if new.verification_status is distinct from old.verification_status
         and new.verification_status in ('APPROVED', 'REJECTED') then
        raise exception 'verification_status can only be set to % by the verification review service', new.verification_status;
      end if;
      if new.is_verified is distinct from old.is_verified then
        raise exception 'is_verified can only be changed by the verification review service';
      end if;
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.enforce_places_status_freeze()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status is distinct from old.status then
    if auth.role() is distinct from 'service_role' and not public.is_admin() then
      raise exception 'Only an admin can change a place''s review status';
    end if;
  end if;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_proposal_responder_entity_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.responder_type is null or new.responder_type = 'user' then
    new.responder_type := 'user';
    new.responder_entity_id := null;
    return new;
  end if;

  if new.responder_type = 'business' then
    if new.responder_entity_id is null
       or not public.has_business_scope(new.responder_entity_id, new.responder_user_id, 'leads') then
      raise exception 'You can only submit a business proposal as a business you have leads access to.';
    end if;
    return new;
  end if;

  -- Providers have no delegation system — literal ownership only, unchanged.
  if new.responder_type = 'provider' then
    if new.responder_entity_id is null or not exists (
      select 1 from public.providers p
       where p.id = new.responder_entity_id
         and p.user_id = new.responder_user_id
    ) then
      raise exception 'You can only submit a provider proposal as a provider profile you own.';
    end if;
    return new;
  end if;

  raise exception 'Invalid proposal responder type.';
end $function$
;

CREATE OR REPLACE FUNCTION public.enforce_queue_cancel_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'LEFT' and old.status <> 'LEFT'
     and coalesce(old.payment_status, 'UNPAID') in ('PENDING_CONFIRM', 'PAID') then
    raise exception 'This visit has a payment in progress and can''t be cancelled.';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.enforce_queue_open_on_join()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_is_open boolean;
begin
  if new.customer_user_id is null then
    return new;
  end if;

  select is_open into v_is_open
    from public.queue_settings
   where business_id = new.business_id;

  if coalesce(v_is_open, false) is false then
    raise exception 'This queue is currently closed — the shop isn''t accepting new joins right now.';
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.enforce_queue_token_customer_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
begin
  -- Server-side context (cron sweep, SECURITY DEFINER maintenance) — no JWT,
  -- nothing to restrict. See close_stale_queue_tokens.
  if v_uid is null then
    return new;
  end if;

  -- Business owner or scoped team member: unrestricted. Their own RLS policy
  -- already decides whether they may touch this row at all.
  if public.has_business_scope(new.business_id, v_uid, 'queue') then
    return new;
  end if;

  -- Anyone who is neither staff nor the token holder should have been stopped
  -- by RLS; belt and braces in case a policy is ever widened.
  if old.customer_user_id is distinct from v_uid then
    raise exception 'NOT_YOUR_TOKEN';
  end if;

  -- The customer may leave the queue, and nothing else about status.
  if new.status is distinct from old.status and new.status <> 'LEFT' then
    raise exception 'QUEUE_STATUS_NOT_YOURS_TO_SET';
  end if;

  -- The customer may claim a payment for confirmation, never settle one.
  if new.payment_status is distinct from old.payment_status
     and new.payment_status <> 'PENDING_CONFIRM' then
    raise exception 'PAYMENT_STATUS_NOT_YOURS_TO_SET';
  end if;

  -- Ownership columns are never the customer's to move — reassigning either
  -- would let a token be laundered into a different shop or holder.
  if new.business_id is distinct from old.business_id
     or new.customer_user_id is distinct from old.customer_user_id then
    raise exception 'IMMUTABLE_FIELD';
  end if;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_role_privilege_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
  v_privilege_roles text[] := array['admin', 'super_admin'];
  v_old_roles text[];
begin
  if auth.role() = 'service_role'
     or coalesce(current_setting('app.role_change_ok', true), '') = 'true' then
    return new;
  end if;

  v_old_roles := case when tg_op = 'INSERT' then '{}'::text[] else old.roles end;

  foreach v_role in array v_privilege_roles loop
    if (v_role = any(coalesce(new.roles, '{}')))
       is distinct from (v_role = any(coalesce(v_old_roles, '{}'))) then
      raise exception 'roles: % can only be granted or revoked via the admin console', v_role;
    end if;
  end loop;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.enforce_slot_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_capacity int;
  v_used int;
  v_ceiling int;
  v_total int;
  v_max_party int;
  v_is_blocked boolean := false;
  v_appt_date text;
  v_appt_dow int;
begin
  if new.status in ('CANCELLED', 'REJECTED', 'NO_SHOW') then
    return new;
  end if;

  -- An out-of-range request in PENDING state does NOT block the calendar.
  -- It can be inserted without locking capacity. Capacity is only enforced
  -- when the business owner/provider accepts it (transition to ACCEPTED).
  if new.status = 'PENDING' and coalesce(new.is_out_of_range, false) = true then
    return new;
  end if;

  -- Only re-check when something capacity- or schedule-relevant changed, so an unrelated
  -- UPDATE (payment status, notes) never re-validates or takes the lock.
  -- IMPORTANT: If transitioning from an out-of-range PENDING request to ACCEPTED,
  -- capacity was NOT checked at insert, so we MUST run the check now!
  if TG_OP = 'UPDATE'
     and new.scheduled_for is not distinct from old.scheduled_for
     and new.time_label    is not distinct from old.time_label
     and new.date_label    is not distinct from old.date_label
     and new.package_id    is not distinct from old.package_id
     and new.party_size    is not distinct from old.party_size
     and new.target_id     is not distinct from old.target_id
     and old.status not in ('CANCELLED', 'REJECTED', 'NO_SHOW')
     and not (old.status = 'PENDING' and coalesce(old.is_out_of_range, false) = true and new.status = 'ACCEPTED') then
    return new;
  end if;

  -- Serialise concurrent bookings for the same target+timestamp so racing
  -- inserts cannot bypass blocked slots or capacity limits.
  perform pg_advisory_xact_lock(hashtext(new.target_id || '|' || new.scheduled_for::text));

  -- 1) Check blocked slots (SLOT_BLOCKING: S1)
  v_appt_date := coalesce(new.date_label, (new.scheduled_for at time zone 'Asia/Kolkata')::date::text);
  v_appt_dow  := extract(dow from (new.scheduled_for at time zone 'Asia/Kolkata'))::int;

  select exists (
    select 1 from public.blocked_slots bs
     where bs.target_type = new.target_type
       and bs.target_id = new.target_id
       and (
         -- Specific date block (whole day or matching time_label)
         (
           bs.recurring = false
           and bs.date::text = v_appt_date
           and (bs.time_label is null or bs.time_label = new.time_label)
         )
         or
         -- Recurring weekday block (whole day or matching time_label)
         (
           bs.recurring = true
           and bs.weekday = v_appt_dow
           and (bs.time_label is null or bs.time_label = new.time_label)
         )
       )
  ) into v_is_blocked;

  if v_is_blocked then
    raise exception 'SLOT_BLOCKED';
  end if;

  -- 2) Check party size & package capacity
  v_capacity := public.resolve_slot_capacity(new.target_type, new.target_id, new.package_id);

  if new.target_type = 'BUSINESS' and new.package_id is not null then
    select ci.max_party_size into v_max_party from public.catalog_items ci
     where ci.id = new.package_id and ci.business_id = new.target_id;
    if v_max_party is not null and new.party_size > v_max_party then
      raise exception 'PARTY_SIZE_TOO_LARGE';
    end if;
  end if;
  if new.party_size > v_capacity then
    raise exception 'PARTY_SIZE_TOO_LARGE';
  end if;

  -- 3) Check slot capacity usage (exclude out-of-range PENDING bookings)
  select coalesce(sum(a.party_size), 0) into v_used
    from public.appointments a
   where a.target_type = new.target_type
     and a.target_id = new.target_id
     and a.scheduled_for = new.scheduled_for
     and a.package_id is not distinct from new.package_id
     and (
       a.status = 'ACCEPTED'
       or (a.status = 'PENDING' and coalesce(a.is_out_of_range, false) = false)
     )
     and a.id is distinct from new.id;

  if v_used + new.party_size > v_capacity then
    raise exception 'SLOT_FULL';
  end if;

  -- 4) Check business-wide concurrent bookings ceiling (exclude out-of-range PENDING bookings)
  if new.target_type = 'BUSINESS' then
    select b.max_concurrent_bookings into v_ceiling
      from public.businesses b where b.id = new.target_id;
    if v_ceiling is not null then
      select coalesce(sum(a.party_size), 0) into v_total
        from public.appointments a
       where a.target_type = 'BUSINESS' and a.target_id = new.target_id
         and a.scheduled_for = new.scheduled_for
         and (
           a.status = 'ACCEPTED'
           or (a.status = 'PENDING' and coalesce(a.is_out_of_range, false) = false)
         )
         and a.id is distinct from new.id;
      if v_total + new.party_size > v_ceiling then
        raise exception 'SLOT_FULL_OVERALL';
      end if;
    end if;
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.expire_tokens_on_queue_close()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.is_open = true and new.is_open = false then
    begin
      with expired as (
        update public.queue_tokens t
           set status = 'EXPIRED', closed_reason = 'SHOP_CLOSED'
         where t.business_id = new.business_id
           and t.status in ('WAITING', 'CALLED')
           and coalesce(t.payment_status, 'UNPAID') not in ('PENDING_CONFIRM', 'PAID')
           and not (t.status = 'CALLED' and t.arrived_at is not null)
        returning t.id, t.customer_user_id, t.business_id
      )
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      select e.customer_user_id, 'QUEUE_UPDATE', 'Queue closed',
             coalesce(b.name, 'The shop') || ' closed its queue — you''ve been removed from the line.',
             '/queues',
             jsonb_build_object('avatarUrl', b.cover_image, 'actorName', b.name, 'statusPill', 'Closed', 'tone', 'neutral')
        from expired e
        left join public.businesses b on b.id = e.business_id;
    exception when others then
      update public.queue_tokens t
         set status = 'EXPIRED', closed_reason = 'SHOP_CLOSED'
       where t.business_id = new.business_id
         and t.status in ('WAITING', 'CALLED')
         and coalesce(t.payment_status, 'UNPAID') not in ('PENDING_CONFIRM', 'PAID')
         and not (t.status = 'CALLED' and t.arrived_at is not null);
    end;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.get_delivery_duty()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_on boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select on_duty into v_on from public.delivery_agent_duty where user_id = v_uid;
  return coalesce(v_on, true);
end
$function$
;

CREATE OR REPLACE FUNCTION public.get_entity_recovery_question(p_kind text)
 RETURNS TABLE(question_id text, question_text text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_qid text;
  v_qtext text;
begin
  if v_uid is null then
    return;
  end if;
  if p_kind not in ('business', 'provider') then
    return;
  end if;

  if p_kind = 'business' then
    select business_recovery_question_id, business_recovery_question_text
      into v_qid, v_qtext
      from public.users
     where id = v_uid
       and business_recovery_answer_hash is not null;
  else
    select provider_recovery_question_id, provider_recovery_question_text
      into v_qid, v_qtext
      from public.users
     where id = v_uid
       and provider_recovery_answer_hash is not null;
  end if;

  if v_qid is null then
    return;
  end if;

  question_id := v_qid;
  question_text := case when v_qid = 'custom' then v_qtext else null end;
  return next;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_leaderboard()
 RETURNS TABLE(rank bigint, name text, avatar text, metric text, value text, is_provider boolean, target_id text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with top_providers as (
    select
      row_number() over (order by p.rating_avg desc, p.rating_count desc) as rank,
      p.display_name  as name,
      coalesce(p.avatar, '')            as avatar,
      'Avg rating'                      as metric,
      round(p.rating_avg, 1)::text || ' ★' as value,
      true                              as is_provider,
      p.id                              as target_id
    from public.providers p
    where p.status = 'ACTIVE'
      and p.owner_enabled = true
      and p.deleted_at is null
      and p.rating_count >= 1
    limit 10
  ),
  top_neighbors as (
    select
      row_number() over (order by count(*) desc) as rank,
      u.name           as name,
      ''               as avatar,
      'Jobs done'      as metric,
      count(*)::text || ' jobs' as value,
      false            as is_provider,
      u.id             as target_id
    from public.agreements ag
    join public.users u on u.id = ag.responder_user_id
    where ag.status = 'COMPLETED'
      and u.customer_enabled = true
      and u.customer_deleted_at is null
    group by u.id, u.name
    limit 10
  )
  select * from top_providers
  union all
  select * from top_neighbors;
$function$
;

CREATE OR REPLACE FUNCTION public.get_live_share(p_share_id text)
 RETURNS TABLE(id text, sharer_user_id text, sharer_name text, sharer_avatar text, status text, lat double precision, lng double precision, accuracy double precision, heading double precision, updated_at timestamp with time zone, started_at timestamp with time zone, ended_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_is_recipient boolean := false;
  v_is_sharer    boolean := false;
begin
  if v_uid is null then return; end if;

  select exists (
    select 1 from public.live_shares s
    where s.id = p_share_id and s.sharer_user_id = v_uid
  ) into v_is_sharer;

  if not v_is_sharer then
    select exists (
      select 1 from public.live_share_recipients r
      where r.share_id = p_share_id and r.recipient_user_id = v_uid
    ) into v_is_recipient;
  end if;

  if not v_is_sharer and not v_is_recipient then
    return;
  end if;

  return query
  select
    s.id,
    s.sharer_user_id,
    u.name as sharer_name,
    u.avatar as sharer_avatar,
    case
      when s.status = 'ACTIVE' and s.expires_at <= now() then 'ENDED'
      else s.status
    end as status,
    s.lat,
    s.lng,
    s.accuracy,
    s.heading,
    s.updated_at,
    s.started_at,
    case
      when s.status = 'ACTIVE' and s.expires_at <= now() then s.expires_at
      else s.ended_at
    end as ended_at
  from public.live_shares s
  left join public.users u on u.id = s.sharer_user_id
  where s.id = p_share_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.get_nearby_user_ids(p_lat double precision, p_lng double precision, p_radius_km double precision)
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from public.users
   where lat is not null and lng is not null
     and lat between p_lat - (least(p_radius_km, 50) / 111.0) and p_lat + (least(p_radius_km, 50) / 111.0)
     and lng between p_lng - (least(p_radius_km, 50) / 111.0) and p_lng + (least(p_radius_km, 50) / 111.0);
$function$
;

CREATE OR REPLACE FUNCTION public.get_own_coords()
 RETURNS TABLE(lat double precision, lng double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select lat, lng from public.users where id = auth.uid()::text;
$function$
;

CREATE OR REPLACE FUNCTION public.get_own_profile()
 RETURNS SETOF users
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from public.users where id = auth.uid()::text;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_profile(target_id text)
 RETURNS TABLE(id text, name text, phone text, avatar text, area text, rating_avg numeric, rating_count integer, created_at timestamp with time zone, show_posts_publicly boolean, show_asks_publicly boolean, show_badges_publicly boolean, show_phone_publicly boolean, show_city_publicly boolean, show_rating_publicly boolean, distance_km numeric, email text, show_email_publicly boolean, show_name_publicly boolean, alias text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_is_self_or_admin boolean;
  v_my_lat double precision;
  v_my_lng double precision;
begin
  select (u.id = v_uid) or ('admin' = any(u.roles))
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
end $function$
;

CREATE OR REPLACE FUNCTION public.get_shared_location(p_target text)
 RETURNS TABLE(lat double precision, lng double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
begin
  return query
    select u.lat, u.lng
    from public.users u
    where u.id = p_target
      and (
        u.id = v_uid
        or exists (select 1 from public.users a where a.id = v_uid and 'admin' = any(a.roles))
        or coalesce(u.location_public, false)
        or exists (
          select 1 from public.location_share_grants g
          where g.owner_user_id = p_target
            and g.requester_user_id = v_uid
            and g.status = 'APPROVED'
            and (g.expires_at is null or g.expires_at > now())
        )
      );
end $function$
;

CREATE OR REPLACE FUNCTION public.get_tracking(p_token text)
 RETURNS TABLE(agreement_id text, provider_lat double precision, provider_lng double precision, live_status text, provider_name text, provider_avatar text, stops_before integer, dest_lat double precision, dest_lng double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Agreements: live tracking unchanged.
  select a.id, a.provider_lat, a.provider_lng, a.live_status, u.name, u.avatar, null::int,
         null::double precision, null::double precision
  from public.tracking_tokens t
  join public.agreements a on a.id = t.agreement_id
  left join public.users u on u.id = a.responder_user_id
  where t.id::text = p_token and t.expires_at > now() and t.agreement_id is not null
  union all
  -- Deliveries: progress only (coordinates always NULL).
  select d.appointment_id,
         null::double precision, null::double precision,
         case when d.status = 'DELIVERED' then 'DONE' else d.live_status end,
         case when d.status in ('EN_ROUTE','ARRIVED','DELIVERED') then u.name else null end,
         case when d.status in ('EN_ROUTE','ARRIVED','DELIVERED') then u.avatar else null end,
         (select count(*)::int from public.appointment_deliveries d2
            where d2.batch_id = d.batch_id and d.batch_id is not null
              and d2.stop_order is not null and d.stop_order is not null
              and d2.stop_order < d.stop_order
              and d2.status not in ('DELIVERED','CANCELLED')),
         null::double precision, null::double precision
  from public.tracking_tokens t
  join public.appointment_deliveries d
    on d.appointment_id = t.appointment_id and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED','DELIVERED')
  left join public.users u on u.id = d.agent_user_id
  where t.id::text = p_token and t.expires_at > now() and t.appointment_id is not null;
$function$
;

CREATE OR REPLACE FUNCTION public.grant_business_access(p_business_id text, p_identifier text)
 RETURNS TABLE(session_id uuid, grantee_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_identifier text := trim(coalesce(p_identifier, ''));
  v_digits text := regexp_replace(v_identifier, '\D', '', 'g');
  v_target text;
  v_name text;
  v_business_name text;
  v_business_cover text;
  v_session_id uuid;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select b.name, b.cover_image into v_business_name, v_business_cover
  from public.businesses b
  where b.id = p_business_id and b.owner_user_id = v_uid;
  if v_business_name is null then raise exception 'NOT_ALLOWED'; end if;
  if v_identifier = '' then raise exception 'IDENTIFIER_REQUIRED'; end if;

  if v_identifier ~ '@.*\.' then
    select u.id, coalesce(nullif(trim(u.alias), ''), u.name, 'User')
    into v_target, v_name
    from public.users u
    where lower(u.email) = lower(v_identifier)
    order by u.id limit 1;
  elsif regexp_replace(v_identifier, '[\s\-+]', '', 'g') ~ '^\d{6,}$' then
    select u.id, coalesce(nullif(trim(u.alias), ''), u.name, 'User')
    into v_target, v_name
    from public.users u
    where right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10)
          = right(v_digits, 10)
    order by u.id limit 1;
  else
    select u.id, coalesce(nullif(trim(u.alias), ''), u.name, 'User')
    into v_target, v_name
    from public.users u
    where lower(u.alias) = lower(ltrim(v_identifier, '@'))
    order by u.id limit 1;
  end if;

  if v_target is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_target = v_uid then raise exception 'OWNER_ALREADY_HAS_ACCESS'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id || ':' || v_target, 0));

  update public.business_access_sessions
  set status = 'EXPIRED', decided_at = coalesce(decided_at, now())
  where business_id = p_business_id and grantee_user_id = v_target
    and status in ('PENDING', 'ACTIVE')
    and expires_at is not null and expires_at <= now();

  select s.id into v_session_id
  from public.business_access_sessions s
  where s.business_id = p_business_id
    and s.grantee_user_id = v_target
    and s.status in ('PENDING', 'ACTIVE')
  order by s.requested_at desc, s.id desc
  limit 1 for update;

  if v_session_id is null then
    insert into public.business_access_sessions
      (business_id, grantee_user_id, status, decided_at, expires_at)
    values (p_business_id, v_target, 'ACTIVE', now(), null)
    returning id into v_session_id;
  else
    update public.business_access_sessions
    set status = 'ACTIVE', decided_at = now(), expires_at = null
    where id = v_session_id;
  end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (v_target, 'BUSINESS_ACCESS', 'Access granted',
      'You can now manage ' || coalesce(v_business_name, 'a business') || '.',
      '/business/' || p_business_id || '/manage',
      jsonb_build_object('avatarUrl', v_business_cover, 'actorName', v_business_name, 'statusPill', 'Granted', 'tone', 'success'));
  exception when others then null;
  end;

  return query select v_session_id, coalesce(v_name, 'User');
end
$function$
;

CREATE OR REPLACE FUNCTION public.grant_team_member_access(p_business_id text, p_identifier text, p_scopes text[])
 RETURNS TABLE(session_id uuid, grantee_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid      text := auth.uid()::text;
  v_target   text;
  v_name     text;
  v_ident    text := trim(p_identifier);
  v_digits   text := regexp_replace(v_ident, '\D', '', 'g');
  v_biz_name text;
  v_session_id uuid;
  v_scopes   text[] := coalesce((select array_agg(distinct s) from unnest(p_scopes) as s
                                   where s in ('appointments','queue','catalog','leads','delivery')), '{}');
begin
  if v_uid is null then raise exception 'Sign in to your STRYT account first.'; end if;
  if array_length(v_scopes, 1) is null then raise exception 'Pick at least one section to grant access to.'; end if;

  select b.name into v_biz_name from public.businesses b
   where b.id = p_business_id and b.owner_user_id = v_uid;
  if v_biz_name is null then raise exception 'Only the business owner can add team members.'; end if;

  if v_ident ~ '@.*\.' then
    select id, name into v_target, v_name from public.users where lower(email) = lower(v_ident) limit 1;
  elsif regexp_replace(v_ident, '[\s\-+]', '', 'g') ~ '^\d{6,}$' then
    select id, name into v_target, v_name from public.users
     where regexp_replace(coalesce(phone, ''), '\D', '', 'g') like '%' || right(v_digits, 10)
     limit 1;
  else
    select id, name into v_target, v_name from public.users
     where lower(alias) = lower(ltrim(v_ident, '@'))
     limit 1;
  end if;

  if v_target is null then
    raise exception 'No STRYT account found for that mobile number, email, or username.';
  end if;
  if v_target = v_uid then
    raise exception 'You already own this business.';
  end if;

  update public.business_access_sessions
     set status = 'EXPIRED', decided_at = coalesce(decided_at, now())
   where business_id = p_business_id and grantee_user_id = v_target
     and status in ('PENDING', 'ACTIVE')
     and expires_at is not null and expires_at <= now();

  select id into v_session_id
  from public.business_access_sessions
  where business_id = p_business_id and grantee_user_id = v_target
    and status in ('PENDING', 'ACTIVE')
  order by requested_at desc, id desc
  limit 1 for update;

  if v_session_id is not null then
    update public.business_access_sessions
       set status = 'ACTIVE', decided_at = now(), expires_at = null,
           access_level = 'SCOPED', scopes = v_scopes
     where id = v_session_id;
  else
    insert into public.business_access_sessions
      (business_id, grantee_user_id, status, decided_at, expires_at, access_level, scopes)
    values (p_business_id, v_target, 'ACTIVE', now(), null, 'SCOPED', v_scopes)
    returning id into v_session_id;
  end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_target, 'BUSINESS_ACCESS', 'Team access granted',
            'You can now help manage ' || coalesce(v_biz_name, 'a business') || ' from Switch account.',
            '/account/business-access');
  exception when others then null; end;

  session_id := v_session_id;
  grantee_name := coalesce(v_name, 'User');
  return next;
end $function$
;

CREATE OR REPLACE FUNCTION public.group_buy_issue_tokens(p_request_id text, p_agreement_id text, p_business_id text DEFAULT NULL::text, p_unit_price numeric DEFAULT NULL::numeric, p_valid_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_req public.requests%rowtype;
  v_agr public.agreements%rowtype;
  v_issued integer := 0;
  m record;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_req from public.requests where id = p_request_id;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_req.requester_user_id <> v_uid then raise exception 'NOT_INITIATOR'; end if;

  select * into v_agr from public.agreements where id = p_agreement_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  for m in
    select user_id, quantity from public.request_me_toos where request_id = p_request_id
    union
    select v_req.requester_user_id, coalesce(
      (select quantity from public.request_me_toos
        where request_id = p_request_id and user_id = v_req.requester_user_id), 1)
  loop
    begin
      insert into public.group_buy_tokens (
        token_code, agreement_id, request_id, holder_user_id, issuer_user_id,
        business_id, quantity, unit_price, item_label, valid_until, pickup_pin
      ) values (
        'STRYT-' || upper(substring(md5(gen_random_uuid()::text) from 1 for 4))
                 || '-' || upper(substring(md5(gen_random_uuid()::text) from 1 for 4)),
        p_agreement_id, p_request_id, m.user_id, v_uid,
        p_business_id, coalesce(m.quantity, 1),
        coalesce(p_unit_price, v_agr.agreed_price), v_req.title, p_valid_until,
        case when v_req.fulfillment_type = 'CENTRAL_DROP'
             then lpad((floor(random() * 10000))::int::text, 4, '0')
             else null end
      );
      v_issued := v_issued + 1;
    exception when unique_violation then
      null;
    end;
  end loop;

  update public.requests set group_agreement_id = p_agreement_id where id = p_request_id;

  insert into public.notifications (user_id, type, title, body, deep_link)
  select mt.user_id, 'GROUP_BUY_UNLOCKED', 'Group buy confirmed',
         'Your claim pass for "' || v_req.title || '" is ready',
         '/request/' || p_request_id
    from public.request_me_toos mt
   where mt.request_id = p_request_id and mt.user_id <> v_uid;

  return v_issued;
end
$function$
;

CREATE OR REPLACE FUNCTION public.group_buy_join(p_request_id text, p_quantity integer DEFAULT 1, p_notes text DEFAULT NULL::text, p_delivery_address text DEFAULT NULL::text)
 RETURNS requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_req public.requests%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'INVALID_QUANTITY'; end if;

  select * into v_req from public.requests where id = p_request_id;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_req.status <> 'OPEN' then raise exception 'REQUEST_CLOSED'; end if;

  -- A doorstep group buy is undeliverable without an address, so it's
  -- required at pledge time rather than chased down after the deal closes.
  if v_req.fulfillment_type = 'DOORSTEP'
     and nullif(trim(coalesce(p_delivery_address, '')), '') is null then
    raise exception 'DELIVERY_ADDRESS_REQUIRED';
  end if;

  insert into public.request_me_toos (request_id, user_id, quantity, notes, delivery_address)
  values (p_request_id, v_uid, p_quantity,
          nullif(left(trim(coalesce(p_notes,'')), 300), ''),
          nullif(left(trim(coalesce(p_delivery_address,'')), 400), ''))
  on conflict (request_id, user_id) do update
    set quantity = excluded.quantity,
        notes = excluded.notes,
        delivery_address = excluded.delivery_address;

  update public.requests
     set me_too_count = (select count(*) from public.request_me_toos where request_id = p_request_id)
   where id = p_request_id
  returning * into v_req;

  return v_req;
end
$function$
;

CREATE OR REPLACE FUNCTION public.group_buy_leave(p_request_id text)
 RETURNS requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_req public.requests%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  delete from public.request_me_toos where request_id = p_request_id and user_id = v_uid;
  update public.requests
     set me_too_count = (select count(*) from public.request_me_toos where request_id = p_request_id)
   where id = p_request_id
  returning * into v_req;
  return v_req;
end
$function$
;

CREATE OR REPLACE FUNCTION public.group_buy_redemption_stats(p_agreement_id text)
 RETURNS TABLE(total integer, redeemed integer, pending integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::integer,
         count(*) filter (where status = 'REDEEMED')::integer,
         count(*) filter (where status = 'ISSUED')::integer
    from public.group_buy_tokens
   where agreement_id = p_agreement_id;
$function$
;

CREATE OR REPLACE FUNCTION public.group_buy_token_redeem(p_token_code text)
 RETURNS group_buy_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_tok public.group_buy_tokens%rowtype;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_tok from public.group_buy_tokens
   where token_code = upper(trim(p_token_code)) for update;
  if not found then raise exception 'TOKEN_NOT_FOUND'; end if;

  v_allowed := v_tok.issuer_user_id = v_uid
    or (v_tok.business_id is not null
        and public.has_business_scope(v_tok.business_id, v_uid, 'appointments'))
    or exists (
      select 1 from public.agreements a
       where a.id = v_tok.agreement_id and a.responder_user_id = v_uid
    );
  if not v_allowed then raise exception 'NOT_AUTHORIZED_TO_REDEEM'; end if;

  if v_tok.status = 'REDEEMED' then raise exception 'ALREADY_REDEEMED'; end if;
  if v_tok.status = 'EXPIRED' then raise exception 'TOKEN_EXPIRED'; end if;
  if v_tok.valid_until is not null and v_tok.valid_until < now() then
    raise exception 'TOKEN_EXPIRED';
  end if;

  update public.group_buy_tokens
     set status = 'REDEEMED', redeemed_at = now(), redeemed_by = v_uid
   where id = v_tok.id and status = 'ISSUED'
  returning * into v_tok;
  if not found then raise exception 'ALREADY_REDEEMED'; end if;

  return v_tok;
end
$function$
;

CREATE OR REPLACE FUNCTION public.group_buy_tokens_for_agreement(p_agreement_id text)
 RETURNS SETOF group_buy_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_uid text := auth.uid()::text; v_allowed boolean; begin if v_uid is null then raise exception 'UNAUTHENTICATED'; end if; select exists (select 1 from public.agreements a where a.id = p_agreement_id and (a.responder_user_id = v_uid or a.requester_user_id = v_uid)) or exists (select 1 from public.group_buy_tokens t where t.agreement_id = p_agreement_id and t.business_id is not null and public.has_business_scope(t.business_id, v_uid, 'appointments')) or public.is_admin() into v_allowed; if not v_allowed then raise exception 'NOT_AUTHORIZED'; end if; return query select * from public.group_buy_tokens where agreement_id = p_agreement_id order by created_at desc; end $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.users (id, name, phone, email, roles)
  values (
    new.id::text,
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
end $function$
;

CREATE OR REPLACE FUNCTION public.has_business_access(p_business_id text, p_uid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_user_id = p_uid
  ) or exists (
    select 1 from public.business_access_sessions s
    where s.business_id = p_business_id
      and s.grantee_user_id = p_uid
      and s.status = 'ACTIVE'
      and (s.expires_at is null or s.expires_at > now())
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_business_full_access(p_business_id text, p_uid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_user_id = p_uid)
      or exists (select 1 from public.business_access_sessions s
                  where s.business_id = p_business_id and s.grantee_user_id = p_uid
                    and s.status = 'ACTIVE' and (s.expires_at is null or s.expires_at > now())
                    and s.access_level = 'FULL');
$function$
;

CREATE OR REPLACE FUNCTION public.has_business_scope(p_business_id text, p_uid text, p_scope text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_user_id = p_uid)
      or exists (select 1 from public.business_access_sessions s
                  where s.business_id = p_business_id and s.grantee_user_id = p_uid
                    and s.status = 'ACTIVE' and (s.expires_at is null or s.expires_at > now())
                    and (s.access_level = 'FULL' or p_scope = any(s.scopes)));
$function$
;

CREATE OR REPLACE FUNCTION public.haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select 6371 * 2 * asin(sqrt(
    sin(radians(lat2 - lat1) / 2) ^ 2 +
    cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
  ));
$function$
;

CREATE OR REPLACE FUNCTION public.increment_stamp(p_card_id text, p_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target int := 10;
  v_reward text := '';
  v_stamps int := 0;
  v_earned bool := false;
BEGIN
  SELECT target, COALESCE(reward, '')
    INTO v_target, v_reward
    FROM public.loyalty_cards
   WHERE id = p_card_id AND is_active = true
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('stamps', 0, 'needed', 10, 'rewardEarned', false, 'reward', '');
  END IF;

  INSERT INTO public.user_stamps (user_id, card_id, stamps, updated_at)
  VALUES (p_user_id, p_card_id, 1, now())
  ON CONFLICT (user_id, card_id)
  DO UPDATE SET stamps = user_stamps.stamps + 1, updated_at = now()
  RETURNING stamps INTO v_stamps;

  IF v_stamps >= v_target THEN
    v_earned := true;
    UPDATE public.user_stamps
       SET stamps = v_stamps % v_target, updated_at = now()
     WHERE user_id = p_user_id AND card_id = p_card_id;
    v_stamps := v_stamps % v_target;
  END IF;

  RETURN jsonb_build_object(
    'stamps',      v_stamps,
    'needed',      v_target,
    'rewardEarned', v_earned,
    'reward',      v_reward
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.users
    where id = auth.uid()::text
      and 'admin' = any(roles)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.users
    where id = p_user_id and 'admin' = any(roles)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_blocked_between(p_other_user_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when auth.uid() is null or p_other_user_id is null then false
    else public._user_blocks_exists(auth.uid()::text, p_other_user_id)
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_entity_password_set(p_kind text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case p_kind
    when 'business' then (business_password_hash is not null)
    when 'provider' then (provider_password_hash is not null)
    else false end
  from public.users where id = auth.uid()::text;
$function$
;

CREATE OR REPLACE FUNCTION public.is_entity_recovery_set(p_kind text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case p_kind
    when 'business' then (business_recovery_answer_hash is not null)
    when 'provider' then (provider_recovery_answer_hash is not null)
    else false
  end
  from public.users
  where id = auth.uid()::text;
$function$
;

CREATE OR REPLACE FUNCTION public.is_society_admin(p_society_id uuid, p_user_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.society_members
    where society_id = p_society_id and user_id = p_user_id
      and approved = true and role in ('ADMIN', 'SECRETARY')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_society_member(p_society_id uuid, p_user_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.society_members
    where society_id = p_society_id and user_id = p_user_id and approved = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_switch_pin_set()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (switch_pin_hash is not null) from public.users where id = auth.uid()::text;
$function$
;

CREATE OR REPLACE FUNCTION public.me_too_toggle(p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_req public.requests%rowtype;
  v_exists boolean;
  v_count integer;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_req from public.requests where id = p_request_id;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_req.status <> 'OPEN' then raise exception 'REQUEST_CLOSED'; end if;

  select exists(
    select 1 from public.request_me_toos
    where request_id = p_request_id and user_id = v_uid
  ) into v_exists;

  if v_exists then
    delete from public.request_me_toos
    where request_id = p_request_id and user_id = v_uid;

    select count(*) into v_count
    from public.request_me_toos where request_id = p_request_id;

    update public.requests set me_too_count = v_count where id = p_request_id;
    return jsonb_build_object('ok', true, 'meTooed', false, 'count', v_count);
  else
    insert into public.request_me_toos (request_id, user_id, quantity)
    values (p_request_id, v_uid, 1)
    on conflict (request_id, user_id) do nothing;

    select count(*) into v_count
    from public.request_me_toos where request_id = p_request_id;

    update public.requests set me_too_count = v_count where id = p_request_id;
    return jsonb_build_object('ok', true, 'meTooed', true, 'count', v_count);
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.my_business_access_scope(p_business_id text)
 RETURNS TABLE(access_level text, scopes text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select 'FULL'::text, '{}'::text[]
   where exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_user_id = auth.uid()::text)
  union all
  select s.access_level, s.scopes
    from public.business_access_sessions s
   where s.business_id = p_business_id and s.grantee_user_id = auth.uid()::text
     and s.status = 'ACTIVE' and (s.expires_at is null or s.expires_at > now())
   limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.my_business_access_status(p_business_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (select auth.uid()) is not null
    and public.has_business_access(p_business_id, (select auth.uid())::text);
$function$
;

CREATE OR REPLACE FUNCTION public.my_delegated_business_password_status()
 RETURNS TABLE(business_id text, required boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.business_id, (u.business_password_hash is not null) as required
    from public.business_access_sessions s
    join public.businesses b on b.id = s.business_id
    join public.users u on u.id = b.owner_user_id
   where s.grantee_user_id = auth.uid()::text
     and s.status = 'ACTIVE' and (s.expires_at is null or s.expires_at > now())
     and b.owner_user_id <> auth.uid()::text;
$function$
;

CREATE OR REPLACE FUNCTION public.my_delegated_businesses()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select business_id from public.business_access_sessions
   where grantee_user_id = auth.uid()::text
     and status = 'ACTIVE'
     and (expires_at is null or expires_at > now());
$function$
;

CREATE OR REPLACE FUNCTION public.my_deliveries()
 RETURNS TABLE(id text, appointment_id text, business_id text, business_name text, customer_name text, customer_area text, delivery_address_line text, delivery_lat double precision, delivery_lng double precision, scheduled_for timestamp with time zone, date_label text, time_label text, status text, live_status text, handoff_code text, handoff_verified boolean, lat double precision, lng double precision, batch_id text, stop_order integer, batch_status text, batch_lat double precision, batch_lng double precision, created_at timestamp with time zone, delivered_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d.id, d.appointment_id, d.business_id, b.name,
    case when d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
         then coalesce(a.customer_name, cu.name, 'Customer')
         else coalesce(cu.alias, 'Customer') end,
    cu.area, a.delivery_address_line, a.delivery_lat, a.delivery_lng,
    a.scheduled_for, a.date_label, a.time_label,
    d.status, d.live_status,
    null::text,
    d.handoff_verified, d.lat, d.lng,
    d.batch_id, d.stop_order, batch.status, batch.lat, batch.lng,
    d.created_at, d.delivered_at
  from public.appointment_deliveries d
  join public.appointments a on a.id = d.appointment_id
  left join public.businesses b on b.id = d.business_id
  left join public.users cu on cu.id = a.customer_user_id
  left join public.delivery_batches batch on batch.id = d.batch_id
  where d.agent_user_id = (auth.uid())::text
  order by
    case d.status when 'EN_ROUTE' then 0 when 'ARRIVED' then 1 when 'ASSIGNED' then 2 else 3 end,
    coalesce(d.stop_order, 999),
    coalesce(a.scheduled_for, d.created_at) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.my_delivery_progress(p_appointment_id text)
 RETURNS TABLE(id text, status text, live_status text, handoff_code text, handoff_verified boolean, agent_name text, agent_phone text, agent_avatar text, agent_revealed boolean, eta_text text, stops_before integer, cancel_reason text, cancel_note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  return query
  select d.id, d.status, d.live_status,
    d.handoff_code, d.handoff_verified,
    case when d.status in ('EN_ROUTE','ARRIVED','DELIVERED') then u.name else null end,
    case when d.status in ('EN_ROUTE','ARRIVED') then u.phone else null end,
    case when d.status in ('EN_ROUTE','ARRIVED','DELIVERED') then u.avatar else null end,
    (d.status in ('EN_ROUTE','ARRIVED','DELIVERED')),
    a.delivery_eta_text,
    (select count(*)::int from public.appointment_deliveries d2
       where d2.batch_id = d.batch_id and d.batch_id is not null
         and d2.stop_order is not null and d.stop_order is not null
         and d2.stop_order < d.stop_order
         and d2.status not in ('DELIVERED','CANCELLED')),
    d.cancel_reason,
    d.cancel_note
  from public.appointment_deliveries d
  join public.appointments a on a.id = d.appointment_id
  left join public.users u on u.id = d.agent_user_id
  where d.appointment_id = p_appointment_id
    and a.customer_user_id = v_uid
  order by d.created_at desc
  limit 1;
end $function$
;

CREATE OR REPLACE FUNCTION public.my_duty_blockers()
 RETURNS TABLE(blocking_count integer, blocking_delivery_id text, blocking_batch_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select count(*)::int,
         min(d.id) filter (where d.status in ('ASSIGNED','EN_ROUTE','ARRIVED'))
    into blocking_count, blocking_delivery_id
    from public.appointment_deliveries d
   where d.agent_user_id = v_uid
     and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED');

  if blocking_count = 0 then
    select count(*)::int, min(b.id)
      into blocking_count, blocking_batch_id
      from public.delivery_batches b
     where b.agent_user_id = v_uid
       and b.status in ('PENDING_ACCEPTANCE','ACCEPTED','IN_PROGRESS');
  end if;

  return next;
end $function$
;

CREATE OR REPLACE FUNCTION public.my_live_share_recipients()
 RETURNS TABLE(recipient_user_id text, recipient_name text, recipient_avatar text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.recipient_user_id, u.name, u.avatar
  from public.live_share_recipients r
  join public.live_shares s on s.id = r.share_id
  join public.users u on u.id = r.recipient_user_id
  where s.sharer_user_id = auth.uid()::text and s.status = 'ACTIVE';
$function$
;

CREATE OR REPLACE FUNCTION public.neighborhood_today(in_lat double precision, in_lng double precision, in_radius_m integer DEFAULT 3000)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  origin  geography := ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography;
  result  json;
begin
  select json_build_object(

    -- New businesses approved/created in last 24h within radius
    'new_businesses', (
      select count(*)
      from businesses b
      where b.status = 'ACTIVE'
        and b.created_at > now() - interval '24 hours'
        and b.geom is not null
        and ST_DWithin(b.geom, origin, in_radius_m)
    ),

    -- Agreements marked COMPLETED in last 24h within the originating request's radius
    -- (agreements have no geom; join to requests for location)
    'jobs_completed', (
      select count(*)
      from agreements a
      join requests r on r.id = a.request_id
      where a.status = 'COMPLETED'
        and a.created_at > now() - interval '24 hours'
        and r.geom is not null
        and ST_DWithin(r.geom, origin, in_radius_m)
    ),

    -- Active providers (is_available_now OR available_until in the future) within radius
    'providers_available', (
      select count(*)
      from providers p
      where p.status = 'ACTIVE'
        and (p.is_available_now = true or p.available_until > now())
        and p.geom is not null
        and ST_DWithin(p.geom, origin, in_radius_m)
    ),

    -- Open, non-expired requests within radius
    -- expires_in_hrs is integer hours from created_at (no separate expires_at column)
    'open_requests', (
      select count(*)
      from requests r
      where r.status = 'OPEN'
        and (
          r.expires_in_hrs is null
          or r.created_at + (r.expires_in_hrs * interval '1 hour') > now()
        )
        and r.geom is not null
        and ST_DWithin(r.geom, origin, in_radius_m)
    ),

    -- Alerts that are resolved and were created in the last 24h
    -- (no resolved_at column; approximated by created_at + resolved=true)
    'alerts_resolved', (
      select count(*)
      from community_posts c
      where c.type = 'ALERT'
        and c.resolved = true
        and c.created_at > now() - interval '24 hours'
        and c.geom is not null
        and ST_DWithin(c.geom, origin, in_radius_m)
    ),

    -- Lost & found posts that are resolved and were created in the last 24h
    'lost_found_resolved', (
      select count(*)
      from community_posts c
      where c.type = 'LOST_FOUND'
        and c.resolved = true
        and c.created_at > now() - interval '24 hours'
        and c.geom is not null
        and ST_DWithin(c.geom, origin, in_radius_m)
    ),

    -- Most recent unresolved ALERT created in the last 24h (urgency signal)
    'active_alert', (
      select json_build_object('id', c.id, 'title', c.title)
      from community_posts c
      where c.type = 'ALERT'
        and (c.resolved is null or c.resolved = false)
        and c.created_at > now() - interval '24 hours'
        and c.geom is not null
        and ST_DWithin(c.geom, origin, in_radius_m)
      order by c.created_at desc
      limit 1
    )

  ) into result;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notification_push_health()
 RETURNS TABLE(pg_net_installed boolean, functions_url_configured boolean, service_role_key_configured boolean, trigger_installed boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    exists(select 1 from pg_extension where extname = 'pg_net') as pg_net_installed,
    coalesce(current_setting('app.settings.functions_url', true), '') <> '' as functions_url_configured,
    coalesce(current_setting('app.settings.service_role_key', true), '') <> '' as service_role_key_configured,
    exists(
      select 1
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = 'notifications'
         and t.tgname = 'trg_push_on_notification'
         and not t.tgisinternal
    ) as trigger_installed;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_admins_business_pending()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin record;
begin
  -- Only the edge into PENDING. On INSERT, OLD is unassigned — referencing it
  -- raises — so TG_OP is checked rather than coalescing the two records.
  if new.status is distinct from 'PENDING' then return new; end if;
  if TG_OP = 'UPDATE' and old.status is not distinct from 'PENDING' then return new; end if;

  for v_admin in
    select id from public.users where 'admin' = any(roles)
  loop
    insert into public.notifications (user_id, type, title, body, deep_link, entity_type, entity_id)
    values (
      v_admin.id,
      'ADMIN_REVIEW_QUEUE',
      'Business awaiting review',
      coalesce(new.name, 'A business') ||
        coalesce(' · ' || nullif(new.city, ''), '') ||
        ' is waiting for approval.',
      '/admin',
      'BUSINESS',
      new.id
    );
  end loop;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.notify_agreement_confirm(p_agreement_id text, p_recipient_user_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_requester text;
  v_responder text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select requester_user_id, responder_user_id
  into v_requester, v_responder
  from public.agreements where id = p_agreement_id;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;

  if v_uid not in (v_requester, v_responder) then raise exception 'NOT_A_PARTY'; end if;
  if p_recipient_user_id not in (v_requester, v_responder)
     or p_recipient_user_id = v_uid then
    raise exception 'RECIPIENT_MUST_BE_OTHER_PARTY';
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (p_recipient_user_id, 'AGREEMENT', 'Confirm within 10 minutes',
    'The other side confirmed — confirm now or this agreement will auto-cancel.',
    '/agreement/' || p_agreement_id);
end
$function$
;

CREATE OR REPLACE FUNCTION public.notify_ended_polls()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_post   record;
  v_count  integer := 0;
begin
  for v_post in
    select id, title, author_user_id
      from public.community_posts
     where type = 'POLL'
       and poll_ends_at is not null
       and poll_ends_at <= now()
       and poll_ended_notified_at is null
     limit 200
  loop
    -- Everyone who voted, plus the author (who wants the result most).
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    select
      u.uid,
      'COMMUNITY_POLL_ENDED',
      'Poll results are in',
      'Voting closed on "' || left(v_post.title, 50) || '"',
      '/community/' || v_post.id,
      jsonb_build_object('tone', 'info', 'statusPill', 'Closed')
    from (
      select user_id as uid from public.poll_votes where post_id = v_post.id
      union
      select v_post.author_user_id as uid
    ) u
    where u.uid is not null;

    update public.community_posts
       set poll_ended_notified_at = now()
     where id = v_post.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end
$function$
;

CREATE OR REPLACE FUNCTION public.notify_on_agreement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'ACTIVE' and (old.status is null or old.status <> 'ACTIVE') then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      new.requester_user_id,
      'AGREEMENT',
      'Agreement confirmed',
      '"' || coalesce(new.request_title, 'Your agreement') || '" is now active.',
      '/agreement/' || new.id,
      jsonb_build_object('amount', new.agreed_price, 'amountLabel', 'Deal value', 'statusPill', 'Active', 'tone', 'success')
    );
    if new.responder_user_id <> new.requester_user_id then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        new.responder_user_id,
        'AGREEMENT',
        'Agreement confirmed',
        '"' || coalesce(new.request_title, 'The agreement') || '" is active — good luck!',
        '/agreement/' || new.id,
        jsonb_build_object('amount', new.agreed_price, 'amountLabel', 'Deal value', 'statusPill', 'Active', 'tone', 'success')
      );
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_appointment_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_link text;
begin
  v_link := case when new.target_type = 'PROVIDER'
                 then '/provider/' || new.target_id || '/manage/jobs'
                 else '/business/' || new.target_id || '/manage/appointments' end;

  if new.rescheduled_from is not null then
    if new.target_owner_user_id is not null then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        new.target_owner_user_id, 'APPOINTMENT', 'Booking rescheduled',
        coalesce(new.customer_name, 'A customer') || ' moved their booking to ' || coalesce(new.time_label, 'a new slot')
          || coalesce(' — ' || new.package_name, ''),
        v_link,
        jsonb_build_object('avatarUrl', new.customer_avatar, 'actorName', new.customer_name, 'amount', new.package_price, 'amountLabel', 'Package', 'statusPill', 'Rescheduled', 'tone', 'brand')
      );
    end if;
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      new.customer_user_id, 'APPOINTMENT', 'Reschedule submitted',
      'Your new request for ' || coalesce(new.time_label, 'a slot') || ' with ' || coalesce(new.target_name, 'the shop')
        || ' is pending confirmation.',
      '/appointments',
      jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Pending', 'tone', 'warning')
    );
  elsif new.target_owner_user_id is not null then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      new.target_owner_user_id, 'APPOINTMENT', 'New booking request',
      coalesce(new.customer_name, 'A customer') || ' requested ' || coalesce(new.time_label, 'a slot')
        || coalesce(' — ' || new.package_name, ''),
      v_link,
      jsonb_build_object('avatarUrl', new.customer_avatar, 'actorName', new.customer_name, 'amount', new.package_price, 'amountLabel', 'Package', 'statusPill', 'New', 'tone', 'brand')
    );
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_appointment_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status is distinct from old.status then
    if new.status = 'ACCEPTED' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Booking confirmed ✓',
              coalesce(new.target_name, 'The shop') || ' confirmed your ' || coalesce(new.time_label, 'appointment')
                -- Delivery bookings carry the ETA the owner promised at accept
                -- time, so the customer gets one message with everything in it.
                || case when new.fulfillment_type = 'DELIVERY' and nullif(trim(coalesce(new.delivery_eta_text, '')), '') is not null
                        then ' — arriving in ' || new.delivery_eta_text
                        else '' end
                || '.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Confirmed', 'tone', 'success'));
    elsif new.status = 'REJECTED' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Booking declined',
              coalesce(new.target_name, 'The shop') || ' couldn''t take your ' || coalesce(new.time_label, 'booking') || '. Try another slot.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Declined', 'tone', 'danger'));
    elsif new.status = 'NO_SHOW' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Marked as no-show',
              coalesce(new.target_name, 'The shop') || ' marked you as a no-show for your ' || coalesce(new.time_label, 'appointment') || '.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'No-show', 'tone', 'warning'));
    elsif new.status = 'CANCELLED' and new.cancelled_by = 'SYSTEM' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Booking auto-cancelled',
              coalesce(new.target_name, 'The shop') || ' didn''t respond in time, so your ' || coalesce(new.time_label, 'appointment') || ' was auto-cancelled.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Cancelled', 'tone', 'danger'));
    elsif new.status = 'CANCELLED' and coalesce(new.cancelled_by, '') <> 'CUSTOMER' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Booking cancelled',
              coalesce(new.target_name, 'The shop') || ' cancelled your ' || coalesce(new.time_label, 'appointment') || '.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Cancelled', 'tone', 'danger'));
    elsif new.status = 'CANCELLED' and new.cancelled_by = 'CUSTOMER' and new.target_owner_user_id is not null then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.target_owner_user_id, 'APPOINTMENT', 'Booking cancelled by customer',
              coalesce(new.customer_name, 'A customer') || ' cancelled their ' || coalesce(new.time_label, 'appointment') || '.',
              case when new.target_type = 'PROVIDER'
                   then '/provider/' || new.target_id || '/manage/jobs'
                   else '/business/' || new.target_id || '/manage/appointments' end,
              jsonb_build_object('avatarUrl', new.customer_avatar, 'actorName', new.customer_name, 'statusPill', 'Cancelled', 'tone', 'neutral'));
    end if;
  end if;

  if new.payment_status is distinct from old.payment_status then
    if new.payment_status = 'PAID' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Payment confirmed ✓',
              coalesce(new.target_name, 'The shop') || ' confirmed your payment.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'amount', new.payment_amount, 'amountLabel', 'Paid', 'statusPill', 'Paid', 'tone', 'success'));
    elsif new.payment_status = 'PENDING_CONFIRM' and new.target_owner_user_id is not null then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.target_owner_user_id, 'APPOINTMENT', 'Payment claim to verify',
              coalesce(new.customer_name, 'A customer') || ' says they paid'
                || coalesce(' ₹' || new.payment_amount::text, '') || ' — confirm or reject in your console.',
              case when new.target_type = 'PROVIDER'
                   then '/provider/' || new.target_id || '/manage/jobs'
                   else '/business/' || new.target_id || '/manage/appointments' end,
              jsonb_build_object('avatarUrl', new.customer_avatar, 'actorName', new.customer_name, 'amount', new.payment_amount, 'amountLabel', 'Claimed', 'statusPill', 'Verify', 'tone', 'warning'));
    elsif new.payment_status = 'REJECTED' then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (new.customer_user_id, 'APPOINTMENT', 'Payment not verified',
              coalesce(new.target_name, 'The shop') || ' couldn''t verify your payment. Please retry.', '/appointments',
              jsonb_build_object('avatarUrl', new.target_avatar, 'actorName', new.target_name, 'statusPill', 'Rejected', 'tone', 'danger'));
    end if;
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_chat_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_conv public.conversations%rowtype;
  v_recipient text;
  v_sender_name text;
begin
  select * into v_conv from public.conversations where id = NEW.conversation_id;
  if not found then return NEW; end if;

  v_recipient := case when v_conv.participant_a = NEW.sender_id then v_conv.participant_b else v_conv.participant_a end;
  if v_recipient is null then return NEW; end if;

  -- Do not notify if blocked between either party
  if public._user_blocks_exists(NEW.sender_id, v_recipient) then return NEW; end if;

  select coalesce(name, alias, 'Someone') into v_sender_name from public.users where id = NEW.sender_id;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      v_recipient,
      'CHAT',
      coalesce(v_sender_name, 'New message'),
      case when NEW.image_url is not null and (NEW.body is null or NEW.body = '') then '📷 Sent a photo' else substring(NEW.body from 1 for 100) end,
      '/chat/' || NEW.conversation_id
    );
  exception when others then null; end;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_on_comment_mention()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_post_title text;
begin
  if coalesce(jsonb_array_length(coalesce(new.mentions, '[]'::jsonb)), 0) = 0 then
    return new;
  end if;

  select title into v_post_title from public.community_posts where id = new.post_id;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  select
    m ->> 'userId',
    'COMMUNITY_MENTION',
    coalesce(new.author_name, 'Someone') || ' mentioned you',
    'In a comment on "' || left(coalesce(v_post_title, 'a post'), 50) || '": "' || left(new.body, 60) || '"',
    '/community/' || new.post_id,
    jsonb_build_object('actorName', new.author_name, 'avatarUrl', new.author_avatar, 'tone', 'brand')
  from jsonb_array_elements(new.mentions) m
  where nullif(m ->> 'userId', '') is not null
    -- Mentioning yourself is filtered client-side too; belt and braces.
    and m ->> 'userId' <> coalesce(new.author_user_id, '')
    -- A block in either direction means no notification, matching the comment
    -- gate: an @mention must not become a way to reach someone who blocked you.
    -- Calls the internal pair-checker (20260892) directly: neither side here
    -- is necessarily auth.uid() (this trigger can fire for a comment inserted
    -- by any source), so the caller-bound is_blocked_between(text) wrapper
    -- doesn't apply.
    and not public._user_blocks_exists(m ->> 'userId', coalesce(new.author_user_id, ''));
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.notify_on_comment_reaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_comment public.post_comments%rowtype;
begin
  select * into v_comment from public.post_comments where id = new.comment_id;
  if not found or v_comment.author_user_id is null then return new; end if;
  -- Reacting to your own comment is not news.
  if v_comment.author_user_id = new.user_id then return new; end if;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    v_comment.author_user_id,
    'COMMUNITY_COMMENT_REACTION',
    new.emoji || ' on your comment',
    'Someone reacted ' || new.emoji || ' to: "' || left(v_comment.body, 60) || '"',
    '/community/' || v_comment.post_id,
    jsonb_build_object('tone', 'brand')
  );
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_nearby_alert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- Guardrails. Chosen to be useful for a real street and useless for spam:
  -- 2 alerts/hour is more than any genuine emergency needs, and 500 recipients
  -- covers a dense neighbourhood without becoming a broadcast platform.
  ALERT_FANOUT_CAP  constant integer  := 500;
  ALERT_RATE_LIMIT  constant integer  := 2;
  ALERT_RATE_WINDOW constant interval := interval '1 hour';

  v_radius_km double precision := 5;
  v_lat_delta double precision;
  v_recent    integer;
begin
  if new.type <> 'ALERT' or new.geom is null or new.author_user_id is null then
    return new;
  end if;

  -- Serialize concurrent alert inserts from the SAME author for the rest of
  -- this transaction. Without this, two ALERT posts submitted in parallel can
  -- both read the count below before either commits, so both slip in under
  -- ALERT_RATE_LIMIT — the classic check-then-act race.
  perform pg_advisory_xact_lock(hashtextextended('alert_rate:' || new.author_user_id, 0));

  -- Rate limit: count this author's recent alerts (excluding this one).
  select count(*) into v_recent
    from public.community_posts
   where author_user_id = new.author_user_id
     and type = 'ALERT'
     and id <> new.id
     and created_at > now() - ALERT_RATE_WINDOW;
  if v_recent >= ALERT_RATE_LIMIT then
    -- The post itself still stands; only the broadcast is withheld. Silently,
    -- because telling an abuser exactly where the limit is helps them tune.
    return new;
  end if;

  -- Radius: capped by the author's own reach for seller-authored alerts, the
  -- same rule community_posts_feed applies (20260894/20260866).
  if new.author_type = 'business' then
    select least(v_radius_km, greatest(coalesce(nullif(b.broadcast_radius, 0), 5), 0))
      into v_radius_km from public.businesses b where b.id = new.author_ref_id;
  elsif new.author_type = 'provider' then
    select least(v_radius_km, greatest(coalesce(nullif(p.service_radius_km, 0), 5), 0))
      into v_radius_km from public.providers p where p.id = new.author_ref_id;
  end if;

  -- Cheap bounding-box pre-filter before the per-row ST_DWithin below. `users`
  -- has no spatial index anywhere in this schema (nothing does — geography is
  -- built on the fly from lat/lng), so without this every ALERT post computes
  -- ST_SetSRID/ST_MakePoint/ST_DWithin for the WHOLE users table. A plain
  -- numeric BETWEEN first narrows that to a cheap comparison — same technique
  -- as notify_on_request (20260706) / 20260721 / 20260836 / 20260840.
  -- ~111km per degree of latitude; not corrected for longitude shrinking at
  -- higher latitudes, matching those.
  v_lat_delta := coalesce(v_radius_km, 5) / 111.0;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  select
    u.id,
    'NEARBY_ALERT',
    case coalesce(new.severity, 'INFO')
      when 'URGENT'  then '🚨 Urgent nearby'
      when 'WARNING' then '⚠️ Heads up nearby'
      else 'ℹ️ Notice nearby'
    end,
    left(new.title, 90),
    '/community/' || new.id,
    jsonb_build_object(
      'actorName', new.author_name,
      'avatarUrl', new.author_avatar,
      'tone', case coalesce(new.severity, 'INFO')
                when 'URGENT' then 'danger'
                when 'WARNING' then 'warning'
                else 'info' end,
      'statusPill', coalesce(new.severity, 'INFO')
    )
  from public.users u
  where u.id <> new.author_user_id
    and u.notif_nearby_alerts
    and u.lat is not null
    and u.lng is not null
    and u.lat between new.lat - v_lat_delta and new.lat + v_lat_delta
    and u.lng between new.lng - v_lat_delta and new.lng + v_lat_delta
    and ST_DWithin(
      ST_SetSRID(ST_MakePoint(u.lng, u.lat), 4326)::geography,
      new.geom,
      coalesce(v_radius_km, 5) * 1000
    )
    -- No alert reaches someone who has blocked the author, or vice versa.
    -- Calls the internal pair-checker (20260892) directly: u.id is a
    -- candidate recipient being enumerated by this query, not the calling
    -- session, so the caller-bound is_blocked_between(text) wrapper doesn't
    -- apply here either.
    and not public._user_blocks_exists(u.id, new.author_user_id)
  -- Nearest first, so if the cap bites it keeps the people the alert is most
  -- relevant to rather than an arbitrary slice.
  order by ST_Distance(ST_SetSRID(ST_MakePoint(u.lng, u.lat), 4326)::geography, new.geom)
  limit ALERT_FANOUT_CAP;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.notify_on_post_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  post_owner text;
  post_title text;
  v_parent_author text;
begin
  select author_user_id, title into post_owner, post_title
    from public.community_posts where id = new.post_id;

  if new.parent_id is not null then
    select author_user_id into v_parent_author
      from public.post_comments where id = new.parent_id;
  end if;

  -- 1) The person being replied to.
  if v_parent_author is not null and v_parent_author <> new.author_user_id then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      v_parent_author,
      'COMMUNITY_REPLY',
      'New reply to your comment',
      coalesce(new.author_name, 'Someone') || ' replied: "' || left(new.body, 60) || '"',
      '/community/' || new.post_id,
      jsonb_build_object('avatarUrl', new.author_avatar, 'actorName', new.author_name, 'tone', 'brand')
    );
  end if;

  -- 2) The post's author — unless they wrote this comment, or they already got
  --    the reply notification above as the parent commenter.
  if post_owner is not null
     and post_owner <> new.author_user_id
     and post_owner is distinct from v_parent_author then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      post_owner,
      'COMMUNITY_COMMENT',
      'New comment on your post',
      coalesce(new.author_name, 'Someone') || ' commented: "' || left(new.body, 60) || '"',
      '/community/' || new.post_id,
      jsonb_build_object('avatarUrl', new.author_avatar, 'actorName', new.author_name, 'tone', 'brand')
    );
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_post_like()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_post   public.community_posts%rowtype;
  v_actor  text;
  v_avatar text;
begin
  select * into v_post from public.community_posts where id = new.post_id;
  if not found or v_post.author_user_id is null or v_post.author_user_id = new.user_id then
    return new;
  end if;

  -- An author who hid their like count doesn't want the tally; they still want
  -- to know people are responding, so this is intentionally NOT suppressed.
  select coalesce(nullif(alias, ''), 'A neighbour'), avatar
    into v_actor, v_avatar
    from public.users where id = new.user_id;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    v_post.author_user_id,
    'COMMUNITY_LIKE',
    'Someone liked your post',
    coalesce(v_actor, 'A neighbour') || ' liked "' || left(v_post.title, 50) || '"',
    '/community/' || new.post_id,
    jsonb_build_object('actorName', v_actor, 'avatarUrl', v_avatar, 'tone', 'brand')
  );
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.notify_on_post_recommendation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old_len int := coalesce(jsonb_array_length(coalesce(old.recommendations, '[]'::jsonb)), 0);
  v_new_len int := coalesce(jsonb_array_length(coalesce(new.recommendations, '[]'::jsonb)), 0);
  v_latest  jsonb;
  v_by      text;
begin
  if v_new_len <= v_old_len or new.author_user_id is null then
    return new;
  end if;

  v_latest := new.recommendations -> (v_new_len - 1);
  v_by := coalesce(v_latest ->> 'byName', 'A neighbour');

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    new.author_user_id,
    'COMMUNITY_RECOMMENDATION',
    'You got a recommendation',
    v_by || ' suggested a place on "' || left(new.title, 50) || '"',
    '/community/' || new.id,
    jsonb_build_object('actorName', v_by, 'tone', 'success')
  );
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.notify_on_post_resolved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_title text := left(new.title, 50);
begin
  if coalesce(new.resolved, false) = coalesce(old.resolved, false) or not coalesce(new.resolved, false) then
    return new;
  end if;

  -- Everyone who commented or liked, minus the author. A union of both, so a
  -- neighbour who did both gets one notification rather than two.
  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  select
    u.uid,
    'COMMUNITY_RESOLVED',
    case when new.type = 'LOST_FOUND' then 'Good news — it was found' else 'That alert is over' end,
    '"' || v_title || '" was marked resolved',
    '/community/' || new.id,
    jsonb_build_object('tone', 'success', 'statusPill', 'Resolved')
  from (
    select author_user_id as uid from public.post_comments where post_id = new.id
    union
    select user_id as uid from public.post_likes where post_id = new.id
  ) u
  where u.uid is not null
    and u.uid <> coalesce(new.author_user_id, '');
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.notify_on_proposal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  req_owner text;
  req_title text;
begin
  select requester_user_id, title
    into req_owner, req_title
    from public.requests
   where id = new.request_id;

  if req_owner is null or req_owner = new.responder_user_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    req_owner,
    'PROPOSAL',
    coalesce(new.responder_name, 'Someone') || ' sent a quote',
    'On "' || coalesce(req_title, 'your request') || '"' || coalesce(' — ₹' || new.price::text, ''),
    '/request/' || new.request_id,
    jsonb_build_object(
      'avatarUrl', new.responder_avatar,
      'actorName', new.responder_name,
      'amount', new.price,
      'amountLabel', 'Quoted',
      'tone', 'brand'
    )
  );
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_proposal_broadcast()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  req_owner text;
  req_title text;
begin
  select requester_user_id, title
    into req_owner, req_title
    from public.requests
   where id = new.request_id;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  select mt.user_id,
         'QUOTE_BROADCAST',
         coalesce(new.responder_name, 'A provider') || ' sent a group quote',
         'On "' || coalesce(req_title, 'a request you joined') || '"' || coalesce(' — ₹' || new.price::text, ''),
         '/request/' || new.request_id,
         jsonb_build_object(
           'avatarUrl', new.responder_avatar,
           'actorName', new.responder_name,
           'amount', new.price,
           'amountLabel', 'Quoted',
           'tone', 'brand'
         )
    from public.request_me_toos mt
   where mt.request_id = new.request_id
     and mt.user_id <> coalesce(req_owner, '')
     and mt.user_id <> new.responder_user_id;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_qna_answered()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_biz_name text;
begin
  if new.answer is not null and old.answer is null then
    select name into v_biz_name from public.businesses where id = new.business_id;
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (new.asker_user_id, 'QNA', 'Your question was answered',
        coalesce(v_biz_name, 'The business') || ' replied: "' || left(new.answer, 120) || '"',
        '/business/' || new.business_id);
    exception when others then null;
    end;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_qna_asked()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner text;
begin
  select owner_user_id into v_owner from public.businesses where id = new.business_id;
  if v_owner is not null and v_owner <> new.asker_user_id then
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_owner, 'QNA', 'New question',
        '"' || left(new.question, 120) || '"',
        '/business/' || new.business_id || '/manage/community');
    exception when others then null;
    end;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_queue_called()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare v_shop text; v_avatar text;
begin
  if new.status = 'CALLED' and old.status is distinct from 'CALLED' and new.customer_user_id is not null then
    select name, cover_image into v_shop, v_avatar from public.businesses where id = new.business_id;
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (new.customer_user_id, 'QUEUE_UPDATE', 'It''s your turn! 🔔',
            'Head in now — ' || coalesce(v_shop, 'the shop') || ' is ready for you.', '/queues',
            jsonb_build_object('avatarUrl', v_avatar, 'actorName', v_shop, 'statusPill', 'Called', 'tone', 'success'));
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_queue_payment_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_biz record;
begin
  if new.payment_status is distinct from old.payment_status then
    select name, owner_user_id into v_biz from public.businesses where id = new.business_id;

    if new.payment_status = 'PENDING_CONFIRM' and v_biz.owner_user_id is not null then
      begin
        insert into public.notifications (user_id, type, title, body, deep_link)
        values (v_biz.owner_user_id, 'QUEUE_UPDATE', 'Payment claim to verify',
          coalesce(new.customer_name, 'A customer') || ' says they paid'
            || coalesce(' ₹' || new.payment_amount::text, '') || ' — confirm or reject in your queue console.',
          '/business/' || new.business_id || '/manage/queue');
      exception when others then null;
      end;
    elsif new.payment_status = 'PAID' and new.customer_user_id is not null then
      begin
        insert into public.notifications (user_id, type, title, body, deep_link)
        values (new.customer_user_id, 'QUEUE_UPDATE', 'Payment confirmed ✓',
          coalesce(v_biz.name, 'The shop') || ' confirmed your payment.', '/queues');
      exception when others then null;
      end;
    elsif new.payment_status = 'REJECTED' and new.customer_user_id is not null then
      begin
        insert into public.notifications (user_id, type, title, body, deep_link)
        values (new.customer_user_id, 'QUEUE_UPDATE', 'Payment not verified',
          coalesce(v_biz.name, 'The shop') || ' couldn''t verify your payment. Please retry.', '/queues');
      exception when others then null;
      end;
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_rating()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_target_user text;
  v_deep_link text;
  v_name text;
begin
  if new.rater_user_id is null then
    return new;
  end if;

  select name into v_name from public.users where id = new.rater_user_id;

  if new.ratee_type = 'BUSINESS' then
    select owner_user_id into v_target_user from public.businesses where id = new.ratee_id;
    v_deep_link := '/business/' || new.ratee_id || '/manage/reviews';
  elsif new.ratee_type = 'PROVIDER' then
    select user_id into v_target_user from public.providers where id = new.ratee_id;
    v_deep_link := '/provider/' || new.ratee_id || '/manage/reviews';
  elsif new.ratee_type = 'USER' then
    v_target_user := new.ratee_id;
    v_deep_link := coalesce('/agreement/' || new.agreement_id, '/u/' || new.ratee_id);
  end if;

  if v_target_user is not null and v_target_user != new.rater_user_id then
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (
        v_target_user,
        'RATING',
        'New customer review',
        coalesce(v_name, 'A customer') || ' gave ' ||
          case when new.rating >= 4 then '⭐ ' else '' end || new.rating || '/5' ||
          case when new.comment is not null and length(trim(new.comment)) > 0
               then ' — "' || left(new.comment, 80) || '"' else '' end,
        v_deep_link
      );
    exception when others then null;
    end;
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_report_resolved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  deep_link text;
begin
  if new.status not in ('DISMISSED', 'ACTION_TAKEN') then
    return new;
  end if;
  if old.status = new.status then
    return new;
  end if;
  if new.reporter_user_id is null then
    return new;
  end if;

  deep_link := case new.target_type
    when 'POST' then '/community/' || new.target_id
    when 'BUSINESS' then '/business/' || new.target_id
    when 'PROVIDER' then '/provider/' || new.target_id
    when 'REQUEST' then '/request/' || new.target_id
    else null
  end;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    new.reporter_user_id,
    'REPORT_RESOLVED',
    'Your report was reviewed',
    'Your report on "' || coalesce(new.target_name, 'a listing') || '" has been reviewed by our team.',
    deep_link,
    jsonb_build_object(
      'statusPill', case new.status when 'ACTION_TAKEN' then 'Action taken' else 'Reviewed' end,
      'tone', case new.status when 'ACTION_TAKEN' then 'success' else 'neutral' end
    )
  );
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  delta double precision;
  v_meta jsonb;
begin
  if new.lat is null or new.lng is null then
    return new;
  end if;
  delta := coalesce(new.radius_km, 5) / 111.0;

  v_meta := jsonb_build_object(
    'category', new.category_name,
    'imageUrl', new.photos[1],
    'amount', new.budget_max,
    'amountLabel', case when new.budget_min is not null and new.budget_max is not null
                        and new.budget_min <> new.budget_max
                     then '₹' || new.budget_min::text || '–' || new.budget_max::text
                     else 'Budget' end,
    'statusPill', case when coalesce(new.is_urgent, false) then 'Urgent' else null end,
    'tone', case when coalesce(new.is_urgent, false) then 'warning' else 'info' end
  );

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  select u.id, 'NEARBY_REQUEST',
         'New request near you',
         coalesce(new.category_name, 'Someone') || ' needs help: "' || left(coalesce(new.title, new.description, 'a request'), 60) || '"',
         '/request/' || new.id,
         v_meta
    from public.users u
   where u.id <> new.requester_user_id
     and u.lat is not null and u.lng is not null
     and u.lat between new.lat - delta and new.lat + delta
     and u.lng between new.lng - delta and new.lng + delta
   limit 200;

  if new.category_id is not null then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    select b.owner_user_id, 'NEARBY_REQUEST',
           'New ' || coalesce(new.category_name, 'request') || ' request',
           left(coalesce(new.title, new.description, 'A customer nearby needs help'), 80),
           '/business/' || b.id || '/manage/requests',
           v_meta
      from public.businesses b
     where b.category_id = new.category_id
       and b.status = 'ACTIVE'
       and coalesce(b.owner_user_id, '') <> new.requester_user_id
       and b.lat is not null and b.lng is not null
       and b.lat between new.lat - delta and new.lat + delta
       and b.lng between new.lng - delta and new.lng + delta
     limit 200;

    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    select p.user_id, 'NEARBY_REQUEST',
           'New ' || coalesce(new.category_name, 'request') || ' request',
           left(coalesce(new.title, new.description, 'A customer nearby needs help'), 80),
           '/provider/' || p.id || '/manage/find-work',
           v_meta
      from public.providers p
     where p.category_id = new.category_id
       and p.status = 'ACTIVE'
       and coalesce(p.user_id, '') <> new.requester_user_id
       and p.lat is not null and p.lng is not null
       and p.lat between new.lat - delta and new.lat + delta
       and p.lng between new.lng - delta and new.lng + delta
     limit 200;
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_on_story_reaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  story_owner text;
  story_image text;
begin
  if new.reaction is null then
    return new;
  end if;
  if TG_OP = 'UPDATE' and old.reaction is not distinct from new.reaction then
    return new;
  end if;

  select user_id, image_url into story_owner, story_image
    from public.stories where id = new.story_id;

  if story_owner is null or story_owner = new.viewer_user_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    story_owner,
    'STORY_REACTION',
    'Someone reacted to your story',
    new.reaction || ' reacted to your story',
    null,
    jsonb_build_object('imageUrl', story_image, 'emoji', new.reaction, 'tone', 'brand')
  );
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_saved_search_matches_business()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s record;
begin
  if new.status is distinct from 'ACTIVE' then
    return new;
  end if;

  for s in
    select * from public.saved_searches
    where new.name ilike '%' || query || '%'
       or coalesce(new.sub_category, '') ilike '%' || query || '%'
       or coalesce(new.category_name, '') ilike '%' || query || '%'
  loop
    if s.lat is not null and s.lng is not null and new.lat is not null and new.lng is not null
       and public.haversine_km(s.lat, s.lng, new.lat, new.lng) > s.radius_km then
      continue;
    end if;

    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      s.user_id,
      'SAVED_SEARCH_MATCH',
      'New match for "' || s.query || '"',
      new.name || ' just joined nearby',
      '/business/' || new.id,
      jsonb_build_object('imageUrl', new.cover_image, 'actorName', new.name, 'category', new.category_name, 'tone', 'brand')
    );
  end loop;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_saved_search_matches_provider()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s record;
begin
  if new.status is distinct from 'ACTIVE' then
    return new;
  end if;

  for s in
    select * from public.saved_searches
    where new.display_name ilike '%' || query || '%'
       or coalesce(new.sub_category, '') ilike '%' || query || '%'
       or coalesce(new.category_name, '') ilike '%' || query || '%'
  loop
    if s.lat is not null and s.lng is not null and new.lat is not null and new.lng is not null
       and public.haversine_km(s.lat, s.lng, new.lat, new.lng) > s.radius_km then
      continue;
    end if;

    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      s.user_id,
      'SAVED_SEARCH_MATCH',
      'New match for "' || s.query || '"',
      new.display_name || ' just joined nearby',
      '/provider/' || new.id,
      jsonb_build_object('avatarUrl', new.avatar, 'actorName', new.display_name, 'category', new.category_name, 'tone', 'brand')
    );
  end loop;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_verification_decision_business()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.is_verified = true and old.is_verified is distinct from true then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (new.owner_user_id, 'VERIFICATION_DECIDED', 'You are verified!', new.name || ' is now a verified business.', '/business/' || new.id || '/manage/verify',
            jsonb_build_object('avatarUrl', new.cover_image, 'actorName', new.name, 'statusPill', 'Verified', 'tone', 'success'));
  elsif new.verification_status = 'REJECTED' and old.verification_status is distinct from 'REJECTED' then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      new.owner_user_id, 'VERIFICATION_DECIDED', 'Verification needs another look',
      case when new.verification_reason is not null and new.verification_reason <> ''
        then 'Reason: ' || new.verification_reason || ' — resubmit from Settings.'
        else 'Your documents for ' || new.name || ' were not approved — resubmit from Settings.'
      end,
      '/business/' || new.id || '/manage/verify',
      jsonb_build_object('avatarUrl', new.cover_image, 'actorName', new.name, 'reason', new.verification_reason, 'statusPill', 'Needs changes', 'tone', 'danger')
    );
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_verification_decision_provider()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.is_verified = true and old.is_verified is distinct from true then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (new.user_id, 'VERIFICATION_DECIDED', 'You are verified!', new.display_name || ' is now a verified provider.', '/provider/' || new.id || '/manage/verify',
            jsonb_build_object('avatarUrl', new.avatar, 'actorName', new.display_name, 'statusPill', 'Verified', 'tone', 'success'));
  elsif new.verification_status = 'REJECTED' and old.verification_status is distinct from 'REJECTED' then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      new.user_id, 'VERIFICATION_DECIDED', 'Verification needs another look',
      case when new.verification_reason is not null and new.verification_reason <> ''
        then 'Reason: ' || new.verification_reason || ' — resubmit from Settings.'
        else 'Your documents for ' || new.display_name || ' were not approved — resubmit from Settings.'
      end,
      '/provider/' || new.id || '/manage/verify',
      jsonb_build_object('avatarUrl', new.avatar, 'actorName', new.display_name, 'reason', new.verification_reason, 'statusPill', 'Needs changes', 'tone', 'danger')
    );
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.on_queue_token_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner text;
begin
  if (new.status in ('CALLED', 'SERVED') and new.status is distinct from old.status)
     or (new.arrived_at is not null and old.arrived_at is null) then
    update public.queue_settings set last_activity_at = now() where business_id = new.business_id;
  end if;

  if new.status = 'LEFT' and old.status in ('CALLED', 'SERVED') then
    begin
      select b.owner_user_id into v_owner from public.businesses b where b.id = new.business_id;
      if v_owner is not null then
        insert into public.notifications (user_id, type, title, body, deep_link, metadata)
        values (v_owner, 'QUEUE_UPDATE', 'Customer left the queue',
                coalesce(new.customer_name, 'A customer') || ' left before paying.',
                '/business/' || new.business_id || '/manage/queue',
                jsonb_build_object('actorName', new.customer_name, 'statusPill', 'Left', 'tone', 'neutral'));
      end if;
    exception when others then null;
    end;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.proposal_submit_counter(p_proposal_id text, p_amount numeric, p_message text DEFAULT NULL::text)
 RETURNS proposal_counters
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_proposal public.proposals%rowtype;
  v_request public.requests%rowtype;
  v_counter public.proposal_counters%rowtype;
  v_other text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) then
    raise exception 'INVALID_AMOUNT';
  end if;

  select * into v_proposal from public.proposals
  where id = p_proposal_id for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  select * into v_request from public.requests
  where id = v_proposal.request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  if v_uid not in (v_request.requester_user_id, v_proposal.responder_user_id)
     and not (v_proposal.responder_type = 'business' and public.has_business_scope(v_proposal.responder_entity_id, v_uid, 'leads'))
     and not (v_proposal.responder_type = 'provider' and exists(select 1 from public.providers p where p.id = v_proposal.responder_entity_id and p.user_id = v_uid))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_A_PARTY';
  end if;

  if v_request.status <> 'OPEN' or v_proposal.status <> 'SUBMITTED' then
    raise exception 'NEGOTIATION_CLOSED';
  end if;

  insert into public.proposal_counters (proposal_id, by_user_id, amount, message)
  values (p_proposal_id, v_uid, p_amount, left(coalesce(p_message, ''), 1000))
  returning * into v_counter;

  -- Touch proposal updated_at so standard proposals realtime subscriptions fire
  update public.proposals set updated_at = now() where id = p_proposal_id;

  v_other := case when v_uid = v_request.requester_user_id
    then v_proposal.responder_user_id else v_request.requester_user_id end;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_other, 'PROPOSAL_COUNTER', 'New counter-offer',
      '₹' || p_amount::text || ' on "' || left(coalesce(v_request.title, 'your request'), 60) || '".',
      '/request/' || v_request.id);
  exception when others then null;
  end;

  return v_counter;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_business_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.owner_user_id is distinct from old.owner_user_id then
    if not (old.owner_user_id = (auth.uid())::text or public.is_admin()) then
      raise exception 'Cannot change business owner';
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.providers_nearby(in_lng double precision, in_lat double precision, in_radius_km double precision DEFAULT 50, in_category text DEFAULT NULL::text, in_limit integer DEFAULT 20, in_offset integer DEFAULT 0, in_category_ids text[] DEFAULT NULL::text[])
 RETURNS SETOF providers
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select p.*
  from public.providers p
  where p.status = 'ACTIVE'
    and p.owner_enabled = true
    and p.deleted_at is null
    and p.geom is not null
    and (in_category is null or p.category_id = in_category)
    and (in_category_ids is null or p.category_id = any(in_category_ids))
    and ST_DWithin(
      p.geom,
      ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography,
      in_radius_km * 1000
    )
  order by ST_Distance(p.geom, ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography) asc
  limit in_limit offset in_offset;
$function$
;

CREATE OR REPLACE FUNCTION public.push_on_notification_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'functions_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';

  if v_url is null or v_url = '' or v_key is null or v_key = '' then
    return new;
  end if;

  perform net.http_post(
    url     := v_url || '/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- apikey ONLY. Do not re-add Authorization: the secret key is not a JWT.
      'apikey',       v_key
    ),
    body    := jsonb_build_object(
      'userId',   new.user_id,
      'title',    new.title,
      'body',     new.body,
      'deepLink', coalesce(new.deep_link, '/'),
      'type',     new.type,
      'imageUrl', coalesce(new.metadata->>'imageUrl', new.metadata->>'avatarUrl')
    )
  );

  return new;
exception
  when others then
    return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.qna_to_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.leads (business_id, from_user_id, kind, note)
  values (new.business_id, new.asker_user_id, 'QUESTION', left(new.question, 120))
  on conflict do nothing;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.queue_token_create_walk_in(p_business_id text, p_customer_name text, p_party_size text DEFAULT '1 person'::text)
 RETURNS queue_tokens
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_token public.queue_tokens%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if nullif(trim(coalesce(p_customer_name, '')), '') is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if not public.has_business_scope(p_business_id, v_uid, 'queue') then raise exception 'NOT_TARGET_MANAGER'; end if;

  insert into public.queue_tokens (business_id, customer_user_id, customer_name, party_size, status, payment_status)
  values (p_business_id, null, left(trim(p_customer_name), 200), coalesce(nullif(trim(p_party_size), ''), '1 person'), 'WAITING', 'UNPAID')
  returning * into v_token;

  return v_token;
end
$function$
;

CREATE OR REPLACE FUNCTION public.queue_waiting_line(p_business_ids text[])
 RETURNS TABLE(business_id text, line_position integer, party_size text, my_token_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select t.business_id,
         (row_number() over (partition by t.business_id order by t.created_at, t.id))::integer,
         t.party_size,
         case when t.customer_user_id = (select auth.uid())::text then t.id end
    from public.queue_tokens t
   where t.status = 'WAITING'
     and t.business_id = any (p_business_ids)
     -- Bounded so one call can't sweep every queue; a customer is in a handful
     -- of queues at most and the business page asks for exactly one.
     and cardinality(p_business_ids) between 1 and 50
   order by t.business_id, t.created_at, t.id;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_rating_aggregates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type text := coalesce(new.ratee_type, old.ratee_type);
  v_id text := coalesce(new.ratee_id, old.ratee_id);
  v_avg numeric(3,2);
  v_count int;
begin
  select coalesce(round(avg(rating), 2), 0), count(*)
  into v_avg, v_count
  from public.ratings
  where ratee_type = v_type and ratee_id = v_id;

  if v_type = 'BUSINESS' then
    update public.businesses
    set rating_avg = v_avg, rating_count = v_count
    where id = v_id;
  elsif v_type = 'PROVIDER' then
    update public.providers
    set rating_avg = v_avg, rating_count = v_count
    where id = v_id;
  elsif v_type = 'USER' then
    update public.users
    set rating_avg = v_avg, rating_count = v_count
    where id = v_id;
  end if;

  return coalesce(new, old);
end $function$
;

CREATE OR REPLACE FUNCTION public.record_terms_acceptance(p_version text, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_version text := nullif(trim(coalesce(p_version, '')), '');
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if v_version is null then raise exception 'VERSION_REQUIRED'; end if;

  insert into public.terms_acceptances (user_id, version, user_agent)
  values (
    v_uid,
    left(v_version, 40),
    nullif(left(trim(coalesce(p_user_agent, '')), 400), '')
  );

  update public.users
     set terms_accepted_version = left(v_version, 40),
         terms_accepted_at = now()
   where id = v_uid;
end
$function$
;

CREATE OR REPLACE FUNCTION public.renew_location_share(p_requester text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then return; end if;
  update public.location_share_grants
    set expires_at = now() + interval '24 hours', updated_at = now()
  where owner_user_id = v_uid and requester_user_id = p_requester and status = 'APPROVED';
end $function$
;

CREATE OR REPLACE FUNCTION public.reply_to_rating(p_rating_id text, p_reply text)
 RETURNS ratings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_ratee_type text;
  v_ratee_id text;
  v_owner text;
  v_is_authorized boolean := false;
  v_clean_reply text := trim(coalesce(p_reply, ''));
  v_rating public.ratings%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select ratee_type, ratee_id into v_ratee_type, v_ratee_id
  from public.ratings where id = p_rating_id;
  if not found then raise exception 'RATING_NOT_FOUND'; end if;

  if v_ratee_type = 'BUSINESS' then
    select owner_user_id into v_owner from public.businesses where id = v_ratee_id;
    if v_owner = v_uid then
      v_is_authorized := true;
    else
      -- Check team permissions
      select exists (
        select 1 from public.team_members
        where business_id = v_ratee_id::uuid
          and user_id = v_uid::uuid
          and status = 'ACTIVE'
          and (role in ('owner', 'manager') or 'support' = any(scopes) or 'leads' = any(scopes))
      ) into v_is_authorized;
    end if;
  elsif v_ratee_type = 'PROVIDER' then
    select user_id into v_owner from public.providers where id = v_ratee_id;
    if v_owner = v_uid then
      v_is_authorized := true;
    end if;
  else
    raise exception 'NOT_REPLYABLE';
  end if;

  if not v_is_authorized then
    raise exception 'FORBIDDEN';
  end if;

  if length(v_clean_reply) = 0 then
    -- Clear existing reply
    update public.ratings
    set owner_reply = null, owner_reply_at = null
    where id = p_rating_id
    returning * into v_rating;
  else
    if length(v_clean_reply) < 2 then raise exception 'REPLY_TOO_SHORT'; end if;
    update public.ratings
    set owner_reply = left(v_clean_reply, 2000), owner_reply_at = now()
    where id = p_rating_id
    returning * into v_rating;
  end if;

  return v_rating;
end
$function$
;

CREATE OR REPLACE FUNCTION public.request_location_share(p_owner text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid  text := auth.uid()::text;
  v_name text;
  v_avatar text;
begin
  if v_uid is null or v_uid = p_owner then return; end if;

  insert into public.location_share_grants (owner_user_id, requester_user_id, status)
  values (p_owner, v_uid, 'PENDING')
  on conflict (owner_user_id, requester_user_id) do update
    set status = case
          when location_share_grants.status = 'APPROVED'
               and (location_share_grants.expires_at is null or location_share_grants.expires_at > now())
          then 'APPROVED'
          else 'PENDING'
        end,
        requested_at = now(),
        updated_at = now();

  select name, avatar into v_name, v_avatar from public.users where id = v_uid;
  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  values (
    p_owner, 'LOCATION_REQUEST',
    'Location request',
    coalesce(v_name, 'Someone') || ' wants to see your exact location',
    '/settings',
    jsonb_build_object('avatarUrl', v_avatar, 'actorName', v_name, 'statusPill', 'Pending', 'tone', 'warning')
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.reschedule_appointment(p_original_id text, p_scheduled_for timestamp with time zone, p_date_label text, p_time_label text, p_notes text DEFAULT NULL::text, p_photo_url text DEFAULT NULL::text, p_package_id text DEFAULT NULL::text, p_package_name text DEFAULT NULL::text, p_package_price numeric DEFAULT NULL::numeric)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_original public.appointments%rowtype;
  v_new public.appointments%rowtype;
  v_changed integer;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_scheduled_for is null or p_scheduled_for <= now() then raise exception 'INVALID_APPOINTMENT_TIME'; end if;

  select * into v_original from public.appointments
  where id = p_original_id for update;
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  -- Walk-ins are stamped with the OWNER's uid as customer_user_id — without
  -- this a walk-in could be "rescheduled" through the customer path.
  if v_original.customer_user_id is distinct from v_uid or v_original.is_walk_in then
    raise exception 'NOT_YOUR_BOOKING';
  end if;
  if v_original.status not in ('PENDING', 'ACCEPTED') then
    raise exception 'INVALID_TRANSITION';
  end if;

  -- Cancel the original first so its spots are freed before the capacity
  -- trigger evaluates the replacement (otherwise moving within an
  -- almost-full slot would contend with itself). Optimistic-concurrency
  -- check via GET DIAGNOSTICS alongside the row lock.
  update public.appointments
  set status = 'CANCELLED', cancelled_by = 'CUSTOMER',
      response_note = coalesce(response_note, 'Rescheduled')
  where id = p_original_id and status = v_original.status;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then raise exception 'INVALID_TRANSITION'; end if;

  insert into public.appointments (
    target_type, target_id, target_owner_user_id, target_name, target_avatar,
    customer_user_id, customer_name, customer_avatar,
    scheduled_for, date_label, time_label, notes, photo_url,
    package_id, package_name, package_price,
    fulfillment_type, delivery_address_line, delivery_lat, delivery_lng,
    requested_delivery_window, party_size, rescheduled_from, target_package_key
  ) values (
    v_original.target_type, v_original.target_id, v_original.target_owner_user_id,
    v_original.target_name, v_original.target_avatar,
    v_uid, v_original.customer_name, v_original.customer_avatar,
    p_scheduled_for, p_date_label, p_time_label,
    nullif(left(trim(coalesce(p_notes, '')), 2000), ''), p_photo_url,
    p_package_id, p_package_name, p_package_price,
    v_original.fulfillment_type, v_original.delivery_address_line,
    v_original.delivery_lat, v_original.delivery_lng,
    v_original.requested_delivery_window,
    -- The actual fix: a party of 3 stayed a party of 3 — this used to
    -- silently default to 1, dropping spots the customer had booked.
    coalesce(v_original.party_size, 1),
    p_original_id,
    v_original.target_package_key
  ) returning * into v_new;

  -- Same purchase moved to a new slot — copy the line items rather than
  -- re-running reserve_catalog_items, which would double-decrement stock.
  insert into public.appointment_items (appointment_id, catalog_item_id, item_name, unit_price, quantity)
  select v_new.id, catalog_item_id, item_name, unit_price, quantity
  from public.appointment_items
  where appointment_id = p_original_id;

  return v_new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.reserve_catalog_item(p_item_id text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.catalog_items
     set quantity = greatest(coalesce(quantity, 0) - 1, 0),
         stock_status = case when coalesce(quantity, 0) - 1 <= 0 then 'OUT_OF_STOCK' else stock_status end
   where id::text = p_item_id
     and inventory_type = 'FINITE'
     and coalesce(quantity, 0) > 0;
$function$
;

CREATE OR REPLACE FUNCTION public.reserve_catalog_items(p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item record;
  v_row public.catalog_items%rowtype;
begin
  if p_items is null then return; end if;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(catalog_item_id text, quantity int)
  loop
    if v_item.catalog_item_id is null or coalesce(v_item.quantity, 0) <= 0 then
      continue;
    end if;

    select * into v_row from public.catalog_items
      where id::text = v_item.catalog_item_id
      for update;

    if not found or v_row.inventory_type is distinct from 'FINITE' then
      continue;
    end if;

    if coalesce(v_row.quantity, 0) < v_item.quantity then
      raise exception 'INSUFFICIENT_STOCK: %', v_row.name;
    end if;

    update public.catalog_items
       set quantity = v_row.quantity - v_item.quantity,
           stock_status = case when v_row.quantity - v_item.quantity <= 0 then 'OUT_OF_STOCK' else stock_status end
     where id = v_row.id;
  end loop;
end
$function$
;

CREATE OR REPLACE FUNCTION public.reset_boost_reminder()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.boosted_until is distinct from old.boosted_until and new.boosted_until is not null then
    new.boost_reminder_sent := false;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.reset_entity_password_via_recovery(p_kind text, p_answer text, p_new_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_recovery_hash text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('business', 'provider') then raise exception 'Invalid kind'; end if;
  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  select case p_kind
           when 'business' then business_recovery_answer_hash
           else provider_recovery_answer_hash
         end
    into v_recovery_hash
    from public.users
   where id = v_uid;

  if v_recovery_hash is null then
    raise exception 'No recovery question is set';
  end if;

  if not public._verify_entity_recovery_answer(p_kind, v_uid, p_answer) then
    raise exception 'Recovery answer is incorrect';
  end if;

  if p_kind = 'business' then
    update public.users
       set business_password_hash = crypt(p_new_password, gen_salt('bf'))
     where id = v_uid;
  else
    update public.users
       set provider_password_hash = crypt(p_new_password, gen_salt('bf'))
     where id = v_uid;
  end if;

  delete from public.entity_password_attempts where owner_user_id = v_uid and kind = p_kind;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_admin_email(p_login_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key text := lower(trim(coalesce(p_login_id, '')));
  v_attempt public.admin_login_resolve_attempts%rowtype;
  v_email text;
  v_next_fail_count integer;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
begin
  if v_key = '' then return null; end if;
  select * into v_attempt from public.admin_login_resolve_attempts where login_id = v_key for update;
  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then return null; end if;
  select au.email into v_email from public.users u join auth.users au on au.id::text = u.id where u.admin_login_id = v_key and u.roles @> array['admin'] limit 1;
  if v_email is not null then
    delete from public.admin_login_resolve_attempts where login_id = v_key;
    return v_email;
  end if;
  v_next_fail_count := case when v_attempt.login_id is null or v_attempt.last_attempt_at <= now() - v_window or v_attempt.locked_until is not null then 1 else v_attempt.fail_count + 1 end;
  insert into public.admin_login_resolve_attempts (login_id, fail_count, last_attempt_at, locked_until)
  values (v_key, v_next_fail_count, now(), case when v_next_fail_count >= v_max_attempts then now() + v_window else null end)
  on conflict (login_id) do update set fail_count = excluded.fail_count, last_attempt_at = excluded.last_attempt_at, locked_until = excluded.locked_until;
  return null;
end
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_slot_capacity(p_target_type text, p_target_id text, p_package_id text)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_target_type <> 'BUSINESS' then 1
    else greatest(1, coalesce(
      (select ci.slot_capacity from public.catalog_items ci
         where ci.id = p_package_id and ci.business_id = p_target_id),
      (select b.default_slot_capacity from public.businesses b where b.id = p_target_id),
      1))
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.respond_location_share(p_requester text, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_owner_name text;
  v_owner_avatar text;
begin
  if v_uid is null then return; end if;

  update public.location_share_grants
    set status = case when p_approve then 'APPROVED' else 'DENIED' end,
        updated_at = now()
  where owner_user_id = v_uid and requester_user_id = p_requester;

  select name, avatar into v_owner_name, v_owner_avatar from public.users where id = v_uid;

  if p_approve then
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      p_requester, 'LOCATION_APPROVED',
      'Location shared',
      'Your location request was approved',
      '/u/' || v_uid,
      jsonb_build_object('avatarUrl', v_owner_avatar, 'actorName', v_owner_name, 'statusPill', 'Approved', 'tone', 'success')
    );
  else
    begin
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        p_requester, 'LOCATION_DENIED',
        'Location request declined',
        coalesce(v_owner_name, 'They') || ' didn''t approve your location request',
        '/u/' || v_uid,
        jsonb_build_object('avatarUrl', v_owner_avatar, 'actorName', v_owner_name, 'statusPill', 'Declined', 'tone', 'neutral')
      );
    exception when others then null;
    end;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.revoke_business_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_session public.business_access_sessions%rowtype;
  v_biz_name text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_session
  from public.business_access_sessions
  where id = p_session_id
  for update;

  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session.grantee_user_id is distinct from v_uid
     and not exists (
       select 1 from public.businesses b
       where b.id = v_session.business_id and b.owner_user_id = v_uid
     ) then
    raise exception 'NOT_ALLOWED';
  end if;

  update public.business_access_sessions
  set status = 'REVOKED', decided_at = now(),
      expires_at = case when status = 'ACTIVE' then now() else expires_at end
  where id = p_session_id and status in ('PENDING', 'ACTIVE');

  -- Only when the OWNER revoked someone ELSE's access — a grantee revoking
  -- their own (leaving the team) doesn't need to be told they did the thing
  -- they just did.
  if v_uid is distinct from v_session.grantee_user_id then
    select name into v_biz_name from public.businesses where id = v_session.business_id;
    begin
      insert into public.notifications (user_id, type, title, body, deep_link)
      values (v_session.grantee_user_id, 'BUSINESS_ACCESS', 'Access removed',
              'Your access to ' || coalesce(v_biz_name, 'a business') || ' was removed.',
              '/account/business-access');
    exception when others then null; end;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.revoke_live_share_recipient(p_recipient_user_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   text := auth.uid()::text;
  v_share text;
  v_message_id text;
begin
  if v_uid is null then return; end if;

  select id into v_share from public.live_shares
    where sharer_user_id = v_uid and status = 'ACTIVE';
  if v_share is null then return; end if;

  select message_id into v_message_id from public.live_share_recipients
    where share_id = v_share and recipient_user_id = p_recipient_user_id;
  if v_message_id is null then return; end if;

  delete from public.live_share_recipients
    where share_id = v_share and recipient_user_id = p_recipient_user_id;

  update public.messages
    set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('status', 'ENDED')
    where id = v_message_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.revoke_location_share(p_requester text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_owner_name text;
  v_owner_avatar text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  update public.location_share_grants
    set status = 'REVOKED', updated_at = now()
  where owner_user_id = v_uid and requester_user_id = p_requester;

  select name, avatar into v_owner_name, v_owner_avatar from public.users where id = v_uid;
  begin
    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    values (
      p_requester, 'LOCATION_REVOKED',
      'Location access ended',
      coalesce(v_owner_name, 'Someone') || ' stopped sharing their exact location with you',
      '/u/' || v_uid,
      jsonb_build_object('avatarUrl', v_owner_avatar, 'actorName', v_owner_name, 'statusPill', 'Ended', 'tone', 'neutral')
    );
  exception when others then null;
  end;
end $function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_admin_login_id(p_new_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.users where id = auth.uid()::text and roles @> array['admin']) then
    raise exception 'Only an admin can change the admin login ID.';
  end if;
  if exists (select 1 from public.users where admin_login_id = p_new_id and id <> auth.uid()::text) then
    raise exception 'That admin ID is already taken.';
  end if;
  update public.users set admin_login_id = p_new_id where id = auth.uid()::text;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_business_login(p_business_id text, p_login_id text, p_password text, p_require_approval boolean, p_session_hours integer, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_login text := lower(trim(p_login_id));
  v_hours integer := least(greatest(coalesce(p_session_hours, 8), 1), 720);
  v_bphone text;
  v_uphone text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_user_id = v_uid) then
    raise exception 'Not allowed';
  end if;
  if v_login = '' then raise exception 'Login id required'; end if;

  if v_login ~ '^[0-9]+$' then
    -- numeric: only the owner's own 10-digit mobile is allowed
    if length(v_login) <> 10 then
      raise exception 'A numeric login id must be your 10-digit mobile number';
    end if;
    select regexp_replace(coalesce(b.phone,''), '\D', '', 'g'),
           regexp_replace(coalesce(u.phone,''), '\D', '', 'g')
      into v_bphone, v_uphone
      from public.businesses b
      left join public.users u on u.id = b.owner_user_id
      where b.id = p_business_id;
    if right(coalesce(v_bphone,''),10) <> v_login and right(coalesce(v_uphone,''),10) <> v_login then
      raise exception 'A number can only be your own mobile number';
    end if;
  else
    -- handle: must contain at least one letter and only safe characters
    if v_login !~ '^[a-z0-9._-]{4,30}$' or v_login !~ '[a-z]' then
      raise exception 'Use 4-30 letters/numbers (with at least one letter), or your own mobile number';
    end if;
  end if;

  insert into public.business_login_credentials
    (business_id, login_id, password_hash, require_approval, session_hours, is_enabled, updated_at)
  values (
    p_business_id, v_login,
    case when coalesce(p_password,'') <> '' then crypt(p_password, gen_salt('bf')) else '' end,
    coalesce(p_require_approval, true), v_hours, coalesce(p_enabled, true), now()
  )
  on conflict (business_id) do update set
    login_id = excluded.login_id,
    password_hash = case when coalesce(p_password,'') <> ''
                         then crypt(p_password, gen_salt('bf'))
                         else public.business_login_credentials.password_hash end,
    require_approval = excluded.require_approval,
    session_hours = excluded.session_hours,
    is_enabled = excluded.is_enabled,
    updated_at = now();

  if coalesce(p_enabled, true) = false then
    update public.business_access_sessions
      set status = 'REVOKED', decided_at = now()
      where business_id = p_business_id and status in ('PENDING','ACTIVE');
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_default_user_alias()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.alias IS NULL OR btrim(NEW.alias) = '' THEN
    NEW.alias := 'member_' || substr(md5(coalesce(NEW.id::text, gen_random_uuid()::text)), 1, 10);
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.set_delivery_duty(p_on_duty boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_active_count int;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  if p_on_duty = false then
    select count(*) into v_active_count
    from public.appointment_deliveries d
    where d.agent_user_id = v_uid
      and d.status in ('ASSIGNED', 'EN_ROUTE', 'ARRIVED');

    if v_active_count = 0 then
      select count(*) into v_active_count
      from public.delivery_batches b
      where b.agent_user_id = v_uid
        and b.status in ('PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_PROGRESS');
    end if;

    if v_active_count > 0 then
      raise exception 'Finish your current delivery before going off duty.';
    end if;
  end if;

  insert into public.delivery_agent_duty (user_id, on_duty, updated_at)
  values (v_uid, p_on_duty, now())
  on conflict (user_id) do update set on_duty = excluded.on_duty, updated_at = now();

  return p_on_duty;
end
$function$
;

CREATE OR REPLACE FUNCTION public.set_entity_password(p_kind text, p_new_password text, p_current_password text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_existing text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('business','provider') then raise exception 'Invalid kind'; end if;
  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  select case p_kind when 'business' then business_password_hash else provider_password_hash end
    into v_existing from public.users where id = v_uid;

  -- Reuses _verify_entity_password (not a second unguarded comparison) so
  -- changing a password shares the exact same rate limit as the switch gate
  -- itself — otherwise a hijacked session could brute force it here instead.
  if v_existing is not null then
    if not public._verify_entity_password(p_kind, v_uid, coalesce(p_current_password, '')) then
      raise exception 'Current password is incorrect';
    end if;
  end if;

  if p_kind = 'business' then
    update public.users set business_password_hash = crypt(p_new_password, gen_salt('bf')) where id = v_uid;
  else
    update public.users set provider_password_hash = crypt(p_new_password, gen_salt('bf')) where id = v_uid;
  end if;
  delete from public.entity_password_attempts where owner_user_id = v_uid and kind = p_kind;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_entity_recovery(p_kind text, p_question_id text, p_question_text text DEFAULT NULL::text, p_answer text DEFAULT NULL::text, p_current_password text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_password_hash text;
  v_normalized text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('business', 'provider') then raise exception 'Invalid kind'; end if;

  perform public._validate_recovery_question(p_kind, p_question_id, p_question_text);

  v_normalized := public._normalize_recovery_answer(p_answer);
  if length(v_normalized) < 3 then
    raise exception 'Answer must be at least 3 characters';
  end if;
  if length(v_normalized) > 80 then
    raise exception 'Answer must be at most 80 characters';
  end if;

  select case p_kind when 'business' then business_password_hash else provider_password_hash end
    into v_password_hash
    from public.users
   where id = v_uid;

  if v_password_hash is null then
    raise exception 'Set a password first';
  end if;

  if not public._verify_entity_password(p_kind, v_uid, coalesce(p_current_password, '')) then
    raise exception 'Current password is incorrect';
  end if;

  if p_kind = 'business' then
    update public.users
       set business_recovery_question_id = p_question_id,
           business_recovery_question_text = case when p_question_id = 'custom' then trim(p_question_text) else null end,
           business_recovery_answer_hash = crypt(v_normalized, gen_salt('bf'))
     where id = v_uid;
  else
    update public.users
       set provider_recovery_question_id = p_question_id,
           provider_recovery_question_text = case when p_question_id = 'custom' then trim(p_question_text) else null end,
           provider_recovery_answer_hash = crypt(v_normalized, gen_salt('bf'))
     where id = v_uid;
  end if;

  delete from public.entity_recovery_attempts where owner_user_id = v_uid and kind = p_kind;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_switch_pin(p_new_pin text, p_current_pin text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_existing_hash text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_new_pin !~ '^\d{4,6}$' then raise exception 'PIN must be 4 to 6 digits'; end if;
  select switch_pin_hash into v_existing_hash from public.users where id = v_uid;
  if v_existing_hash is not null then
    if not public.verify_switch_pin(coalesce(p_current_pin, '')) then
      raise exception 'Current PIN is incorrect';
    end if;
  end if;
  update public.users set switch_pin_hash = crypt(p_new_pin, gen_salt('bf')) where id = v_uid;
  delete from public.switch_pin_attempts where user_id = v_uid;
end
$function$
;

CREATE OR REPLACE FUNCTION public.setup_entity_password_with_recovery(p_kind text, p_new_password text, p_question_id text, p_question_text text DEFAULT NULL::text, p_answer text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_existing text;
  v_normalized text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_kind not in ('business', 'provider') then raise exception 'Invalid kind'; end if;
  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;

  perform public._validate_recovery_question(p_kind, p_question_id, p_question_text);

  v_normalized := public._normalize_recovery_answer(p_answer);
  if length(v_normalized) < 3 then
    raise exception 'Answer must be at least 3 characters';
  end if;
  if length(v_normalized) > 80 then
    raise exception 'Answer must be at most 80 characters';
  end if;

  select case p_kind when 'business' then business_password_hash else provider_password_hash end
    into v_existing
    from public.users
   where id = v_uid;

  if v_existing is not null then
    raise exception 'Password already set — use set_entity_password and set_entity_recovery instead';
  end if;

  if p_kind = 'business' then
    update public.users
       set business_password_hash = crypt(p_new_password, gen_salt('bf')),
           business_recovery_question_id = p_question_id,
           business_recovery_question_text = case when p_question_id = 'custom' then trim(p_question_text) else null end,
           business_recovery_answer_hash = crypt(v_normalized, gen_salt('bf'))
     where id = v_uid;
  else
    update public.users
       set provider_password_hash = crypt(p_new_password, gen_salt('bf')),
           provider_recovery_question_id = p_question_id,
           provider_recovery_question_text = case when p_question_id = 'custom' then trim(p_question_text) else null end,
           provider_recovery_answer_hash = crypt(v_normalized, gen_salt('bf'))
     where id = v_uid;
  end if;

  delete from public.entity_password_attempts where owner_user_id = v_uid and kind = p_kind;
  delete from public.entity_recovery_attempts where owner_user_id = v_uid and kind = p_kind;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_live_share(p_lat double precision, p_lng double precision)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   text := auth.uid()::text;
  v_share text;
  v_name  text;
  v_pa    text;
  v_pb    text;
  v_conv  text;
  v_msg   text;
  r       record;
begin
  if v_uid is null then return null; end if;

  -- LOC-3: Reject Null Island coordinates
  if (p_lat = 0 and p_lng = 0) or p_lat is null or p_lng is null then
    raise exception 'INVALID_COORDINATES';
  end if;

  -- ECON-2: Guard against broadcasting to zero contacts
  if not exists (select 1 from public.emergency_contacts where owner_user_id = v_uid) then
    raise exception 'NO_EMERGENCY_CONTACTS';
  end if;

  -- LOC-1: Expire old sessions that exceeded their time window
  update public.live_shares
    set status = 'ENDED', ended_at = now()
    where sharer_user_id = v_uid and status = 'ACTIVE' and expires_at <= now();

  -- Resume an active unexpired session if one exists
  select id into v_share from public.live_shares
    where sharer_user_id = v_uid and status = 'ACTIVE' and expires_at > now();

  if v_share is not null then
    update public.live_shares
      set lat = p_lat, lng = p_lng, updated_at = now()
      where id = v_share;
    return v_share;
  end if;

  insert into public.live_shares (sharer_user_id, lat, lng, expires_at)
    values (v_uid, p_lat, p_lng, now() + interval '8 hours')
    returning id into v_share;

  select name into v_name from public.users where id = v_uid;

  for r in
    select contact_user_id from public.emergency_contacts where owner_user_id = v_uid
  loop
    v_pa := least(v_uid, r.contact_user_id);
    v_pb := greatest(v_uid, r.contact_user_id);
    select id into v_conv from public.conversations
      where participant_a = v_pa and participant_b = v_pb and subject_id is null
      limit 1;
    if v_conv is null then
      insert into public.conversations (participant_a, participant_b)
        values (v_pa, v_pb) returning id into v_conv;
    end if;

    insert into public.messages (conversation_id, sender_id, body, kind, meta)
      values (v_conv, v_uid, '📍 Live location', 'LIVE_LOCATION',
              jsonb_build_object('share_id', v_share, 'status', 'ACTIVE'))
      returning id into v_msg;

    update public.conversations set
      last_message_at = now(),
      last_message_preview = '📍 Live location',
      has_unread_a = (v_pa <> v_uid),
      has_unread_b = (v_pb <> v_uid)
      where id = v_conv;

    insert into public.live_share_recipients (share_id, recipient_user_id, conversation_id, message_id)
      values (v_share, r.contact_user_id, v_conv, v_msg);

    insert into public.notifications (user_id, type, title, body, deep_link)
      values (r.contact_user_id, 'LIVE_LOCATION',
              coalesce(v_name, 'Someone') || ' is sharing live location',
              'Tap to follow their location on the map',
              '/chat/' || v_conv);
  end loop;

  return v_share;
end $function$
;

CREATE OR REPLACE FUNCTION public.stop_live_share()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text; v_share text; r record;
begin
  if v_uid is null then return; end if;
  select id into v_share from public.live_shares where sharer_user_id = v_uid and status = 'ACTIVE';
  if v_share is null then return; end if;
  update public.live_shares set status = 'ENDED', ended_at = now() where id = v_share;
  for r in select message_id from public.live_share_recipients where share_id = v_share loop
    update public.messages set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('status', 'ENDED') where id = r.message_id;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.stories_nearby(in_lng double precision, in_lat double precision, in_radius_km double precision DEFAULT 5, in_limit integer DEFAULT 50)
 RETURNS SETOF stories
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select s.*
  from public.stories s
  left join public.businesses b on s.owner_type = 'business' and b.id = s.owner_id
  left join public.providers  p on s.owner_type = 'provider'  and p.id = s.owner_id
  where s.expires_at > now()
    and (
      s.geom is null
      or ST_DWithin(
        s.geom,
        ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326)::geography,
        least(
          in_radius_km,
          case
            when s.owner_type = 'business' then greatest(coalesce(nullif(b.broadcast_radius, 0), 5), 0)
            when s.owner_type = 'provider'  then greatest(coalesce(nullif(p.service_radius_km, 0), 5), 0)
            else in_radius_km
          end
        ) * 1000
      )
    )
  order by s.created_at desc
  limit in_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.suggest_business_login(p_business_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_name text;
  v_slug text;
  v_hex text;
  v_suffix text;
  v_candidate text;
  v_try int := 0;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select name into v_name from public.businesses where id = p_business_id and owner_user_id = v_uid;
  if v_name is null then raise exception 'Not allowed'; end if;

  v_slug := trim(both '-' from lower(regexp_replace(coalesce(v_name,''), '[^a-zA-Z0-9]+', '-', 'g')));
  v_slug := left(nullif(v_slug, ''), 20);
  if v_slug is null or v_slug = '' then v_slug := 'shop'; end if;
  if v_slug !~ '[a-z]' then v_slug := 'shop-' || v_slug; end if;

  v_hex := regexp_replace(p_business_id, '[^a-f0-9]', '', 'g');
  v_suffix := right(v_hex, 4);

  loop
    v_candidate := v_slug || '-' || v_suffix;
    exit when not exists (select 1 from public.business_login_credentials c where lower(c.login_id) = v_candidate);
    v_try := v_try + 1;
    exit when v_try > 6;
    v_suffix := right(v_hex, 4 + v_try) || substr(md5(random()::text), 1, 2);
  end loop;

  return v_candidate;
end $function$
;

CREATE OR REPLACE FUNCTION public.sweep_my_appointments()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  update public.appointments
  set status = 'CANCELLED', cancelled_by = 'SYSTEM',
      response_note = coalesce(response_note, 'business not responded')
  where status = 'PENDING' and scheduled_for <= now()
    and (customer_user_id = v_uid or target_owner_user_id = v_uid
      or (target_type = 'BUSINESS' and public.has_business_access(target_id, v_uid)));

  update public.appointments set status = 'COMPLETED'
  where status = 'ACCEPTED' and scheduled_for <= now()
    and (customer_user_id = v_uid or target_owner_user_id = v_uid
      or (target_type = 'BUSINESS' and public.has_business_access(target_id, v_uid)));
end
$function$
;

CREATE OR REPLACE FUNCTION public.sweep_stale_appointment_holds()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.appointments
  set status = 'CANCELLED',
      cancelled_by = 'SYSTEM',
      response_note = coalesce(response_note, 'Hold expired — booking was not accepted in time')
  where status = 'PENDING'
    and created_at <= now() - interval '2 hours'
    and scheduled_for > now();
$function$
;

CREATE OR REPLACE FUNCTION public.sync_allow_comments_from_policy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if TG_OP = 'INSERT' then
    if new.comment_policy is not null then
      new.allow_comments := (new.comment_policy <> 'OFF');
    elsif new.allow_comments is not null then
      -- An old client wrote only the boolean: translate it to the equivalent
      -- policy rather than leaving the two columns disagreeing.
      new.comment_policy := case when new.allow_comments then 'MUTUALS' else 'OFF' end;
    else
      -- Neither column was sent. Everywhere else in this schema that's a
      -- column DEFAULT's job; comment_policy deliberately has none (see
      -- above), so the trigger supplies the default itself.
      new.comment_policy := 'NEIGHBORS';
      new.allow_comments := true;
    end if;
    return new;
  end if;

  -- TG_OP = 'UPDATE'. comment_policy is NOT NULL, so compare against OLD
  -- rather than checking for null.
  if new.comment_policy is distinct from old.comment_policy then
    -- The policy itself changed (a new-style write, whether or not
    -- allow_comments was touched in the same statement) — policy wins.
    new.allow_comments := (new.comment_policy <> 'OFF');
  elsif new.allow_comments is distinct from old.allow_comments then
    -- Only the legacy boolean changed: translate it, same rule as INSERT.
    new.comment_policy := case when new.allow_comments then 'MUTUALS' else 'OFF' end;
  end if;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.sync_community_post_geom()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_geom()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.lat is not null and new.lng is not null then
    new.geom := ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326)::geography;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_is_verified()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.verification_status = 'APPROVED' THEN
    NEW.is_verified := true;
  ELSE
    NEW.is_verified := false;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.sync_me_too_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    update public.requests set me_too_count = coalesce(me_too_count, 0) + 1 where id = new.request_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.requests set me_too_count = greatest(0, coalesce(me_too_count, 0) - 1) where id = old.request_id;
    return old;
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_post_comments_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_post text;
begin
  -- NEW is unassigned on DELETE and OLD on INSERT — referencing the wrong one
  -- raises "record is not assigned yet", so branch on TG_OP rather than
  -- coalesce(new, old).
  if TG_OP = 'DELETE' then v_post := old.post_id; else v_post := new.post_id; end if;

  update public.community_posts
     set comments_count = (select count(*) from public.post_comments where post_id = v_post)
   where id = v_post;

  return case when TG_OP = 'DELETE' then old else new end;
end
$function$
;

CREATE OR REPLACE FUNCTION public.sync_post_likes_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_post text;
begin
  if TG_OP = 'DELETE' then v_post := old.post_id; else v_post := new.post_id; end if;

  update public.community_posts
     set likes_count = (select count(*) from public.post_likes where post_id = v_post)
   where id = v_post;

  return case when TG_OP = 'DELETE' then old else new end;
end
$function$
;

CREATE OR REPLACE FUNCTION public.sync_request_me_too()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  req_owner text;
  req_title text;
  req_is_group_buy boolean;
  req_group_target int;
  new_count int;
begin
  if tg_op = 'INSERT' then
    update public.requests
       set me_too_count = coalesce(me_too_count, 0) + 1
     where id = new.request_id
    returning requester_user_id, title, is_group_buy, group_buy_target, me_too_count
      into req_owner, req_title, req_is_group_buy, req_group_target, new_count;

    if req_owner is not null and req_owner <> new.user_id then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        req_owner, 'ME_TOO', 'Someone said "me too"',
        'A neighbor needs "' || coalesce(req_title, 'your request') || '" too.',
        '/request/' || new.request_id,
        case when req_is_group_buy and req_group_target is not null
          then jsonb_build_object('progressCurrent', new_count, 'progressTarget', req_group_target, 'tone', 'brand')
          else null end
      );
    end if;

    if req_is_group_buy and req_group_target is not null and new_count = req_group_target then
      insert into public.notifications (user_id, type, title, body, deep_link, metadata)
      values (
        req_owner, 'GROUP_BUY_UNLOCKED', 'Group buy unlocked!',
        req_group_target || ' neighbors joined "' || coalesce(req_title, 'your request') || '" — bulk price unlocked.',
        '/request/' || new.request_id,
        jsonb_build_object('progressCurrent', new_count, 'progressTarget', req_group_target, 'statusPill', 'Unlocked', 'tone', 'success')
      );
    end if;
    return new;

  elsif tg_op = 'DELETE' then
    update public.requests
       set me_too_count = greatest(0, coalesce(me_too_count, 0) - 1)
     where id = old.request_id;
    return old;
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_request_proposal_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    update public.requests set proposal_count = proposal_count + 1 where id = new.request_id;
  elsif tg_op = 'DELETE' then
    update public.requests set proposal_count = greatest(0, proposal_count - 1) where id = old.request_id;
  end if;
  return null;
end
$function$
;

CREATE OR REPLACE FUNCTION public.sync_story_geom()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_complete_appointment_on_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status is distinct from 'DELIVERED' then return new; end if;
  if old.status is not distinct from new.status then return new; end if;

  update public.appointments a
     set status = 'COMPLETED'
   where a.id = new.appointment_id
     and a.fulfillment_type = 'DELIVERY'
     and a.status in ('PENDING', 'ACCEPTED');

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_delivery_batch_in_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.batch_id is null then return new; end if;
  if new.status = 'ASSIGNED' then return new; end if;
  if old.status is not distinct from new.status then return new; end if;

  update public.delivery_batches
     set status = 'IN_PROGRESS'
   where id = new.batch_id
     and status = 'ACCEPTED';

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.trg_bulk_deal_pledge_check_target()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.check_bulk_deal_target_and_close(coalesce(new.deal_id, old.deal_id));
  return coalesce(new, old);
end
$function$
;

CREATE OR REPLACE FUNCTION public.update_delivery_batch_position(p_batch_id text, p_lat double precision, p_lng double precision, p_accuracy double precision DEFAULT NULL::double precision, p_heading double precision DEFAULT NULL::double precision)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_lat < -90 or p_lat > 90 then raise exception 'INVALID_LATITUDE'; end if;
  if p_lng < -180 or p_lng > 180 then raise exception 'INVALID_LONGITUDE'; end if;
  update public.delivery_batches
     set lat = p_lat, lng = p_lng, accuracy = p_accuracy, heading = p_heading
   where id = p_batch_id and agent_user_id = v_uid and status in ('ACCEPTED','IN_PROGRESS');
  if not found then raise exception 'NOT_ALLOWED'; end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.update_delivery_position(p_delivery_id text, p_lat double precision, p_lng double precision, p_accuracy double precision DEFAULT NULL::double precision, p_heading double precision DEFAULT NULL::double precision)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_lat < -90  or p_lat > 90  then raise exception 'INVALID_LATITUDE';  end if;
  if p_lng < -180 or p_lng > 180 then raise exception 'INVALID_LONGITUDE'; end if;

  update public.appointment_deliveries
     set lat = p_lat, lng = p_lng
   where id = p_delivery_id
     and agent_user_id = v_uid
     and status in ('EN_ROUTE','ARRIVED');
end $function$
;

CREATE OR REPLACE FUNCTION public.update_live_share(p_lat double precision, p_lng double precision, p_accuracy double precision DEFAULT NULL::double precision, p_heading double precision DEFAULT NULL::double precision)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid text := auth.uid()::text;
begin
  if v_uid is null then return; end if;
  update public.live_shares
    set lat = p_lat, lng = p_lng, accuracy = p_accuracy, heading = p_heading, updated_at = now()
    where sharer_user_id = v_uid and status = 'ACTIVE';
end $function$
;

CREATE OR REPLACE FUNCTION public.update_rating_avg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.ratee_type = 'BUSINESS' THEN
    UPDATE public.businesses SET
      rating_avg   = (SELECT ROUND(AVG(rating)::numeric, 1) FROM public.ratings WHERE ratee_type = 'BUSINESS' AND ratee_id = NEW.ratee_id),
      rating_count = (SELECT COUNT(*)                        FROM public.ratings WHERE ratee_type = 'BUSINESS' AND ratee_id = NEW.ratee_id)
    WHERE id = NEW.ratee_id;

  ELSIF NEW.ratee_type = 'PROVIDER' THEN
    UPDATE public.providers SET
      rating_avg   = (SELECT ROUND(AVG(rating)::numeric, 1) FROM public.ratings WHERE ratee_type = 'PROVIDER' AND ratee_id = NEW.ratee_id),
      rating_count = (SELECT COUNT(*)                        FROM public.ratings WHERE ratee_type = 'PROVIDER' AND ratee_id = NEW.ratee_id)
    WHERE id = NEW.ratee_id;

  ELSIF NEW.ratee_type = 'USER' THEN
    UPDATE public.users SET
      rating_avg   = (SELECT ROUND(AVG(rating)::numeric, 1) FROM public.ratings WHERE ratee_type = 'USER' AND ratee_id = NEW.ratee_id),
      rating_count = (SELECT COUNT(*)                        FROM public.ratings WHERE ratee_type = 'USER' AND ratee_id = NEW.ratee_id)
    WHERE id = NEW.ratee_id;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_team_member_scopes(p_session_id uuid, p_scopes text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_scopes text[] := coalesce((select array_agg(distinct s) from unnest(p_scopes) as s
                                 where s in ('appointments','queue','catalog','leads','delivery')), '{}');
  v_grantee text;
  v_biz_name text;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if array_length(v_scopes, 1) is null then raise exception 'Pick at least one section to grant access to.'; end if;

  update public.business_access_sessions s
     set access_level = 'SCOPED', scopes = v_scopes
    from public.businesses b
   where s.id = p_session_id and b.id = s.business_id and b.owner_user_id = v_uid
     and s.status = 'ACTIVE'
  returning s.grantee_user_id, b.name into v_grantee, v_biz_name;
  if not found then raise exception 'NOT_ALLOWED'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (v_grantee, 'BUSINESS_ACCESS', 'Access updated',
            'Your access to ' || coalesce(v_biz_name, 'a business') || ' was changed by the owner.',
            '/account/business-access');
  exception when others then null; end;
end $function$
;

CREATE OR REPLACE FUNCTION public.verify_business_password(p_business_id text, p_password text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_owner text;
begin
  if p_business_id is null then
    v_owner := auth.uid()::text;
  else
    select owner_user_id into v_owner from public.businesses where id = p_business_id;
  end if;
  return public._verify_entity_password('business', v_owner, p_password);
end $function$
;

CREATE OR REPLACE FUNCTION public.verify_provider_password(p_provider_id text, p_password text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_owner text;
begin
  if p_provider_id is null then
    v_owner := auth.uid()::text;
  else
    select user_id into v_owner from public.providers where id = p_provider_id;
  end if;
  return public._verify_entity_password('provider', v_owner, p_password);
end $function$
;

CREATE OR REPLACE FUNCTION public.verify_switch_pin(p_pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_hash text;
  v_attempt public.switch_pin_attempts%rowtype;
  v_matches boolean;
  v_max_attempts constant integer := 5;
  v_window constant interval := interval '15 minutes';
  v_dummy_hash constant text := '$2a$10$CXSUxhkNpnbyeflgDI/sMei3m6s9krMAI2wx72jT.YBXr.Agkk6H2';
begin
  if v_uid is null then return false; end if;
  select * into v_attempt from public.switch_pin_attempts where user_id = v_uid for update;
  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then return false; end if;
  select switch_pin_hash into v_hash from public.users where id = v_uid;
  v_matches := crypt(coalesce(p_pin, ''), coalesce(v_hash, v_dummy_hash)) = coalesce(v_hash, v_dummy_hash);
  if v_hash is not null and v_matches then
    delete from public.switch_pin_attempts where user_id = v_uid;
    return true;
  end if;
  insert into public.switch_pin_attempts (user_id, fail_count, last_attempt_at, locked_until)
  values (v_uid, 1, now(), null)
  on conflict (user_id) do update
  set fail_count = case when switch_pin_attempts.last_attempt_at <= now() - v_window or switch_pin_attempts.locked_until is not null then 1 else switch_pin_attempts.fail_count + 1 end,
      last_attempt_at = now(),
      locked_until = case when (case when switch_pin_attempts.last_attempt_at <= now() - v_window or switch_pin_attempts.locked_until is not null then 1 else switch_pin_attempts.fail_count + 1 end) >= v_max_attempts then now() + v_window else null end;
  return false;
end
$function$
;

CREATE OR REPLACE FUNCTION public.withdraw_proposal(p_proposal_id text)
 RETURNS proposals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid text := auth.uid()::text;
  v_proposal public.proposals%rowtype;
  v_request public.requests%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select * into v_proposal from public.proposals where id = p_proposal_id for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND'; end if;

  if v_proposal.responder_user_id is distinct from v_uid
     and not (v_proposal.responder_type = 'business' and public.has_business_scope(v_proposal.responder_entity_id, v_uid, 'leads'))
     and not (v_proposal.responder_type = 'provider' and exists(select 1 from public.providers p where p.id = v_proposal.responder_entity_id and p.user_id = v_uid))
     and not public.is_admin(v_uid) then
    raise exception 'NOT_YOUR_PROPOSAL';
  end if;

  if v_proposal.status <> 'SUBMITTED' then
    raise exception 'INVALID_TRANSITION';
  end if;

  select * into v_request from public.requests where id = v_proposal.request_id;
  if found and v_request.status <> 'OPEN' then
    raise exception 'REQUEST_NOT_OPEN';
  end if;

  update public.proposals set status = 'WITHDRAWN' where id = p_proposal_id;
  select * into v_proposal from public.proposals where id = p_proposal_id;
  return v_proposal;
end;
$function$
;


-- ════════════════════════════════════════════════════════════
-- Function EXECUTE grants (effective) (245)
-- ════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION public._bulk_deal_close_internal(p_deal_id text, p_trigger text, p_outcome text) TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public._enforce_business_owner_limit() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public._normalize_recovery_answer(p_answer text) TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public._user_blocks_exists(p_a text, p_b text) TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public._validate_recovery_question(p_kind text, p_question_id text, p_question_text text) TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public._verify_entity_password(p_kind text, p_owner_user_id text, p_password text) TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public._verify_entity_recovery_answer(p_kind text, p_owner_user_id text, p_answer text) TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.accept_delivery_batch(p_batch_id text, p_stop_order text[]) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.accept_proposal(p_proposal_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.accept_proposal_at_price(p_proposal_id text, p_final_price integer) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.accept_proposal_counter(p_proposal_id text, p_counter_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.admin_cancel_request(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.admin_delete_comment(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.admin_delete_post(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.admin_recent_users() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.admin_resolve_agreement_dispute(p_id text, p_resolution text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.admin_search_users(term text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.agreement_cancel(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.agreement_claim_payment(p_id text, p_method text, p_amount integer, p_reference text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.agreement_complete(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.agreement_confirm(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.agreement_confirm_payment(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.agreement_create_tracking_token(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.agreement_dispute(p_id text, p_reason text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.agreement_reject_payment(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.agreement_start_work(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.agreement_submit_review(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.agreement_update_live_status(p_id text, p_status text, p_lat double precision, p_lng double precision) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.aliases_available(p_aliases text[]) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.appointment_accept_with_eta(p_id text, p_eta_text text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.appointment_claim_payment(p_id text, p_method text, p_amount numeric, p_reference text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.appointment_confirm_payment(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.appointment_create(p_target_type text, p_target_id text, p_scheduled_for timestamp with time zone, p_date_label text, p_time_label text, p_notes text, p_photo_url text, p_package_id text, p_package_name text, p_package_price numeric, p_items jsonb, p_fulfillment_type text, p_delivery_address_line text, p_delivery_lat double precision, p_delivery_lng double precision, p_requested_delivery_window text, p_party_size integer, p_target_package_key text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.appointment_create_tracking_token(p_appointment_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.appointment_create_walk_in(p_target_type text, p_target_id text, p_customer_name text, p_customer_phone text, p_scheduled_for timestamp with time zone, p_date_label text, p_time_label text, p_package_id text, p_package_name text, p_package_price numeric, p_items jsonb, p_party_size integer, p_target_package_key text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.appointment_create_walk_in_payment(p_target_id text, p_package_name text, p_package_price numeric, p_method text, p_reference text, p_items jsonb) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.appointment_record_walk_in_payment(p_id text, p_method text, p_amount numeric, p_reference text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.appointment_reject_payment(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.appointment_set_unpaid_amount(p_id text, p_amount numeric) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.appointment_transition(p_id text, p_status text, p_response_note text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.appointment_update_delivery_status(p_delivery_id text, p_status text, p_lat double precision, p_lng double precision) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.assign_delivery(p_appointment_id text, p_agent_user_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.assign_delivery_batch(p_appointment_ids text[], p_agent_user_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.booked_slots(p_target_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.bulk_deal_close(p_deal_id text, p_outcome text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.bulk_deal_delete(p_deal_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.bulk_deal_extend(p_deal_id text, p_new_closes_at timestamp with time zone) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.bulk_deal_pledge_claim_deposit(p_deal_id text, p_method text, p_reference text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.bulk_deal_pledge_confirm_deposit(p_deal_id text, p_pledger_user_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.bulk_deal_pledge_join(p_deal_id text, p_quantity integer, p_notes text, p_delivery_address text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.bulk_deal_pledge_leave(p_deal_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.bulk_deal_pledge_reject_deposit(p_deal_id text, p_pledger_user_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.bulk_deal_redemption_stats(p_deal_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.bulk_deal_token_redeem(p_token_code text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.bulk_deal_token_redeem(p_token_code text, p_business_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.bulk_deal_tokens_for_deal(p_deal_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.bump_business_metric(p_business_id text, p_metric text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.bump_provider_views(p_provider_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.bump_queue_line_changed() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.business_active_deliveries(p_business_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.business_login_attempt(p_login_id text, p_password text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.business_slot_capacities(p_business_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.businesses_nearby(in_lng double precision, in_lat double precision, in_radius_km double precision, in_category text, in_limit integer, in_offset integer, in_category_ids text[]) TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_comment_on_post(p_post_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.can_manage_business(p_business_id text) TO anon, authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.can_react_to_comment(p_comment_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.cancel_delivery(p_delivery_id text, p_reason text, p_note text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.cancel_expired_agreements() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.check_bulk_deal_target_and_close(p_deal_id text) TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.check_self_vouch() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_first_admin(p_login_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.clear_entity_password(p_kind text, p_current_password text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.clear_switch_pin(p_current_pin text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.close_expired_bulk_deals() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.close_expired_business_sessions() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.close_expired_requests() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.close_stale_queue_tokens() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.comment_gate_reason(p_post_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.community_comment_delete(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.community_comment_set_pinned(p_id text, p_pinned boolean) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.community_comment_update(p_id text, p_body text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.community_poll_close(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.community_post_add_recommendation(p_post_id text, p_listing_type text, p_listing_id text, p_by_name text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.community_post_delete(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.community_post_hot_score(in_likes integer, in_comments integer, in_created_at timestamp with time zone) TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.community_post_set_profile_visibility(p_id text, p_show boolean) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.community_post_set_resolved(p_id text, p_resolved boolean) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.community_post_update(p_id text, p_title text, p_body text, p_image text, p_media text[], p_image_alt text, p_last_seen text, p_reward text, p_pickup_note text, p_tagged_listing jsonb, p_clear_tagged_listing boolean, p_comment_policy text, p_hide_like_count boolean) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.community_posts_feed(in_lng double precision, in_lat double precision, in_radius_km double precision, in_limit integer, in_offset integer, in_type text, in_sort text, in_query text) TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.community_posts_nearby(in_lng double precision, in_lat double precision, in_radius_km double precision, in_limit integer, in_offset integer) TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.community_search_tsquery(p_q text) TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.confirm_handoff(p_delivery_id text, p_code text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.count_my_active_deliveries(p_business_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.create_settlements_on_complete() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.custom_payment_confirm(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.custom_payment_create(p_target_type text, p_target_id text, p_amount numeric, p_method text, p_note text, p_reference text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.custom_payment_reject(p_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.decide_business_session(p_session_id uuid, p_approve boolean) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.decline_delivery_batch(p_batch_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.delete_business(p_business_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.derive_notification_scope() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.distance_km(in_lng double precision, in_lat double precision, row_lng double precision, row_lat double precision) TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.enforce_business_location_freeze() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.enforce_customer_daily_appointment_limit() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.enforce_manual_verification_decision() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.enforce_places_status_freeze() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.enforce_proposal_responder_entity_owner() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.enforce_queue_cancel_rules() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.enforce_queue_open_on_join() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.enforce_queue_token_customer_update() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.enforce_role_privilege_guard() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.enforce_slot_capacity() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.expire_tokens_on_queue_close() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.get_delivery_duty() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.get_entity_recovery_question(p_kind text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.get_live_share(p_share_id text) TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_nearby_user_ids(p_lat double precision, p_lng double precision, p_radius_km double precision) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.get_own_coords() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.get_own_profile() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.get_public_profile(target_id text) TO anon, authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.get_shared_location(p_target text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.get_tracking(p_token text) TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.grant_business_access(p_business_id text, p_identifier text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.grant_team_member_access(p_business_id text, p_identifier text, p_scopes text[]) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.group_buy_issue_tokens(p_request_id text, p_agreement_id text, p_business_id text, p_unit_price numeric, p_valid_until timestamp with time zone) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.group_buy_join(p_request_id text, p_quantity integer, p_notes text, p_delivery_address text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.group_buy_leave(p_request_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.group_buy_redemption_stats(p_agreement_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.group_buy_token_redeem(p_token_code text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.group_buy_tokens_for_agreement(p_agreement_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.has_business_access(p_business_id text, p_uid text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.has_business_full_access(p_business_id text, p_uid text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.has_business_scope(p_business_id text, p_uid text, p_scope text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision) TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.increment_stamp(p_card_id text, p_user_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.is_admin(p_user_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.is_blocked_between(p_other_user_id text) TO anon, authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.is_entity_password_set(p_kind text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.is_entity_recovery_set(p_kind text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.is_society_admin(p_society_id uuid, p_user_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.is_society_member(p_society_id uuid, p_user_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.is_switch_pin_set() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.me_too_toggle(p_request_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.my_business_access_scope(p_business_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.my_business_access_status(p_business_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.my_delegated_business_password_status() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.my_delegated_businesses() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.my_deliveries() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.my_delivery_progress(p_appointment_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.my_duty_blockers() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.my_live_share_recipients() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.neighborhood_today(in_lat double precision, in_lng double precision, in_radius_m integer) TO anon, authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.notification_push_health() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.notify_admins_business_pending() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_agreement_confirm(p_agreement_id text, p_recipient_user_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.notify_ended_polls() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.notify_on_agreement() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.notify_on_appointment_created() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.notify_on_appointment_status() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.notify_on_chat_message() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_on_comment_mention() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_on_comment_reaction() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_on_nearby_alert() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_on_post_comment() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.notify_on_post_like() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_on_post_recommendation() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_on_post_resolved() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_on_proposal() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.notify_on_proposal_broadcast() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.notify_on_qna_answered() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_on_qna_asked() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_on_queue_called() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.notify_on_queue_payment_status() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_on_rating() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_on_report_resolved() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.notify_on_request() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.notify_on_story_reaction() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.notify_saved_search_matches_business() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.notify_saved_search_matches_provider() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.notify_verification_decision_business() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.notify_verification_decision_provider() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.on_queue_token_update() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.proposal_submit_counter(p_proposal_id text, p_amount numeric, p_message text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.protect_business_owner() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.providers_nearby(in_lng double precision, in_lat double precision, in_radius_km double precision, in_category text, in_limit integer, in_offset integer, in_category_ids text[]) TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.push_on_notification_insert() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.qna_to_lead() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.queue_token_create_walk_in(p_business_id text, p_customer_name text, p_party_size text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.queue_waiting_line(p_business_ids text[]) TO anon, authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.recompute_rating_aggregates() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_terms_acceptance(p_version text, p_user_agent text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.renew_location_share(p_requester text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.reply_to_rating(p_rating_id text, p_reply text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.request_location_share(p_owner text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.reschedule_appointment(p_original_id text, p_scheduled_for timestamp with time zone, p_date_label text, p_time_label text, p_notes text, p_photo_url text, p_package_id text, p_package_name text, p_package_price numeric) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.reserve_catalog_item(p_item_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.reserve_catalog_items(p_items jsonb) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.reset_boost_reminder() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.reset_entity_password_via_recovery(p_kind text, p_answer text, p_new_password text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.resolve_admin_email(p_login_id text) TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.resolve_slot_capacity(p_target_type text, p_target_id text, p_package_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.respond_location_share(p_requester text, p_approve boolean) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.revoke_business_session(p_session_id uuid) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.revoke_live_share_recipient(p_recipient_user_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.revoke_location_share(p_requester text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.set_admin_login_id(p_new_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.set_business_login(p_business_id text, p_login_id text, p_password text, p_require_approval boolean, p_session_hours integer, p_enabled boolean) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.set_default_user_alias() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_delivery_duty(p_on_duty boolean) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.set_entity_password(p_kind text, p_new_password text, p_current_password text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.set_entity_recovery(p_kind text, p_question_id text, p_question_text text, p_answer text, p_current_password text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.set_switch_pin(p_new_pin text, p_current_pin text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.setup_entity_password_with_recovery(p_kind text, p_new_password text, p_question_id text, p_question_text text, p_answer text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.start_live_share(p_lat double precision, p_lng double precision) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.stop_live_share() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.stories_nearby(in_lng double precision, in_lat double precision, in_radius_km double precision, in_limit integer) TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.suggest_business_login(p_business_id text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.sweep_my_appointments() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.sweep_stale_appointment_holds() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.sync_allow_comments_from_policy() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_community_post_geom() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.sync_geom() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.sync_is_verified() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.sync_me_too_count() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.sync_post_comments_count() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_post_likes_count() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_request_me_too() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.sync_request_proposal_count() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_story_geom() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.tg_complete_appointment_on_delivery() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.tg_delivery_batch_in_progress() TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.trg_bulk_deal_pledge_check_target() TO anon, authenticated, postgres, service_role, PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_delivery_batch_position(p_batch_id text, p_lat double precision, p_lng double precision, p_accuracy double precision, p_heading double precision) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.update_delivery_position(p_delivery_id text, p_lat double precision, p_lng double precision, p_accuracy double precision, p_heading double precision) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.update_live_share(p_lat double precision, p_lng double precision, p_accuracy double precision, p_heading double precision) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.update_rating_avg() TO postgres, service_role;

GRANT EXECUTE ON FUNCTION public.update_team_member_scopes(p_session_id uuid, p_scopes text[]) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.verify_business_password(p_business_id text, p_password text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.verify_provider_password(p_provider_id text, p_password text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.verify_switch_pin(p_pin text) TO authenticated, postgres, service_role;

GRANT EXECUTE ON FUNCTION public.withdraw_proposal(p_proposal_id text) TO authenticated, postgres, service_role;


-- ════════════════════════════════════════════════════════════
-- Triggers (69)
-- ════════════════════════════════════════════════════════════

CREATE TRIGGER on_auth_user_created AFTER INSERT OR UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

CREATE TRIGGER trg_notify_agreement AFTER UPDATE ON agreements FOR EACH ROW EXECUTE FUNCTION notify_on_agreement();

CREATE TRIGGER trg_settlements AFTER UPDATE ON agreements FOR EACH ROW EXECUTE FUNCTION create_settlements_on_complete();

CREATE TRIGGER trg_complete_appointment_on_delivery AFTER UPDATE OF status ON appointment_deliveries FOR EACH ROW EXECUTE FUNCTION tg_complete_appointment_on_delivery();

CREATE TRIGGER trg_delivery_batch_in_progress AFTER UPDATE OF status ON appointment_deliveries FOR EACH ROW EXECUTE FUNCTION tg_delivery_batch_in_progress();

CREATE TRIGGER trg_customer_daily_appointment_limit BEFORE INSERT OR UPDATE OF customer_user_id, scheduled_for, status ON appointments FOR EACH ROW EXECUTE FUNCTION enforce_customer_daily_appointment_limit();

CREATE TRIGGER trg_enforce_slot_capacity BEFORE INSERT OR UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION enforce_slot_capacity();

CREATE TRIGGER trg_notify_appointment_created AFTER INSERT ON appointments FOR EACH ROW EXECUTE FUNCTION notify_on_appointment_created();

CREATE TRIGGER trg_notify_appointment_status AFTER UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION notify_on_appointment_status();

CREATE TRIGGER trg_check_bulk_deal_target AFTER INSERT OR UPDATE OF quantity, deposit_status ON bulk_deal_pledges FOR EACH ROW EXECUTE FUNCTION trg_bulk_deal_pledge_check_target();

CREATE TRIGGER trg_notify_qna_answered AFTER UPDATE ON business_qna FOR EACH ROW EXECUTE FUNCTION notify_on_qna_answered();

CREATE TRIGGER trg_notify_qna_asked AFTER INSERT ON business_qna FOR EACH ROW EXECUTE FUNCTION notify_on_qna_asked();

CREATE TRIGGER trg_qna_lead AFTER INSERT ON business_qna FOR EACH ROW EXECUTE FUNCTION qna_to_lead();

CREATE TRIGGER businesses_geom BEFORE INSERT OR UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION sync_geom();

CREATE TRIGGER sync_businesses_verified BEFORE INSERT OR UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION sync_is_verified();

CREATE TRIGGER trg_enforce_business_location_freeze BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION enforce_business_location_freeze();

CREATE TRIGGER trg_enforce_business_owner_limit BEFORE INSERT OR UPDATE OF owner_user_id ON businesses FOR EACH ROW EXECUTE FUNCTION _enforce_business_owner_limit();

CREATE TRIGGER trg_enforce_verification_business BEFORE INSERT OR UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION enforce_manual_verification_decision();

CREATE TRIGGER trg_notify_admins_business_pending AFTER INSERT OR UPDATE OF status ON businesses FOR EACH ROW EXECUTE FUNCTION notify_admins_business_pending();

CREATE TRIGGER trg_notify_saved_search_business AFTER INSERT OR UPDATE OF status ON businesses FOR EACH ROW EXECUTE FUNCTION notify_saved_search_matches_business();

CREATE TRIGGER trg_notify_verification_business AFTER UPDATE OF is_verified, verification_status ON businesses FOR EACH ROW EXECUTE FUNCTION notify_verification_decision_business();

CREATE TRIGGER trg_protect_business_owner BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION protect_business_owner();

CREATE TRIGGER trg_reset_boost_reminder_business BEFORE UPDATE OF boosted_until ON businesses FOR EACH ROW EXECUTE FUNCTION reset_boost_reminder();

CREATE TRIGGER trg_notify_comment_reaction AFTER INSERT ON comment_reactions FOR EACH ROW EXECUTE FUNCTION notify_on_comment_reaction();

CREATE TRIGGER trg_notify_nearby_alert AFTER INSERT ON community_posts FOR EACH ROW EXECUTE FUNCTION notify_on_nearby_alert();

CREATE TRIGGER trg_notify_post_recommendation AFTER UPDATE OF recommendations ON community_posts FOR EACH ROW EXECUTE FUNCTION notify_on_post_recommendation();

CREATE TRIGGER trg_notify_post_resolved AFTER UPDATE OF resolved ON community_posts FOR EACH ROW EXECUTE FUNCTION notify_on_post_resolved();

CREATE TRIGGER trg_sync_allow_comments BEFORE INSERT OR UPDATE OF comment_policy, allow_comments ON community_posts FOR EACH ROW EXECUTE FUNCTION sync_allow_comments_from_policy();

CREATE TRIGGER trg_sync_community_post_geom BEFORE INSERT OR UPDATE OF lat, lng ON community_posts FOR EACH ROW EXECUTE FUNCTION sync_community_post_geom();

CREATE TRIGGER trg_prevent_self_endorsement BEFORE INSERT OR UPDATE ON endorsements FOR EACH ROW EXECUTE FUNCTION check_self_vouch();

CREATE TRIGGER tr_notify_on_chat_message AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION notify_on_chat_message();

CREATE TRIGGER trg_derive_notification_scope BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION derive_notification_scope();

CREATE TRIGGER trg_push_on_notification AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION push_on_notification_insert();

CREATE TRIGGER places_geom BEFORE INSERT OR UPDATE ON places FOR EACH ROW EXECUTE FUNCTION sync_geom();

CREATE TRIGGER trg_enforce_places_status_freeze BEFORE UPDATE ON places FOR EACH ROW EXECUTE FUNCTION enforce_places_status_freeze();

CREATE TRIGGER trg_notify_comment_mention AFTER INSERT ON post_comments FOR EACH ROW EXECUTE FUNCTION notify_on_comment_mention();

CREATE TRIGGER trg_notify_post_comment AFTER INSERT ON post_comments FOR EACH ROW EXECUTE FUNCTION notify_on_post_comment();

CREATE TRIGGER trg_sync_post_comments_count AFTER INSERT OR DELETE ON post_comments FOR EACH ROW EXECUTE FUNCTION sync_post_comments_count();

CREATE TRIGGER trg_notify_post_like AFTER INSERT ON post_likes FOR EACH ROW EXECUTE FUNCTION notify_on_post_like();

CREATE TRIGGER trg_sync_post_likes_count AFTER INSERT OR DELETE ON post_likes FOR EACH ROW EXECUTE FUNCTION sync_post_likes_count();

CREATE TRIGGER trg_notify_proposal AFTER INSERT ON proposals FOR EACH ROW EXECUTE FUNCTION notify_on_proposal();

CREATE TRIGGER trg_notify_proposal_broadcast AFTER INSERT ON proposals FOR EACH ROW WHEN (new.broadcast_to_metoo = true) EXECUTE FUNCTION notify_on_proposal_broadcast();

CREATE TRIGGER trg_proposal_responder_entity_owner BEFORE INSERT OR UPDATE OF responder_type, responder_entity_id, responder_user_id ON proposals FOR EACH ROW EXECUTE FUNCTION enforce_proposal_responder_entity_owner();

CREATE TRIGGER trg_sync_request_proposal_count AFTER INSERT OR DELETE ON proposals FOR EACH ROW EXECUTE FUNCTION sync_request_proposal_count();

CREATE TRIGGER providers_geom BEFORE INSERT OR UPDATE ON providers FOR EACH ROW EXECUTE FUNCTION sync_geom();

CREATE TRIGGER sync_providers_verified BEFORE INSERT OR UPDATE ON providers FOR EACH ROW EXECUTE FUNCTION sync_is_verified();

CREATE TRIGGER trg_enforce_verification_provider BEFORE INSERT OR UPDATE ON providers FOR EACH ROW EXECUTE FUNCTION enforce_manual_verification_decision();

CREATE TRIGGER trg_notify_saved_search_provider AFTER INSERT OR UPDATE OF status ON providers FOR EACH ROW EXECUTE FUNCTION notify_saved_search_matches_provider();

CREATE TRIGGER trg_notify_verification_provider AFTER UPDATE OF is_verified, verification_status ON providers FOR EACH ROW EXECUTE FUNCTION notify_verification_decision_provider();

CREATE TRIGGER trg_expire_on_queue_close AFTER UPDATE ON queue_settings FOR EACH ROW EXECUTE FUNCTION expire_tokens_on_queue_close();

CREATE TRIGGER trg_enforce_queue_cancel BEFORE UPDATE ON queue_tokens FOR EACH ROW EXECUTE FUNCTION enforce_queue_cancel_rules();

CREATE TRIGGER trg_enforce_queue_open_on_join BEFORE INSERT ON queue_tokens FOR EACH ROW EXECUTE FUNCTION enforce_queue_open_on_join();

CREATE TRIGGER trg_enforce_queue_token_customer_update BEFORE UPDATE ON queue_tokens FOR EACH ROW EXECUTE FUNCTION enforce_queue_token_customer_update();

CREATE TRIGGER trg_notify_queue_called AFTER UPDATE ON queue_tokens FOR EACH ROW EXECUTE FUNCTION notify_on_queue_called();

CREATE TRIGGER trg_notify_queue_payment_status AFTER UPDATE ON queue_tokens FOR EACH ROW EXECUTE FUNCTION notify_on_queue_payment_status();

CREATE TRIGGER trg_on_queue_token_update AFTER UPDATE ON queue_tokens FOR EACH ROW EXECUTE FUNCTION on_queue_token_update();

CREATE TRIGGER trg_queue_line_changed AFTER INSERT OR DELETE OR UPDATE OF status, party_size, business_id ON queue_tokens FOR EACH ROW EXECUTE FUNCTION bump_queue_line_changed();

CREATE TRIGGER ratings_update_avg AFTER INSERT ON ratings FOR EACH ROW EXECUTE FUNCTION update_rating_avg();

CREATE TRIGGER trg_notify_on_rating AFTER INSERT ON ratings FOR EACH ROW EXECUTE FUNCTION notify_on_rating();

CREATE TRIGGER trg_recompute_ratings AFTER INSERT OR DELETE OR UPDATE ON ratings FOR EACH ROW EXECUTE FUNCTION recompute_rating_aggregates();

CREATE TRIGGER trg_notify_report_resolved AFTER UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION notify_on_report_resolved();

CREATE TRIGGER me_too_count_trigger AFTER INSERT OR DELETE ON request_me_toos FOR EACH ROW EXECUTE FUNCTION sync_me_too_count();

CREATE TRIGGER requests_geom BEFORE INSERT OR UPDATE ON requests FOR EACH ROW EXECUTE FUNCTION sync_geom();

CREATE TRIGGER trg_notify_request AFTER INSERT ON requests FOR EACH ROW EXECUTE FUNCTION notify_on_request();

CREATE TRIGGER trg_sync_story_geom BEFORE INSERT OR UPDATE ON stories FOR EACH ROW EXECUTE FUNCTION sync_story_geom();

CREATE TRIGGER trg_notify_story_reaction AFTER INSERT OR UPDATE ON story_views FOR EACH ROW EXECUTE FUNCTION notify_on_story_reaction();

CREATE TRIGGER trg_enforce_role_privilege_guard BEFORE INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION enforce_role_privilege_guard();

CREATE TRIGGER trg_set_default_user_alias BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION set_default_user_alias();

CREATE TRIGGER trg_prevent_self_vouch BEFORE INSERT OR UPDATE ON vouches FOR EACH ROW EXECUTE FUNCTION check_self_vouch();


-- ════════════════════════════════════════════════════════════
-- Indexes (not backing a constraint) (178)
-- ════════════════════════════════════════════════════════════

CREATE INDEX account_appeals_owner_idx ON public.account_appeals USING btree (owner_user_id, created_at DESC);

CREATE INDEX account_appeals_status_idx ON public.account_appeals USING btree (status, created_at DESC);

CREATE UNIQUE INDEX agreements_one_per_proposal ON public.agreements USING btree (proposal_id) WHERE (proposal_id IS NOT NULL);

CREATE UNIQUE INDEX agreements_one_per_request ON public.agreements USING btree (request_id) WHERE (request_id IS NOT NULL);

CREATE INDEX agreements_request_idx ON public.agreements USING btree (request_id);

CREATE INDEX agreements_requester_idx ON public.agreements USING btree (requester_user_id);

CREATE INDEX agreements_responder_idx ON public.agreements USING btree (responder_user_id);

CREATE INDEX agreements_status_idx ON public.agreements USING btree (status);

CREATE INDEX agreements_tracking_token_idx ON public.agreements USING btree (tracking_token);

CREATE INDEX idx_agreements_responder_entity ON public.agreements USING btree (responder_entity_id) WHERE (responder_entity_id IS NOT NULL);

CREATE INDEX appointment_deliveries_agent_idx ON public.appointment_deliveries USING btree (agent_user_id);

CREATE INDEX appointment_deliveries_batch_idx ON public.appointment_deliveries USING btree (batch_id);

CREATE INDEX appointment_deliveries_business_idx ON public.appointment_deliveries USING btree (business_id);

CREATE UNIQUE INDEX appointment_deliveries_one_active ON public.appointment_deliveries USING btree (appointment_id) WHERE (status = ANY (ARRAY['ASSIGNED'::text, 'EN_ROUTE'::text, 'ARRIVED'::text]));

CREATE INDEX appointment_items_appointment_idx ON public.appointment_items USING btree (appointment_id);

CREATE INDEX appointment_items_catalog_item_idx ON public.appointment_items USING btree (catalog_item_id);

CREATE INDEX appointments_customer_idx ON public.appointments USING btree (customer_user_id);

CREATE INDEX appointments_owner_idx ON public.appointments USING btree (target_owner_user_id);

CREATE INDEX appointments_rescheduled_from_idx ON public.appointments USING btree (rescheduled_from);

CREATE INDEX appointments_slot_usage_idx ON public.appointments USING btree (target_id, scheduled_for) WHERE (status = ANY (ARRAY['PENDING'::text, 'ACCEPTED'::text]));

CREATE INDEX appointments_target_idx ON public.appointments USING btree (target_id);

CREATE INDEX idx_appointments_out_of_range ON public.appointments USING btree (target_id, scheduled_for) WHERE (is_out_of_range = true);

CREATE INDEX blocked_slots_target_idx ON public.blocked_slots USING btree (target_id, date);

CREATE INDEX blocked_slots_target_owner_idx ON public.blocked_slots USING btree (target_owner_user_id);

CREATE UNIQUE INDEX blocked_slots_unique_recurring ON public.blocked_slots USING btree (target_id, weekday, COALESCE(time_label, ''::text)) WHERE (recurring = true);

CREATE UNIQUE INDEX blocked_slots_unique_specific ON public.blocked_slots USING btree (target_id, date, COALESCE(time_label, ''::text)) WHERE (recurring = false);

CREATE INDEX bookmarks_user_idx ON public.bookmarks USING btree (user_id);

CREATE INDEX bug_reports_user_id_idx ON public.bug_reports USING btree (user_id);

CREATE INDEX bulk_deal_pledges_deal_idx ON public.bulk_deal_pledges USING btree (deal_id);

CREATE INDEX bulk_deal_pledges_user_idx ON public.bulk_deal_pledges USING btree (user_id);

CREATE INDEX bulk_deal_tokens_business_idx ON public.bulk_deal_tokens USING btree (business_id);

CREATE UNIQUE INDEX bulk_deal_tokens_one_per_holder ON public.bulk_deal_tokens USING btree (deal_id, holder_user_id);

CREATE INDEX bulk_deals_active_idx ON public.bulk_deals USING btree (status) WHERE (status = 'ACTIVE'::entity_status);

CREATE INDEX bulk_deals_business_idx ON public.bulk_deals USING btree (business_id);

CREATE INDEX business_access_sessions_active_idx ON public.business_access_sessions USING btree (business_id) WHERE (status = 'ACTIVE'::text);

CREATE INDEX business_access_sessions_biz_status_idx ON public.business_access_sessions USING btree (business_id, status);

CREATE INDEX business_access_sessions_grantee_status_idx ON public.business_access_sessions USING btree (grantee_user_id, status);

CREATE UNIQUE INDEX business_access_sessions_one_current ON public.business_access_sessions USING btree (business_id, grantee_user_id) WHERE (status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text]));

CREATE INDEX business_login_attempts_by_idx ON public.business_login_attempts USING btree (attempted_by);

CREATE UNIQUE INDEX business_login_credentials_login_id_key ON public.business_login_credentials USING btree (lower(login_id));

CREATE INDEX business_packages_business_id_idx ON public.business_packages USING btree (business_id);

CREATE INDEX business_portfolio_business_idx ON public.business_portfolio_items USING btree (business_id, created_at DESC);

CREATE INDEX business_qna_asker_idx ON public.business_qna USING btree (asker_user_id);

CREATE INDEX qna_biz_idx ON public.business_qna USING btree (business_id, created_at DESC);

CREATE INDEX business_team_members_biz_idx ON public.business_team_members USING btree (business_id, created_at);

CREATE INDEX business_view_logs_biz_time ON public.business_view_logs USING btree (business_id, viewed_at);

CREATE INDEX businesses_category_idx ON public.businesses USING btree (category_id);

CREATE INDEX businesses_geom_idx ON public.businesses USING gist (geom);

CREATE INDEX businesses_location_review_pending_idx ON public.businesses USING btree (location_review_status) WHERE (location_review_status = 'PENDING'::text);

CREATE INDEX businesses_owner_idx ON public.businesses USING btree (owner_user_id);

CREATE INDEX catalog_items_business_idx ON public.catalog_items USING btree (business_id);

CREATE INDEX catalog_items_provider_idx ON public.catalog_items USING btree (provider_id);

CREATE INDEX categories_parent_idx ON public.categories USING btree (parent_id);

CREATE INDEX client_errors_created_idx ON public.client_errors USING btree (created_at DESC);

CREATE INDEX client_errors_user_idx ON public.client_errors USING btree (user_id);

CREATE INDEX comment_reactions_user_idx ON public.comment_reactions USING btree (user_id);

CREATE INDEX community_posts_author_ref_idx ON public.community_posts USING btree (author_type, author_ref_id);

CREATE INDEX community_posts_author_user_idx ON public.community_posts USING btree (author_user_id);

CREATE INDEX community_posts_expires_at_idx ON public.community_posts USING btree (expires_at) WHERE (expires_at IS NOT NULL);

CREATE INDEX community_posts_geom_idx ON public.community_posts USING gist (geom);

CREATE INDEX community_posts_poll_ends_at_idx ON public.community_posts USING btree (poll_ends_at) WHERE (poll_ends_at IS NOT NULL);

CREATE INDEX community_posts_poll_pending_notify_idx ON public.community_posts USING btree (poll_ends_at) WHERE ((type = 'POLL'::text) AND (poll_ended_notified_at IS NULL));

CREATE INDEX community_posts_search_idx ON public.community_posts USING gin (to_tsvector('simple'::regconfig, ((((COALESCE(title, ''::text) || ' '::text) || COALESCE(body, ''::text)) || ' '::text) || COALESCE(author_name, ''::text))));

CREATE INDEX community_posts_type_created_idx ON public.community_posts USING btree (type, created_at DESC);

CREATE INDEX cp_created_idx ON public.community_posts USING btree (created_at DESC);

CREATE INDEX conv_a_idx ON public.conversations USING btree (participant_a, last_message_at DESC);

CREATE INDEX conv_b_idx ON public.conversations USING btree (participant_b, last_message_at DESC);

CREATE UNIQUE INDEX conversations_pair_subject_uidx ON public.conversations USING btree (participant_a, participant_b, COALESCE(subject_id, ''::text));

CREATE INDEX conversations_participant_a_idx ON public.conversations USING btree (participant_a);

CREATE INDEX conversations_participant_b_idx ON public.conversations USING btree (participant_b);

CREATE INDEX conversations_subject_owner_idx ON public.conversations USING btree (subject_owner_id, subject_type, subject_id) WHERE (subject_owner_id IS NOT NULL);

CREATE INDEX conversations_unread_a_idx ON public.conversations USING btree (participant_a) WHERE has_unread_a;

CREATE INDEX conversations_unread_b_idx ON public.conversations USING btree (participant_b) WHERE has_unread_b;

CREATE INDEX custom_payments_owner_idx ON public.custom_payments USING btree (target_owner_user_id);

CREATE INDEX custom_payments_payer_idx ON public.custom_payments USING btree (payer_user_id);

CREATE INDEX custom_payments_pending_idx ON public.custom_payments USING btree (target_id) WHERE (status = 'PENDING_CONFIRM'::text);

CREATE INDEX custom_payments_target_idx ON public.custom_payments USING btree (target_id);

CREATE INDEX delivery_batches_agent_idx ON public.delivery_batches USING btree (agent_user_id);

CREATE INDEX delivery_batches_business_idx ON public.delivery_batches USING btree (business_id);

CREATE INDEX ec_owner_idx ON public.emergency_contacts USING btree (owner_user_id);

CREATE INDEX emergency_contacts_contact_user_idx ON public.emergency_contacts USING btree (contact_user_id);

CREATE INDEX endorsements_from_idx ON public.endorsements USING btree (from_user_id);

CREATE INDEX endorsements_provider_idx ON public.endorsements USING btree (provider_id, skill);

CREATE INDEX follows_follower_idx ON public.follows USING btree (follower_user_id);

CREATE INDEX follows_target_idx ON public.follows USING btree (target_type, target_id);

CREATE INDEX gate_passes_issued_by_idx ON public.gate_passes USING btree (issued_by_user_id);

CREATE INDEX idx_gate_passes_provider ON public.gate_passes USING btree (provider_user_id);

CREATE INDEX idx_gate_passes_society ON public.gate_passes USING btree (society_id);

CREATE INDEX group_buy_tokens_agreement_idx ON public.group_buy_tokens USING btree (agreement_id);

CREATE INDEX group_buy_tokens_holder_idx ON public.group_buy_tokens USING btree (holder_user_id);

CREATE UNIQUE INDEX group_buy_tokens_one_per_holder ON public.group_buy_tokens USING btree (agreement_id, holder_user_id);

CREATE INDEX leads_biz_idx ON public.leads USING btree (business_id, created_at DESC);

CREATE INDEX leads_from_user_idx ON public.leads USING btree (from_user_id);

CREATE INDEX leads_prov_idx ON public.leads USING btree (provider_id, created_at DESC);

CREATE INDEX lsr_recipient_idx ON public.live_share_recipients USING btree (recipient_user_id);

CREATE UNIQUE INDEX live_shares_one_active ON public.live_shares USING btree (sharer_user_id) WHERE (status = 'ACTIVE'::text);

CREATE INDEX lsg_owner_idx ON public.location_share_grants USING btree (owner_user_id, status);

CREATE INDEX lsg_requester_idx ON public.location_share_grants USING btree (requester_user_id, status);

CREATE INDEX messages_conversation_idx ON public.messages USING btree (conversation_id, created_at);

CREATE INDEX messages_sender_idx ON public.messages USING btree (sender_id);

CREATE INDEX notif_scope_idx ON public.notifications USING btree (user_id, entity_type, entity_id, is_read);

CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, created_at DESC);

CREATE INDEX offers_business_idx ON public.offers USING btree (business_id);

CREATE INDEX idx_payments_agreement ON public.payments USING btree (agreement_id);

CREATE INDEX idx_payments_order ON public.payments USING btree (razorpay_order_id);

CREATE INDEX payments_payer_idx ON public.payments USING btree (payer_user_id);

CREATE INDEX places_geom_idx ON public.places USING gist (geom);

CREATE INDEX places_status_pending_idx ON public.places USING btree (status) WHERE (status = 'PENDING'::entity_status);

CREATE INDEX places_submitted_by_idx ON public.places USING btree (submitted_by_user_id);

CREATE INDEX poll_votes_user_idx ON public.poll_votes USING btree (user_id);

CREATE INDEX portfolio_items_provider_idx ON public.portfolio_items USING btree (provider_id);

CREATE INDEX pc_post_idx ON public.post_comments USING btree (post_id, created_at);

CREATE INDEX post_comments_author_idx ON public.post_comments USING btree (author_user_id);

CREATE INDEX post_comments_parent_idx ON public.post_comments USING btree (parent_id) WHERE (parent_id IS NOT NULL);

CREATE INDEX post_comments_post_idx ON public.post_comments USING btree (post_id);

CREATE INDEX post_comments_post_pinned_idx ON public.post_comments USING btree (post_id, pinned_at DESC NULLS LAST, created_at);

CREATE INDEX post_likes_user_idx ON public.post_likes USING btree (user_id);

CREATE INDEX post_saves_user_idx ON public.post_saves USING btree (user_id, created_at DESC);

CREATE INDEX pro_payments_user_idx ON public.pro_payments USING btree (user_id);

CREATE INDEX profile_deletion_requests_user_idx ON public.profile_deletion_requests USING btree (user_id);

CREATE INDEX proposal_counters_proposal_idx ON public.proposal_counters USING btree (proposal_id);

CREATE UNIQUE INDEX idx_proposals_active_user ON public.proposals USING btree (request_id, responder_user_id) WHERE (status = 'SUBMITTED'::proposal_status);

CREATE INDEX proposals_request_idx ON public.proposals USING btree (request_id);

CREATE INDEX proposals_responder_entity_idx ON public.proposals USING btree (responder_entity_id) WHERE (responder_entity_id IS NOT NULL);

CREATE INDEX proposals_responder_idx ON public.proposals USING btree (responder_user_id);

CREATE INDEX pkg_provider_idx ON public.provider_packages USING btree (provider_id);

CREATE INDEX provider_view_logs_provider_viewed_idx ON public.provider_view_logs USING btree (provider_id, viewed_at);

CREATE UNIQUE INDEX idx_providers_one_per_user ON public.providers USING btree (user_id);

CREATE INDEX providers_category_idx ON public.providers USING btree (category_id);

CREATE INDEX providers_geom_idx ON public.providers USING gist (geom);

CREATE INDEX idx_push_user ON public.push_subscriptions USING btree (user_id);

CREATE INDEX qna_upvotes_qna_idx ON public.qna_upvotes USING btree (qna_id);

CREATE INDEX qna_upvotes_user_idx ON public.qna_upvotes USING btree (user_id);

CREATE INDEX queue_tokens_business_status ON public.queue_tokens USING btree (business_id, status, created_at);

CREATE INDEX queue_tokens_customer_idx ON public.queue_tokens USING btree (customer_user_id);

CREATE INDEX queue_tokens_live_idx ON public.queue_tokens USING btree (business_id, status) WHERE (status = ANY (ARRAY['WAITING'::text, 'CALLED'::text]));

CREATE UNIQUE INDEX queue_tokens_one_active_per_biz ON public.queue_tokens USING btree (business_id, customer_user_id) WHERE (status = ANY (ARRAY['WAITING'::text, 'CALLED'::text]));

CREATE UNIQUE INDEX ratings_one_per_agreement ON public.ratings USING btree (rater_user_id, agreement_id) WHERE (agreement_id IS NOT NULL);

CREATE INDEX ratings_ratee_idx ON public.ratings USING btree (ratee_type, ratee_id);

CREATE INDEX ratings_rater_idx ON public.ratings USING btree (rater_user_id);

CREATE INDEX reports_reporter_idx ON public.reports USING btree (reporter_user_id);

CREATE INDEX reports_status_idx ON public.reports USING btree (status, created_at DESC);

CREATE INDEX request_me_toos_user_idx ON public.request_me_toos USING btree (user_id);

CREATE INDEX requests_category_idx ON public.requests USING btree (category_id);

CREATE INDEX requests_expires_idx ON public.requests USING btree (expires_at) WHERE (status = 'OPEN'::request_status);

CREATE INDEX requests_geom_idx ON public.requests USING gist (geom);

CREATE INDEX requests_requester_idx ON public.requests USING btree (requester_user_id);

CREATE INDEX requests_status_idx ON public.requests USING btree (status);

CREATE INDEX saved_searches_user_idx ON public.saved_searches USING btree (user_id);

CREATE INDEX settlements_agreement_idx ON public.settlements USING btree (agreement_id);

CREATE INDEX settlements_user_idx ON public.settlements USING btree (user_id, created_at DESC);

CREATE INDEX settlements_with_user_idx ON public.settlements USING btree (with_user_id);

CREATE INDEX societies_admin_user_idx ON public.societies USING btree (admin_user_id);

CREATE INDEX idx_soc_members_society ON public.society_members USING btree (society_id);

CREATE INDEX idx_soc_members_user ON public.society_members USING btree (user_id);

CREATE INDEX stories_expires_idx ON public.stories USING btree (expires_at DESC);

CREATE INDEX stories_geom_idx ON public.stories USING gist (geom);

CREATE INDEX story_views_viewer_idx ON public.story_views USING btree (viewer_user_id);

CREATE INDEX idx_sublog_date ON public.subscription_logs USING btree (log_date);

CREATE INDEX idx_sublog_sub ON public.subscription_logs USING btree (subscription_id);

CREATE INDEX idx_sub_provider ON public.subscriptions USING btree (provider_user_id);

CREATE INDEX idx_sub_requester ON public.subscriptions USING btree (requester_user_id);

CREATE INDEX support_tickets_user_id_idx ON public.support_tickets USING btree (user_id);

CREATE INDEX terms_acceptances_user_idx ON public.terms_acceptances USING btree (user_id);

CREATE INDEX idx_tt_agreement ON public.tracking_tokens USING btree (agreement_id);

CREATE INDEX tracking_tokens_appointment_idx ON public.tracking_tokens USING btree (appointment_id);

CREATE INDEX user_blocks_blocked_idx ON public.user_blocks USING btree (blocked_user_id);

CREATE INDEX user_list_items_list_idx ON public.user_list_items USING btree (list_id);

CREATE INDEX user_lists_user_idx ON public.user_lists USING btree (user_id);

CREATE INDEX user_saved_coupons_offer_idx ON public.user_saved_coupons USING btree (offer_id);

CREATE INDEX user_saved_coupons_user_idx ON public.user_saved_coupons USING btree (user_id);

CREATE INDEX user_stamps_card_idx ON public.user_stamps USING btree (card_id);

CREATE UNIQUE INDEX users_admin_login_id_key ON public.users USING btree (admin_login_id) WHERE (admin_login_id IS NOT NULL);

CREATE INDEX users_alias_search_idx ON public.users USING btree (lower(alias));

CREATE UNIQUE INDEX users_alias_unique ON public.users USING btree (lower(alias)) WHERE ((alias IS NOT NULL) AND (alias <> ''::text));

CREATE INDEX users_society_idx ON public.users USING btree (society_id);

CREATE INDEX vouches_from_idx ON public.vouches USING btree (from_user_id);

CREATE INDEX vouches_provider_idx ON public.vouches USING btree (provider_id);


-- ════════════════════════════════════════════════════════════
-- Policies (public + storage) (211)
-- ════════════════════════════════════════════════════════════

CREATE POLICY insert_own_appeal ON public.account_appeals AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((owner_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY select_own_or_admin_appeal ON public.account_appeals AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((owner_user_id = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (( SELECT auth.uid() AS uid))::text) AND ((u.roles @> ARRAY['admin'::text]) OR (u.roles @> ARRAY['super_admin'::text])))))));

CREATE POLICY update_appeal_admin ON public.account_appeals AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (( SELECT auth.uid() AS uid))::text) AND ((u.roles @> ARRAY['admin'::text]) OR (u.roles @> ARRAY['super_admin'::text]))))));

CREATE POLICY read_agreements ON public.agreements AS PERMISSIVE FOR SELECT TO authenticated
  USING (((( SELECT auth.uid() AS uid) IS NOT NULL) AND ((((( SELECT auth.uid() AS uid))::text = requester_user_id) OR ((( SELECT auth.uid() AS uid))::text = responder_user_id)) OR ((responder_entity_id IS NOT NULL) AND has_business_scope(responder_entity_id, (( SELECT auth.uid() AS uid))::text, 'leads'::text)) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (( SELECT auth.uid() AS uid))::text) AND (u.roles && ARRAY['admin'::text, 'super_admin'::text])))))));

CREATE POLICY write_agreements ON public.agreements AS PERMISSIVE FOR ALL TO PUBLIC
  USING (((requester_user_id = (( SELECT auth.uid() AS uid))::text) OR (responder_user_id = (( SELECT auth.uid() AS uid))::text)))
  WITH CHECK (((requester_user_id = (( SELECT auth.uid() AS uid))::text) OR (responder_user_id = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY appointment_deliveries_select ON public.appointment_deliveries AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'delivery'::text) OR has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'appointments'::text) OR (agent_user_id = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY appointment_items_select ON public.appointment_items AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM appointments a
  WHERE ((a.id = appointment_items.appointment_id) AND (((( SELECT auth.uid() AS uid))::text = a.customer_user_id) OR ((( SELECT auth.uid() AS uid))::text = a.target_owner_user_id))))));

CREATE POLICY appt_insert ON public.appointments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((customer_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY appt_select ON public.appointments AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((((( SELECT auth.uid() AS uid))::text = customer_user_id) OR ((( SELECT auth.uid() AS uid))::text = target_owner_user_id) OR ((target_type = 'BUSINESS'::text) AND has_business_scope(target_id, (( SELECT auth.uid() AS uid))::text, 'appointments'::text))));

CREATE POLICY appt_update ON public.appointments AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((((( SELECT auth.uid() AS uid))::text = customer_user_id) OR ((( SELECT auth.uid() AS uid))::text = target_owner_user_id) OR ((target_type = 'BUSINESS'::text) AND has_business_scope(target_id, (( SELECT auth.uid() AS uid))::text, 'appointments'::text))))
  WITH CHECK ((((( SELECT auth.uid() AS uid))::text = customer_user_id) OR ((( SELECT auth.uid() AS uid))::text = target_owner_user_id) OR ((target_type = 'BUSINESS'::text) AND has_business_scope(target_id, (( SELECT auth.uid() AS uid))::text, 'appointments'::text))));

CREATE POLICY blocked_slots_select ON public.blocked_slots AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY blocked_slots_write ON public.blocked_slots AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((((( SELECT auth.uid() AS uid))::text = target_owner_user_id) OR ((target_type = 'BUSINESS'::text) AND has_business_scope(target_id, (( SELECT auth.uid() AS uid))::text, 'appointments'::text))))
  WITH CHECK ((((( SELECT auth.uid() AS uid))::text = target_owner_user_id) OR ((target_type = 'BUSINESS'::text) AND has_business_scope(target_id, (( SELECT auth.uid() AS uid))::text, 'appointments'::text))));

CREATE POLICY del_bm ON public.bookmarks AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY ins_bm ON public.bookmarks AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_bm ON public.bookmarks AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY ins_boosts ON public.boosts AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.role() AS role) = 'authenticated'::text));

CREATE POLICY read_boosts ON public.boosts AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.role() AS role) = 'authenticated'::text));

CREATE POLICY insert_bug_reports ON public.bug_reports AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.role() AS role) = 'authenticated'::text));

CREATE POLICY select_bug_reports_admin ON public.bug_reports AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (( SELECT auth.uid() AS uid))::text) AND ((u.roles @> ARRAY['admin'::text]) OR (u.roles @> ARRAY['super_admin'::text]))))));

CREATE POLICY update_bug_reports_admin ON public.bug_reports AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (( SELECT auth.uid() AS uid))::text) AND ((u.roles @> ARRAY['admin'::text]) OR (u.roles @> ARRAY['super_admin'::text]))))));

CREATE POLICY read_bulk_deal_pledges ON public.bulk_deal_pledges AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM bulk_deals d
  WHERE ((d.id = bulk_deal_pledges.deal_id) AND has_business_access(d.business_id, (auth.uid())::text)))) OR is_admin((auth.uid())::text)));

CREATE POLICY read_bulk_deal_tokens ON public.bulk_deal_tokens AS PERMISSIVE FOR SELECT TO authenticated
  USING (((holder_user_id = (auth.uid())::text) OR (issuer_user_id = (auth.uid())::text) OR ((business_id IS NOT NULL) AND has_business_access(business_id, (auth.uid())::text)) OR is_admin((auth.uid())::text)));

CREATE POLICY read_bulk_deals ON public.bulk_deals AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((status = 'ACTIVE'::entity_status) OR (owner_user_id = (auth.uid())::text) OR is_admin()));

CREATE POLICY write_bulk_deals ON public.bulk_deals AS PERMISSIVE FOR ALL TO authenticated
  USING (((owner_user_id = (( SELECT auth.uid() AS uid))::text) OR has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'catalog'::text) OR is_admin()))
  WITH CHECK (((owner_user_id = (( SELECT auth.uid() AS uid))::text) OR has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'catalog'::text) OR is_admin()));

CREATE POLICY bas_visible_select ON public.business_access_sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING (((grantee_user_id = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = business_access_sessions.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text))))));

CREATE POLICY blc_owner_select ON public.business_login_credentials AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = business_login_credentials.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text)))));

CREATE POLICY "owner can manage their packages" ON public.business_packages AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM businesses
  WHERE ((businesses.id = business_packages.business_id) AND (businesses.owner_user_id = (( SELECT auth.uid() AS uid))::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM businesses
  WHERE ((businesses.id = business_packages.business_id) AND (businesses.owner_user_id = (( SELECT auth.uid() AS uid))::text)))));

CREATE POLICY "public can read business packages" ON public.business_packages AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY delegated_access_biz_portfolio ON public.business_portfolio_items AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'catalog'::text) OR (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = business_portfolio_items.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text))))))
  WITH CHECK ((has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'catalog'::text) OR (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = business_portfolio_items.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text))))));

CREATE POLICY read_business_portfolio ON public.business_portfolio_items AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY delegated_access_qna ON public.business_qna AS PERMISSIVE FOR ALL TO PUBLIC
  USING (has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'leads'::text))
  WITH CHECK (has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'leads'::text));

CREATE POLICY ins_qna ON public.business_qna AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((asker_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_qna ON public.business_qna AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY upd_qna ON public.business_qna AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = business_qna.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text)))) OR has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'leads'::text)))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = business_qna.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text)))) OR has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'leads'::text)));

CREATE POLICY owner_rw_team_members ON public.business_team_members AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = business_team_members.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = business_team_members.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text)))));

CREATE POLICY view_logs_owner_select ON public.business_view_logs AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.owner_user_id = (( SELECT auth.uid() AS uid))::text))));

CREATE POLICY admin_upd_businesses ON public.businesses AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (( SELECT auth.uid() AS uid))::text) AND ('admin'::text = ANY (users.roles))))) OR has_business_full_access(id, (( SELECT auth.uid() AS uid))::text) OR (owner_user_id = (( SELECT auth.uid() AS uid))::text)))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (( SELECT auth.uid() AS uid))::text) AND ('admin'::text = ANY (users.roles))))) OR has_business_full_access(id, (( SELECT auth.uid() AS uid))::text) OR (owner_user_id = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY del_businesses ON public.businesses AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((owner_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY ins_businesses ON public.businesses AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((owner_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_businesses ON public.businesses AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((((status = 'ACTIVE'::entity_status) AND (owner_enabled = true) AND (deleted_at IS NULL)) OR (owner_user_id = (( SELECT auth.uid() AS uid))::text) OR is_admin()));

CREATE POLICY delegated_access_catalog ON public.catalog_items AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'catalog'::text) OR ((business_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = catalog_items.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text))))) OR ((provider_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM providers p
  WHERE ((p.id = catalog_items.provider_id) AND (p.user_id = (( SELECT auth.uid() AS uid))::text)))))))
  WITH CHECK ((has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'catalog'::text) OR ((business_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = catalog_items.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text))))) OR ((provider_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM providers p
  WHERE ((p.id = catalog_items.provider_id) AND (p.user_id = (( SELECT auth.uid() AS uid))::text)))))));

CREATE POLICY read_catalog_items ON public.catalog_items AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY admin_upd_categories ON public.categories AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (( SELECT auth.uid() AS uid))::text) AND ('admin'::text = ANY (users.roles))))) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (( SELECT auth.uid() AS uid))::text) AND ('admin'::text = ANY (u.roles)))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (( SELECT auth.uid() AS uid))::text) AND ('admin'::text = ANY (users.roles))))));

CREATE POLICY ins_categories ON public.categories AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.role() AS role) = 'authenticated'::text));

CREATE POLICY read_categories ON public.categories AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((status = 'ACTIVE'::entity_status) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (( SELECT auth.uid() AS uid))::text) AND ('admin'::text = ANY (u.roles)))))));

CREATE POLICY ce_admin_read ON public.client_errors AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM users a
  WHERE ((a.id = (( SELECT auth.uid() AS uid))::text) AND ((a.roles @> ARRAY['admin'::text]) OR (a.roles @> ARRAY['super_admin'::text]))))));

CREATE POLICY ce_insert ON public.client_errors AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY delete_own_comment_reaction ON public.comment_reactions AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY insert_own_comment_reaction ON public.comment_reactions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = (( SELECT auth.uid() AS uid))::text) AND can_react_to_comment(comment_id)));

CREATE POLICY read_comment_reactions ON public.comment_reactions AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY update_own_comment_reaction ON public.comment_reactions AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = (( SELECT auth.uid() AS uid))::text))
  WITH CHECK (((user_id = (( SELECT auth.uid() AS uid))::text) AND can_react_to_comment(comment_id)));

CREATE POLICY "Allow insert access to community_posts for authenticated" ON public.community_posts AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((( SELECT auth.role() AS role) = 'authenticated'::text) OR (author_user_id = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY "Allow read access to community_posts for all" ON public.community_posts AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((NOT is_blocked_between(author_user_id)));

CREATE POLICY "Allow update/delete for owners of community_posts" ON public.community_posts AS PERMISSIVE FOR ALL TO PUBLIC
  USING (((( SELECT auth.uid() AS uid))::text = author_user_id))
  WITH CHECK (((( SELECT auth.uid() AS uid))::text = author_user_id));

CREATE POLICY upd_community_posts ON public.community_posts AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((author_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY ins_conversations ON public.conversations AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((participant_a = (( SELECT auth.uid() AS uid))::text) OR (participant_b = (( SELECT auth.uid() AS uid))::text) OR ((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((participant_a = (( SELECT auth.uid() AS uid))::text) OR (participant_b = (( SELECT auth.uid() AS uid))::text)))));

CREATE POLICY read_conversations ON public.conversations AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((participant_a = (( SELECT auth.uid() AS uid))::text) OR (participant_b = (( SELECT auth.uid() AS uid))::text) OR ((participant_a = (( SELECT auth.uid() AS uid))::text) OR (participant_b = (( SELECT auth.uid() AS uid))::text))));

CREATE POLICY upd_conversations ON public.conversations AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((participant_a = (( SELECT auth.uid() AS uid))::text) OR (participant_b = (( SELECT auth.uid() AS uid))::text) OR ((participant_a = (( SELECT auth.uid() AS uid))::text) OR (participant_b = (( SELECT auth.uid() AS uid))::text))))
  WITH CHECK (((participant_a = (( SELECT auth.uid() AS uid))::text) OR (participant_b = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY select_custom_payments ON public.custom_payments AS PERMISSIVE FOR SELECT TO authenticated
  USING (((((auth.uid())::text = payer_user_id) OR ((auth.uid())::text = target_owner_user_id)) OR ((target_type = 'BUSINESS'::text) AND has_business_scope(target_id, (auth.uid())::text, 'appointments'::text)) OR is_admin()));

CREATE POLICY delivery_agent_duty_select ON public.delivery_agent_duty AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM business_access_sessions s
  WHERE ((s.grantee_user_id = delivery_agent_duty.user_id) AND (s.status = 'ACTIVE'::text) AND ((s.expires_at IS NULL) OR (s.expires_at > now())) AND ('delivery'::text = ANY (s.scopes)) AND has_business_scope(s.business_id, (( SELECT auth.uid() AS uid))::text, 'appointments'::text))))));

CREATE POLICY delivery_batches_select ON public.delivery_batches AS PERMISSIVE FOR SELECT TO authenticated
  USING (((agent_user_id = (( SELECT auth.uid() AS uid))::text) OR has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'delivery'::text)));

CREATE POLICY ec_owner_all ON public.emergency_contacts AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((owner_user_id = (( SELECT auth.uid() AS uid))::text))
  WITH CHECK ((owner_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY del_endorsements ON public.endorsements AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((from_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY ins_endorsements ON public.endorsements AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((from_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_endorsements ON public.endorsements AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY own_fcm_tokens ON public.fcm_tokens AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text))
  WITH CHECK ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY del_follows ON public.follows AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((follower_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY ins_follows ON public.follows AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((follower_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_followers_of_user ON public.follows AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((target_type = ANY (ARRAY['USER'::text, 'user'::text])) OR (follower_user_id = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY gp_insert ON public.gate_passes AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM society_members sm
  WHERE ((sm.society_id = sm.society_id) AND (sm.user_id = (( SELECT auth.uid() AS uid))::text) AND (sm.approved = true)))));

CREATE POLICY gp_read ON public.gate_passes AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((((( SELECT auth.uid() AS uid))::text = provider_user_id) OR ((( SELECT auth.uid() AS uid))::text = issued_by_user_id) OR ((( SELECT auth.uid() AS uid))::text = ( SELECT societies.admin_user_id
   FROM societies
  WHERE (societies.id = gate_passes.society_id)))));

CREATE POLICY read_group_buy_tokens ON public.group_buy_tokens AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((holder_user_id = (auth.uid())::text) OR (issuer_user_id = (auth.uid())::text) OR is_admin()));

CREATE POLICY owner_upd_leaderboard_points ON public.leaderboard_points AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY public_sel_leaderboard_points ON public.leaderboard_points AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY ins_leads ON public.leads AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.role() AS role) = 'authenticated'::text));

CREATE POLICY read_leads ON public.leads AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((((business_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = leads.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text))))) OR ((provider_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM providers p
  WHERE ((p.id = leads.provider_id) AND (p.user_id = (( SELECT auth.uid() AS uid))::text)))))));

CREATE POLICY upd_leads ON public.leads AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((((business_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = leads.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text))))) OR ((provider_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM providers p
  WHERE ((p.id = leads.provider_id) AND (p.user_id = (( SELECT auth.uid() AS uid))::text)))))));

CREATE POLICY lsr_read ON public.live_share_recipients AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((recipient_user_id = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM live_shares s
  WHERE ((s.id = live_share_recipients.share_id) AND (s.sharer_user_id = (( SELECT auth.uid() AS uid))::text))))));

CREATE POLICY ls_owner_all ON public.live_shares AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((sharer_user_id = (( SELECT auth.uid() AS uid))::text))
  WITH CHECK ((sharer_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY lsg_delete ON public.location_share_grants AS PERMISSIVE FOR DELETE TO PUBLIC
  USING (((owner_user_id = (( SELECT auth.uid() AS uid))::text) OR (requester_user_id = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY lsg_insert ON public.location_share_grants AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((requester_user_id = (( SELECT auth.uid() AS uid))::text) AND (status = 'PENDING'::text)));

CREATE POLICY lsg_read ON public.location_share_grants AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((owner_user_id = (( SELECT auth.uid() AS uid))::text) OR (requester_user_id = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY lsg_update ON public.location_share_grants AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((owner_user_id = (( SELECT auth.uid() AS uid))::text))
  WITH CHECK ((owner_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY delegated_access_loyalty ON public.loyalty_cards AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((has_business_full_access(business_id, (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = loyalty_cards.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text))))))
  WITH CHECK ((has_business_full_access(business_id, (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = loyalty_cards.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text))))));

CREATE POLICY read_loyalty_cards ON public.loyalty_cards AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY ins_messages ON public.messages AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((((sender_id = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.participant_a = (( SELECT auth.uid() AS uid))::text) OR (c.participant_b = (( SELECT auth.uid() AS uid))::text)))))) OR ((( SELECT auth.role() AS role) = 'authenticated'::text) AND (sender_id = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.participant_a = (( SELECT auth.uid() AS uid))::text) OR (c.participant_b = (( SELECT auth.uid() AS uid))::text))))))));

CREATE POLICY insert_own_messages ON public.messages AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((auth.role() = 'authenticated'::text) AND (sender_id = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.participant_a = (auth.uid())::text) OR (c.participant_b = (auth.uid())::text)) AND (NOT _user_blocks_exists(c.participant_a, c.participant_b)))))));

CREATE POLICY read_conversation_messages ON public.messages AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.participant_a = (( SELECT auth.uid() AS uid))::text) OR (c.participant_b = (( SELECT auth.uid() AS uid))::text))))) OR (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.participant_a = (( SELECT auth.uid() AS uid))::text) OR (c.participant_b = (( SELECT auth.uid() AS uid))::text)))))));

CREATE POLICY delete_own_notifications ON public.notifications AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY insert_notifications ON public.notifications AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.role() AS role) = 'authenticated'::text));

CREATE POLICY read_notif ON public.notifications AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((user_id = (( SELECT auth.uid() AS uid))::text) OR (user_id = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY upd_notif ON public.notifications AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((user_id = (( SELECT auth.uid() AS uid))::text) OR (user_id = (( SELECT auth.uid() AS uid))::text)))
  WITH CHECK (((user_id = (( SELECT auth.uid() AS uid))::text) OR (user_id = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY read_offers ON public.offers AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY write_offers ON public.offers AS PERMISSIVE FOR ALL TO PUBLIC
  USING (((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = offers.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text)))) OR has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'catalog'::text)))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = offers.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text)))) OR has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'catalog'::text)));

CREATE POLICY payments_insert ON public.payments AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((( SELECT auth.uid() AS uid))::text = payer_user_id));

CREATE POLICY payments_own ON public.payments AS PERMISSIVE FOR ALL TO PUBLIC
  USING (((( SELECT auth.uid() AS uid))::text = payer_user_id));

CREATE POLICY insert_places ON public.places AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((submitted_by_user_id = (auth.uid())::text) AND ((status = 'PENDING'::entity_status) OR is_admin())));

CREATE POLICY select_places ON public.places AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((status = 'ACTIVE'::entity_status) OR (submitted_by_user_id = (auth.uid())::text) OR is_admin()));

CREATE POLICY update_places_admin ON public.places AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY update_places_owner ON public.places AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((submitted_by_user_id = (auth.uid())::text))
  WITH CHECK ((submitted_by_user_id = (auth.uid())::text));

CREATE POLICY "Allow insert/update for owners of poll_votes" ON public.poll_votes AS PERMISSIVE FOR ALL TO PUBLIC
  USING (((( SELECT auth.uid() AS uid))::text = user_id))
  WITH CHECK (((( SELECT auth.uid() AS uid))::text = user_id));

CREATE POLICY "Allow read access to poll_votes for all" ON public.poll_votes AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((true OR true));

CREATE POLICY ins_poll_votes ON public.poll_votes AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_portfolio_items ON public.portfolio_items AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY write_portfolio ON public.portfolio_items AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM providers p
  WHERE ((p.id = portfolio_items.provider_id) AND (p.user_id = (( SELECT auth.uid() AS uid))::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM providers p
  WHERE ((p.id = portfolio_items.provider_id) AND (p.user_id = (( SELECT auth.uid() AS uid))::text)))));

CREATE POLICY "Allow read access to post_comments for all" ON public.post_comments AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((true OR true));

CREATE POLICY "Allow update/delete for owners of post_comments" ON public.post_comments AS PERMISSIVE FOR ALL TO PUBLIC
  USING (((( SELECT auth.uid() AS uid))::text = author_user_id))
  WITH CHECK (((( SELECT auth.uid() AS uid))::text = author_user_id));

CREATE POLICY del_post_comments ON public.post_comments AS PERMISSIVE FOR DELETE TO PUBLIC
  USING (((author_user_id = (( SELECT auth.uid() AS uid))::text) OR (author_user_id = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY insert_own_post_comment ON public.post_comments AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((( SELECT auth.role() AS role) = 'authenticated'::text) AND (author_user_id = (( SELECT auth.uid() AS uid))::text) AND can_comment_on_post(post_id)));

CREATE POLICY "Allow insert/delete for owners of post_likes" ON public.post_likes AS PERMISSIVE FOR ALL TO PUBLIC
  USING (((( SELECT auth.uid() AS uid))::text = user_id))
  WITH CHECK (((( SELECT auth.uid() AS uid))::text = user_id));

CREATE POLICY "Allow read access to post_likes for all" ON public.post_likes AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((true OR true));

CREATE POLICY del_post_likes ON public.post_likes AS PERMISSIVE FOR DELETE TO PUBLIC
  USING (((user_id = (( SELECT auth.uid() AS uid))::text) OR (user_id = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY ins_post_likes ON public.post_likes AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((user_id = (( SELECT auth.uid() AS uid))::text) OR ((( SELECT auth.role() AS role) = 'authenticated'::text) AND (user_id = (( SELECT auth.uid() AS uid))::text))));

CREATE POLICY delete_own_post_saves ON public.post_saves AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY insert_own_post_saves ON public.post_saves AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_own_post_saves ON public.post_saves AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY pro_insert ON public.pro_payments AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((( SELECT auth.uid() AS uid))::text = user_id));

CREATE POLICY pro_own ON public.pro_payments AS PERMISSIVE FOR ALL TO PUBLIC
  USING (((( SELECT auth.uid() AS uid))::text = user_id));

CREATE POLICY delete_own_deletion_requests ON public.profile_deletion_requests AS PERMISSIVE FOR DELETE TO PUBLIC
  USING (((user_id = (( SELECT auth.uid() AS uid))::text) OR is_admin()));

CREATE POLICY insert_own_deletion_requests ON public.profile_deletion_requests AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_own_deletion_requests ON public.profile_deletion_requests AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((user_id = (( SELECT auth.uid() AS uid))::text) OR is_admin()));

CREATE POLICY update_deletion_requests_admin ON public.profile_deletion_requests AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (is_admin());

CREATE POLICY "Proposal parties can read counters" ON public.proposal_counters AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((EXISTS ( SELECT 1
   FROM (proposals p
     JOIN requests r ON ((r.id = p.request_id)))
  WHERE ((p.id = proposal_counters.proposal_id) AND ((p.responder_user_id = (( SELECT auth.uid() AS uid))::text) OR (r.requester_user_id = (( SELECT auth.uid() AS uid))::text))))) OR (EXISTS ( SELECT 1
   FROM (proposals p
     JOIN requests r ON ((r.id = p.request_id)))
  WHERE ((p.id = proposal_counters.proposal_id) AND (((( SELECT auth.uid() AS uid))::text = r.requester_user_id) OR ((( SELECT auth.uid() AS uid))::text = p.responder_user_id)))))));

CREATE POLICY pc_insert ON public.proposal_counters AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((by_user_id = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM (proposals p
     JOIN requests r ON ((r.id = p.request_id)))
  WHERE ((p.id = proposal_counters.proposal_id) AND (((( SELECT auth.uid() AS uid))::text = r.requester_user_id) OR ((( SELECT auth.uid() AS uid))::text = p.responder_user_id)))))));

CREATE POLICY accept_proposals ON public.proposals AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = proposals.request_id) AND (r.requester_user_id = (( SELECT auth.uid() AS uid))::text)))) OR (responder_user_id = (( SELECT auth.uid() AS uid))::text)))
  WITH CHECK ((responder_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY ins_proposals ON public.proposals AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((responder_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_proposals ON public.proposals AS PERMISSIVE FOR SELECT TO authenticated
  USING (((responder_user_id = (( SELECT auth.uid() AS uid))::text) OR ((responder_type = 'business'::text) AND has_business_scope(responder_entity_id, (( SELECT auth.uid() AS uid))::text, 'leads'::text)) OR (EXISTS ( SELECT 1
   FROM requests r
  WHERE ((r.id = proposals.request_id) AND (r.requester_user_id = (( SELECT auth.uid() AS uid))::text)))) OR is_admin()));

CREATE POLICY read_packages ON public.provider_packages AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY write_packages ON public.provider_packages AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM providers p
  WHERE ((p.id = provider_packages.provider_id) AND (p.user_id = (( SELECT auth.uid() AS uid))::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM providers p
  WHERE ((p.id = provider_packages.provider_id) AND (p.user_id = (( SELECT auth.uid() AS uid))::text)))));

CREATE POLICY owner_sel_provider_view_logs ON public.provider_view_logs AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM providers
  WHERE ((providers.id = provider_view_logs.provider_id) AND (providers.user_id = (( SELECT auth.uid() AS uid))::text)))));

CREATE POLICY admin_upd_providers ON public.providers AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (( SELECT auth.uid() AS uid))::text) AND ('admin'::text = ANY (users.roles))))) OR (user_id = (( SELECT auth.uid() AS uid))::text)))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = (( SELECT auth.uid() AS uid))::text) AND ('admin'::text = ANY (users.roles))))) OR (user_id = (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY del_providers ON public.providers AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY ins_providers ON public.providers AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_providers ON public.providers AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((((status = 'ACTIVE'::entity_status) AND (owner_enabled = true) AND (deleted_at IS NULL)) OR (user_id = (( SELECT auth.uid() AS uid))::text) OR is_admin()));

CREATE POLICY push_delete ON public.push_subscriptions AS PERMISSIVE FOR DELETE TO PUBLIC
  USING (((( SELECT auth.uid() AS uid))::text = user_id));

CREATE POLICY push_insert ON public.push_subscriptions AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((( SELECT auth.uid() AS uid))::text = user_id));

CREATE POLICY push_own ON public.push_subscriptions AS PERMISSIVE FOR ALL TO PUBLIC
  USING (((( SELECT auth.uid() AS uid))::text = user_id));

CREATE POLICY qna_upvotes_delete ON public.qna_upvotes AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY qna_upvotes_insert ON public.qna_upvotes AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY qna_upvotes_read ON public.qna_upvotes AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY delegated_access_queue_settings ON public.queue_settings AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'queue'::text) OR (business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.owner_user_id = (( SELECT auth.uid() AS uid))::text)))))
  WITH CHECK ((has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'queue'::text) OR (business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.owner_user_id = (( SELECT auth.uid() AS uid))::text)))));

CREATE POLICY queue_settings_select_all ON public.queue_settings AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY delegated_access_queue_tokens ON public.queue_tokens AS PERMISSIVE FOR ALL TO PUBLIC
  USING (has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'queue'::text))
  WITH CHECK (has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'queue'::text));

CREATE POLICY insert_own_queue_token ON public.queue_tokens AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((((( SELECT auth.role() AS role) = 'authenticated'::text) AND (customer_user_id = (( SELECT auth.uid() AS uid))::text)) OR ((( SELECT auth.uid() AS uid) IS NOT NULL) AND (customer_user_id = (( SELECT auth.uid() AS uid))::text))));

CREATE POLICY queue_tokens_owner_update ON public.queue_tokens AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((business_id IN ( SELECT businesses.id
   FROM businesses
  WHERE (businesses.owner_user_id = (( SELECT auth.uid() AS uid))::text))) OR has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'queue'::text) OR ((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((customer_user_id = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = queue_tokens.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text)))) OR has_business_scope(business_id, (( SELECT auth.uid() AS uid))::text, 'queue'::text)))));

CREATE POLICY queue_tokens_select_all ON public.queue_tokens AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((true OR ((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((customer_user_id = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = queue_tokens.business_id) AND (b.owner_user_id = (( SELECT auth.uid() AS uid))::text)))) OR can_manage_business(business_id)))));

CREATE POLICY ins_ratings ON public.ratings AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((rater_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_ratings ON public.ratings AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY upd_ratings ON public.ratings AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((rater_user_id = (auth.uid())::text))
  WITH CHECK ((rater_user_id = (auth.uid())::text));

CREATE POLICY admin_read_reports ON public.reports AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (( SELECT auth.uid() AS uid))::text) AND ('admin'::text = ANY (u.roles))))));

CREATE POLICY admin_upd_reports ON public.reports AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (( SELECT auth.uid() AS uid))::text) AND ('admin'::text = ANY (u.roles))))));

CREATE POLICY ins_reports ON public.reports AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.role() AS role) = 'authenticated'::text));

CREATE POLICY del_me_toos ON public.request_me_toos AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY ins_me_toos ON public.request_me_toos AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_me_toos ON public.request_me_toos AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY del_requests ON public.requests AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((requester_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY ins_requests ON public.requests AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((requester_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_requests ON public.requests AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY upd_requests ON public.requests AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((requester_user_id = (( SELECT auth.uid() AS uid))::text))
  WITH CHECK ((requester_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY saved_searches_all ON public.saved_searches AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text))
  WITH CHECK ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_settlements ON public.settlements AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY soc_insert ON public.societies AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((( SELECT auth.uid() AS uid))::text = admin_user_id));

CREATE POLICY soc_read ON public.societies AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY soc_update ON public.societies AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((( SELECT auth.uid() AS uid))::text = admin_user_id));

CREATE POLICY delete_society_members ON public.society_members AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_society_admin(society_id, (( SELECT auth.uid() AS uid))::text));

CREATE POLICY insert_society_members ON public.society_members AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((user_id = (( SELECT auth.uid() AS uid))::text) OR ((( SELECT auth.uid() AS uid))::text = user_id)));

CREATE POLICY mem_read ON public.society_members AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((( SELECT auth.uid() AS uid))::text = user_id) OR is_society_member(society_id, (( SELECT auth.uid() AS uid))::text)));

CREATE POLICY mem_update ON public.society_members AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((((( SELECT auth.uid() AS uid))::text = ( SELECT societies.admin_user_id
   FROM societies
  WHERE (societies.id = society_members.society_id))) OR is_society_admin(society_id, (( SELECT auth.uid() AS uid))::text)))
  WITH CHECK (is_society_admin(society_id, (( SELECT auth.uid() AS uid))::text));

CREATE POLICY "Allow insert access to stories for authenticated" ON public.stories AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((( SELECT auth.role() AS role) = 'authenticated'::text) OR ((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((owner_type = ANY (ARRAY['business'::text, 'provider'::text])) OR ((owner_type = 'user'::text) AND (user_id = (( SELECT auth.uid() AS uid))::text))))));

CREATE POLICY "Allow read access to stories for all" ON public.stories AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((true OR (expires_at > now())));

CREATE POLICY "Allow update/delete for owners of stories" ON public.stories AS PERMISSIVE FOR ALL TO PUBLIC
  USING (((( SELECT auth.uid() AS uid))::text = user_id))
  WITH CHECK (((( SELECT auth.uid() AS uid))::text = user_id));

CREATE POLICY del_stories ON public.stories AS PERMISSIVE FOR DELETE TO PUBLIC
  USING (((( SELECT auth.role() AS role) = 'authenticated'::text) AND ((owner_type = ANY (ARRAY['business'::text, 'provider'::text])) OR ((owner_type = 'user'::text) AND (user_id = (( SELECT auth.uid() AS uid))::text)))));

CREATE POLICY insert_story_views_viewer ON public.story_views AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((viewer_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_story_views_owner ON public.story_views AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((EXISTS ( SELECT 1
   FROM stories s
  WHERE ((s.id = story_views.story_id) AND (s.user_id = (( SELECT auth.uid() AS uid))::text)))) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (( SELECT auth.uid() AS uid))::text) AND ('admin'::text = ANY (u.roles)))))));

CREATE POLICY update_story_views_viewer ON public.story_views AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((viewer_user_id = (( SELECT auth.uid() AS uid))::text))
  WITH CHECK ((viewer_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY sublog_insert ON public.subscription_logs AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM subscriptions s
  WHERE ((s.id = subscription_logs.subscription_id) AND ((s.requester_user_id = (( SELECT auth.uid() AS uid))::text) OR (s.provider_user_id = (( SELECT auth.uid() AS uid))::text))))));

CREATE POLICY sublog_own ON public.subscription_logs AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM subscriptions s
  WHERE ((s.id = subscription_logs.subscription_id) AND ((s.requester_user_id = (( SELECT auth.uid() AS uid))::text) OR (s.provider_user_id = (( SELECT auth.uid() AS uid))::text))))));

CREATE POLICY sublog_update ON public.subscription_logs AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM subscriptions s
  WHERE ((s.id = subscription_logs.subscription_id) AND ((s.requester_user_id = (( SELECT auth.uid() AS uid))::text) OR (s.provider_user_id = (( SELECT auth.uid() AS uid))::text))))));

CREATE POLICY sub_insert ON public.subscriptions AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((( SELECT auth.uid() AS uid))::text = requester_user_id));

CREATE POLICY sub_own ON public.subscriptions AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((((( SELECT auth.uid() AS uid))::text = requester_user_id) OR ((( SELECT auth.uid() AS uid))::text = provider_user_id)));

CREATE POLICY insert_support_tickets ON public.support_tickets AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.role() AS role) = 'authenticated'::text));

CREATE POLICY select_support_tickets_admin ON public.support_tickets AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (( SELECT auth.uid() AS uid))::text) AND ((u.roles @> ARRAY['admin'::text]) OR (u.roles @> ARRAY['super_admin'::text]))))));

CREATE POLICY update_support_tickets_admin ON public.support_tickets AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = (( SELECT auth.uid() AS uid))::text) AND ((u.roles @> ARRAY['admin'::text]) OR (u.roles @> ARRAY['super_admin'::text]))))));

CREATE POLICY "own terms acceptances readable" ON public.terms_acceptances AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY tt_insert ON public.tracking_tokens AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((( SELECT auth.uid() AS uid))::text IN ( SELECT agreements.requester_user_id
   FROM agreements
  WHERE (agreements.id = tracking_tokens.agreement_id)
UNION
 SELECT agreements.responder_user_id
   FROM agreements
  WHERE (agreements.id = tracking_tokens.agreement_id))));

CREATE POLICY tt_read ON public.tracking_tokens AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY delete_own_blocks ON public.user_blocks AS PERMISSIVE FOR DELETE TO authenticated
  USING ((blocker_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY insert_own_blocks ON public.user_blocks AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((blocker_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_own_blocks ON public.user_blocks AS PERMISSIVE FOR SELECT TO authenticated
  USING ((blocker_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY del_list_items ON public.user_list_items AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM user_lists l
  WHERE ((l.id = user_list_items.list_id) AND (l.user_id = (( SELECT auth.uid() AS uid))::text)))));

CREATE POLICY ins_list_items ON public.user_list_items AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM user_lists l
  WHERE ((l.id = user_list_items.list_id) AND (l.user_id = (( SELECT auth.uid() AS uid))::text)))));

CREATE POLICY read_list_items ON public.user_list_items AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM user_lists l
  WHERE ((l.id = user_list_items.list_id) AND (l.user_id = (( SELECT auth.uid() AS uid))::text)))));

CREATE POLICY del_lists ON public.user_lists AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY ins_lists ON public.user_lists AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_lists ON public.user_lists AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY upd_lists ON public.user_lists AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY del_saved_coupons ON public.user_saved_coupons AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY ins_saved_coupons ON public.user_saved_coupons AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_saved_coupons ON public.user_saved_coupons AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_user_stamps ON public.user_stamps AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY write_user_stamps ON public.user_stamps AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((user_id = (( SELECT auth.uid() AS uid))::text))
  WITH CHECK ((user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY ins_users ON public.users AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_users ON public.users AS PERMISSIVE FOR SELECT TO authenticated
  USING (((( SELECT auth.role() AS role) = 'authenticated'::text) AND (((customer_enabled = true) AND (customer_deleted_at IS NULL)) OR (id = (( SELECT auth.uid() AS uid))::text) OR is_admin((( SELECT auth.uid() AS uid))::text))));

CREATE POLICY upd_users ON public.users AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((id = (( SELECT auth.uid() AS uid))::text) OR (id = (( SELECT auth.uid() AS uid))::text)))
  WITH CHECK ((id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY del_vouches ON public.vouches AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((from_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY ins_vouches ON public.vouches AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((from_user_id = (( SELECT auth.uid() AS uid))::text));

CREATE POLICY read_vouches ON public.vouches AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);

CREATE POLICY "User scoped delete" ON storage.objects AS PERMISSIVE FOR DELETE TO PUBLIC
  USING (((bucket_id = 'uploads'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "User scoped insert" ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((bucket_id = 'uploads'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "User scoped update" ON storage.objects AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((bucket_id = 'uploads'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY verification_docs_owner_insert ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((bucket_id = 'verification-docs'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));


-- ════════════════════════════════════════════════════════════
-- Table grants (API roles) (260)
-- ════════════════════════════════════════════════════════════

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.account_appeals TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.account_appeals TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.account_appeals TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_login_resolve_attempts TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.agreements TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.agreements TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.appointment_deliveries TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.appointment_deliveries TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.appointment_deliveries TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.appointment_items TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.appointment_items TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.appointments TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.appointments TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.blocked_slots TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.blocked_slots TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.blocked_slots TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bookmarks TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bookmarks TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bookmarks TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.boosts TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.boosts TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.boosts TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bug_reports TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bug_reports TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bug_reports TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bulk_deal_pledges TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bulk_deal_pledges TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bulk_deal_pledges TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bulk_deal_tokens TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bulk_deal_tokens TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bulk_deal_tokens TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bulk_deals TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bulk_deals TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bulk_deals TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_access_sessions TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_access_sessions TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_login_attempts TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_login_credentials TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_login_credentials TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_packages TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_packages TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_packages TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_portfolio_items TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_portfolio_items TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_portfolio_items TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_qna TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_qna TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_qna TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_team_members TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_team_members TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_team_members TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_view_logs TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_view_logs TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.business_view_logs TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.businesses TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.businesses TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.businesses TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.catalog_items TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.catalog_items TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.catalog_items TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.categories TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.categories TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.categories TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.client_errors TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.client_errors TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.client_errors TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.comment_reactions TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.comment_reactions TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.comment_reactions TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.community_posts TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.community_posts TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.community_posts TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.conversations TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.conversations TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.conversations TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.custom_payments TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.custom_payments TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.custom_payments TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.delivery_agent_duty TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.delivery_agent_duty TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.delivery_agent_duty TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.delivery_batches TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.delivery_batches TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.delivery_batches TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.emergency_contacts TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.emergency_contacts TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.emergency_contacts TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.endorsements TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.endorsements TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.endorsements TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.entity_password_attempts TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.entity_recovery_attempts TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.fcm_tokens TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.fcm_tokens TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.fcm_tokens TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.follows TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.follows TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.follows TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.gate_passes TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.gate_passes TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.gate_passes TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.geography_columns TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.geography_columns TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.geography_columns TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.geometry_columns TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.geometry_columns TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.geometry_columns TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.group_buy_tokens TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.group_buy_tokens TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.group_buy_tokens TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.handoff_attempts TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.leaderboard_points TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.leaderboard_points TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.leaderboard_points TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.leads TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.leads TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.leads TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.live_share_recipients TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.live_share_recipients TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.live_share_recipients TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.live_shares TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.live_shares TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.live_shares TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.location_share_grants TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.location_share_grants TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.location_share_grants TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.loyalty_cards TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.loyalty_cards TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.loyalty_cards TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.messages TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.messages TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.messages TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.notifications TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.notifications TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.notifications TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.offers TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.offers TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.offers TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payments TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payments TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.places TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.places TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.places TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.poll_votes TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.poll_votes TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.poll_votes TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.portfolio_items TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.portfolio_items TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.portfolio_items TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.post_comments TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.post_comments TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.post_comments TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.post_likes TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.post_likes TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.post_likes TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.post_saves TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.post_saves TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.post_saves TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.pro_payments TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.pro_payments TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.pro_payments TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.profile_deletion_requests TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.profile_deletion_requests TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.profile_deletion_requests TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.proposal_counters TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.proposal_counters TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.proposals TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.proposals TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.proposals TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.provider_packages TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.provider_packages TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.provider_packages TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.provider_view_logs TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.provider_view_logs TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.provider_view_logs TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.providers TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.providers TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.providers TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.push_subscriptions TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.push_subscriptions TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.push_subscriptions TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.qna_upvotes TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.qna_upvotes TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.qna_upvotes TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.queue_settings TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.queue_settings TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.queue_settings TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.queue_tokens TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.queue_tokens TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.queue_tokens TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ratings TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ratings TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ratings TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reports TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reports TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.reports TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.request_me_toos TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.request_me_toos TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.request_me_toos TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.requests TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.requests TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.requests TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.saved_searches TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.saved_searches TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.saved_searches TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.settlements TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.settlements TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.settlements TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.societies TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.societies TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.societies TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.society_members TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.society_members TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.society_members TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.spatial_ref_sys TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.spatial_ref_sys TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.spatial_ref_sys TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stories TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stories TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.stories TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.story_views TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.story_views TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.story_views TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.subscription_logs TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.subscription_logs TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.subscription_logs TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.subscriptions TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.subscriptions TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.subscriptions TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.support_tickets TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.support_tickets TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.support_tickets TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.switch_pin_attempts TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.terms_acceptances TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.terms_acceptances TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.terms_acceptances TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tracking_tokens TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tracking_tokens TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tracking_tokens TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_blocks TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_blocks TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_blocks TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_list_items TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_list_items TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_list_items TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_lists TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_lists TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_lists TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_saved_coupons TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_saved_coupons TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_saved_coupons TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_stamps TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_stamps TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_stamps TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.users TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.users TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.users TO service_role;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.vouches TO anon;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.vouches TO authenticated;

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.vouches TO service_role;


-- ════════════════════════════════════════════════════════════
-- Realtime publication (34)
-- ════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE public.agreements;

ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;

ALTER PUBLICATION supabase_realtime ADD TABLE public.bug_reports;

ALTER PUBLICATION supabase_realtime ADD TABLE public.business_access_sessions;

ALTER PUBLICATION supabase_realtime ADD TABLE public.business_qna;

ALTER PUBLICATION supabase_realtime ADD TABLE public.business_team_members;

ALTER PUBLICATION supabase_realtime ADD TABLE public.business_view_logs;

ALTER PUBLICATION supabase_realtime ADD TABLE public.businesses;

ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;

ALTER PUBLICATION supabase_realtime ADD TABLE public.comment_reactions;

ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;

ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

ALTER PUBLICATION supabase_realtime ADD TABLE public.endorsements;

ALTER PUBLICATION supabase_realtime ADD TABLE public.gate_passes;

ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_shares;

ALTER PUBLICATION supabase_realtime ADD TABLE public.location_share_grants;

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_votes;

ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;

ALTER PUBLICATION supabase_realtime ADD TABLE public.proposal_counters;

ALTER PUBLICATION supabase_realtime ADD TABLE public.proposals;

ALTER PUBLICATION supabase_realtime ADD TABLE public.provider_view_logs;

ALTER PUBLICATION supabase_realtime ADD TABLE public.providers;

ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_settings;

ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_tokens;

ALTER PUBLICATION supabase_realtime ADD TABLE public.ratings;

ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;

ALTER PUBLICATION supabase_realtime ADD TABLE public.requests;

ALTER PUBLICATION supabase_realtime ADD TABLE public.society_members;

ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;

ALTER PUBLICATION supabase_realtime ADD TABLE public.story_views;

ALTER PUBLICATION supabase_realtime ADD TABLE public.vouches;


-- ════════════════════════════════════════════════════════════
-- Sequences (0)
-- ════════════════════════════════════════════════════════════




-- ════════════════════════════════════════════════════════════
-- Migration ledger (supabase_migrations.schema_migrations) (132)
-- ════════════════════════════════════════════════════════════

-- 20260604044649  create_ratings_table

-- 20260604044700  r3_categories_insert_policy

-- 20260604045218  r4_chat_schema

-- 20260604060617  r5_community_schema

-- 20260604062514  r6_rating_aggregate_trigger

-- 20260604071103  r7_proposal_accept_rls_and_metoo_table

-- 20260604071204  r7_proposals_denormalized_names

-- 20260604082100  r8_notifications_bookmarks_follows_lists

-- 20260604082125  r9_stories_available_now_vouches_endorsements_leaderboard

-- 20260604085218  r10_wallet_loyalty_coupons_settlements

-- 20260604092127  r11_advanced_business_provider

-- 20260604133505  chat_subject_context

-- 20260606122828  create_queue_tables

-- 20260606123933  view_logs_and_bump_metric_update

-- 20260606125905  phase1_spatial_rls_defaults

-- 20260606130340  add_broadcast_radius_to_businesses

-- 20260606132503  provider_view_logs_and_bump_metric_update

-- 20260606132807  agreement_status_enum_extend

-- 20260606133308  community_posts_geo_columns

-- 20260606133315  create_increment_stamp_rpc

-- 20260606133318  create_leaderboard_points

-- 20260606133345  community_posts_nearby_rpc

-- 20260606142607  create_proposal_counters

-- 20260606182700  user_stories_and_location

-- 20260608135150  trust_layer

-- 20260608151140  payments_and_push_subscriptions

-- 20260608153448  societies_subscriptions_pro_escrow

-- 20260608173708  neighborhood_today_rpc

-- 20260609064736  mvp_one_per_owner_cap

-- 20260609065801  poll_votes_unique_constraint

-- 20260619211046  stryt_accept_proposal_and_tracking_rpcs

-- 20260619211149  stryt_restrict_accept_proposal_to_authenticated

-- 20260620232131  kyc_docs_columns

-- 20260620232721  alias_and_comment_phone_share

-- 20260708230119  push_on_notification_insert_vault

-- 20260708235012  business_remote_login_tables

-- 20260708235024  business_can_manage_helper

-- 20260708235101  business_remote_login_rpcs

-- 20260708235248  business_delegate_rls_policies

-- 20260708235407  business_login_pgcrypto_searchpath_fix

-- 20260708235502  business_login_attempt_ambiguity_fix

-- 20260709001422  business_access_approval_notifications

-- 20260709002643  business_login_id_policy_and_suggest

-- 20260709003726  business_access_pending_expiry_and_realtime

-- 20260709003745  business_access_cron_expiry

-- 20260709005335  business_access_30s_and_decide_guard

-- 20260709010418  business_owner_grant_by_identifier

-- 20260710064635  appointment_reschedule_notifications

-- 20260710070445  app_updates_bucket

-- 20260712165551  close_anon_default_privilege_gap

-- 20260713052901  live_location_sharing

-- 20260713055613  remove_sos

-- 20260714064406  client_error_sink

-- 20260715005519  show_name_publicly

-- 20260715221110  booking_and_deal_integrity

-- 20260715221123  drop_weak_proposal_counters_insert_policy

-- 20260715231342  business_login_rate_limit

-- 20260715234512  fix_business_login_rate_limit_transactionality

-- 20260716143758  booking_and_rpc_security

-- 20260716174044  queue_single_active_token

-- 20260716175946  agreement_cancel_and_expiry

-- 20260716195932  businesses_nearby_anon_grant

-- 20260717110255  security_advisor_hardening

-- 20260718065631  switch_pin

-- 20260718065651  walk_in_payment_claim

-- 20260718065900  fix_switch_pin_search_path

-- 20260718070055  rate_limit_switch_pin_change

-- 20260718123122  20260828_switch_pin

-- 20260718123140  20260829_walk_in_payment_claim

-- 20260718123157  20260830_fix_switch_pin_search_path

-- 20260718123213  20260831_rate_limit_switch_pin_change

-- 20260718231957  20260832_community_comment_gating

-- 20260719000831  20260833_business_location_review

-- 20260719002152  20260834_appointment_holds_and_deposit

-- 20260720100432  20260835_appointment_line_items_and_inventory

-- 20260720100532  20260836_request_flow_fixes

-- 20260720100603  20260837_community_post_authoring

-- 20260720100628  20260838_appointment_notification_fixes

-- 20260720100740  20260835b_drop_stale_appointment_create_overloads

-- 20260720195624  notification_metadata

-- 20260720195723  notification_trigger_search_path_hardening

-- 20260723204627  grant_execute_business_scope_helpers

-- 20260723221323  backfill_and_default_user_alias

-- 20260724042150  enforce_business_location_freeze

-- 20260724204816  delivery_agent_phase1_groundwork

-- 20260724212910  delivery_agent_phase2_my_deliveries

-- 20260724214039  delivery_agent_phase3_handoff_and_tracking

-- 20260727000118  entity_passwords

-- 20260727012648  delivery_phase4_a_schema

-- 20260727012742  delivery_phase4_b_batch_rpcs

-- 20260727012823  delivery_phase4_c_appointment_create_tracking

-- 20260727014456  home_delivery_toggle_and_eta

-- 20260727015435  business_active_deliveries_rpc

-- 20260727015744  customer_delivery_progress_only

-- 20260727020455  revoke_anon_on_delivery_rpcs

-- 20260727023259  slot_capacity_and_party_size

-- 20260727023318  booked_slots_with_usage

-- 20260727023908  appointment_create_party_size

-- 20260727024940  revoke_anon_resolve_slot_capacity

-- 20260727083249  entity_password_recovery_a_schema_helpers

-- 20260727084849  entity_password_recovery_b_rpcs

-- 20260727092003  fix_dup_notification_and_party_size_propagation

-- 20260727100208  reschedule_restore_guards_with_party_size

-- 20260727101232  walk_in_party_size

-- 20260727201514  20260858_appointment_create_accepting_guard

-- 20260728191904  20260859_notification_preferences

-- 20260728230009  business_special_hours

-- 20260728230342  rating_owner_reply

-- 20260729003136  delivery_agent_duty

-- 20260729003155  business_active_deliveries_agent_position

-- 20260729003215  confirm_handoff_rate_limit

-- 20260729182515  discovery_radius_removal

-- 20260801203450  delivery_cancellation

-- 20260801203922  delivery_solo_position

-- 20260801204038  delivery_scope_grantable

-- 20260801204811  delivery_batch_in_progress

-- 20260801205454  revoke_anon_on_batch_trigger_fn

-- 20260801215939  stop_seeding_contact_as_name

-- 20260801222158  entity_status_add_deleted

-- 20260801222236  delete_business

-- 20260801222555  delete_business_fix_live_statuses

-- 20260802153014  launch_security_hardening

-- 20260802234218  complete_appointment_on_delivery

-- 20260803130720  index_unindexed_foreign_keys

-- 20260803130747  drop_duplicate_indexes

-- 20260803130919  rls_initplan_wrap_auth_calls

-- 20260803131135  consolidate_multiple_permissive_policies

-- 20260803192757  revoke_anon_execute

-- 20260804084705  revoke_public_execute_definer_fns

-- 20260804201927  push_trigger_apikey_header

-- 20260910184238  out_of_range_appointment_requests

-- 20260911004544  20260957_queue_waiting_line


-- ════════════════════════════════════════════════════════════
-- Cron jobs (3)
-- ════════════════════════════════════════════════════════════

-- cron job close-expired-bulk-deals  schedule=*/10 * * * *  active=t
-- select public.close_expired_bulk_deals();

-- cron job close-expired-business-sessions  schedule=* * * * *  active=t
-- select public.close_expired_business_sessions()

-- cron job notify-ended-polls  schedule=*/10 * * * *  active=t
-- select public.notify_ended_polls();
