# Task 10 — Free-Choice Improvements

After Tasks 1–9, spend remaining effort on high-leverage, low-risk improvements
that make STRYT more production-grade. Candidates (pick by value ÷ risk):

## Reliability / correctness
- [ ] Google import: only overwrite EMPTY fields (never clobber owner-entered
      data with an OSM placeholder like `9876543210`); drop obviously-synthetic
      values.
- [ ] Add the missing `VITE_GOOGLE_MAPS_API_KEY` wiring note + graceful "Google
      unavailable, using OpenStreetMap" messaging so the source is honest.
- [ ] Rotate/relocate the exposed Supabase `service_role` key (still in git
      history) — flagged repeatedly; document rotation steps.

## Security hardening
- [ ] Run `get_advisors` (security + performance) and fix the cheap wins
      (missing RLS, function search_path, unindexed FKs).
- [ ] Confirm no RLS policy references an un-granted function (the class of bug
      that broke the toggles) — add a guard query to CI or a doc check.

## UX polish (Apple-grade)
- [ ] Consistent empty/loading/error states across manage consoles.
- [ ] Haptics + optimistic UI already present in queue — extend to appointments.
- [ ] Auto-scroll business photos on public profile (previously requested).
- [ ] Broadcast radius easily settable by business + provider (previously
      requested).

## Housekeeping
- [ ] Remove leftover `.git/COMMIT_EDITMSG_TMP` noise; ensure `.env*`/`.vercel`
      ignored (done).
- [ ] Tidy dynamic-import warnings (done) and keep the build warning-clean.

Document what was actually done in a short `DONE_SUMMARY.md` at the end.
