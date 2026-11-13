-- Ledger repair, 2026-10-27 — owner runs this once in the production SQL editor (project gnswxlfmcwyhmzlfipql).
--
-- 20260999 … 20261009 are live in production but were applied outside apply_migration, so
-- supabase_migrations.schema_migrations stops at 20260998 (see supabase/APPLY_LOG.md, Status). This records them.
-- Versions are synthetic, ordered by apply date; statements hold a pointer and the file hash, not the SQL — the same
-- shape `supabase migration repair --status applied` writes. Re-running is a no-op (matched by name).
--
-- After a later migration is applied by hand, add its row the same way. Check with:
--   select version, name, created_by from supabase_migrations.schema_migrations order by version desc limit 15;

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
select v.version, v.name,
       array['-- Ledger repair 2026-10-27: applied outside apply_migration (supabase/APPLY_LOG.md). Source: supabase/migrations/'
             || v.name || '.sql sha256 ' || v.sha],
       'ledger-repair-2026-10-27'
from (values
  ('20261020000001', '20260999_otp_funnel_events',        '66abf878c14c45b643e13f0bd5c6a5f357f70282bdf85230307d216d3f7065b6'),
  ('20261020000002', '20261000_auth_lockdown_hooks',      '14f4da21bca4304d62de35e7fc80328eac331e26f28bc6f5a28c2cd4268a2197'),
  ('20261020000003', '20261001_business_delivery_terms',  'dcdb93afb89692b3c7f4f6737a91a3c60ef7be58e3cbcca86a1a8849819f9cda'),
  ('20261020000004', '20261002_delivery_integrity',       '6f0a091eec6654193d00fefe01146e953fde9bbefacce38000565fa8b70630fa'),
  ('20261020000005', '20261003_delivery_operations',      'a9249974d8c3cb1c27e31bb7e470a26abace76fcb1cb98d759d6fed486a4d875'),
  ('20261022000001', '20261004_delivery_followups',       '11e61049aae09265c92730dc3a3f5c0b2a070509dcc1469a80710975196c8269'),
  ('20261022000002', '20261005_delivery_order_lifecycle', 'c8a851dd3cc713ff5504bdf7e2fc03fb47912ce03f4fc54575b2408c80bedd23'),
  ('20261022155200', '20261006_team_access_fixes',        '8c8650a40235a51eee3b280059a058bdd2c1ec0396713968f8f27498c395b865'),
  ('20261023000001', '20261007_instore_order_items',      'c85264df11bfa26303daaaa9c052d7afb7b62abbc753547530b087232cc67708'),
  ('20261027000001', '20261008_stories_complete',         '6869106509325ac63c552ddd48130ec1cea8b67a197b634aa95ed6b13bea0fb6'),
  ('20261027000002', '20261009_analytics_v1',             '3601cc13a6a09b2b1d3f7d488b56b221557f211bc0a2dc63c84564de824727f5')
) v(version, name, sha)
where not exists (select 1 from supabase_migrations.schema_migrations m where m.name = v.name)
returning version, name;
