-- Richer "Places to Visit" profile — practical visit info + safety content.
-- All nullable/additive, no existing row or query breaks. Emergency contact
-- numbers (112/100/1091) are NOT stored here — they're fixed, verified,
-- national numbers rendered client-side, not per-row data that could go
-- stale or be entered wrong for something people might call in a real
-- emergency.

alter table public.places
  add column if not exists best_time_to_visit text,
  add column if not exists entry_fee text,
  add column if not exists opening_hours text,
  add column if not exists visit_duration text,
  add column if not exists difficulty text check (difficulty is null or difficulty in ('EASY','MODERATE','HARD')),
  add column if not exists how_to_reach text,
  add column if not exists parking_info text,
  add column if not exists distance_from_city_km numeric(5,1),
  add column if not exists safety_tips text,
  add column if not exists weather_note text;
