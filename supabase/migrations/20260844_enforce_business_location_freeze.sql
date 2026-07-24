-- Business location freeze (server-enforced). Complements migration
-- 20260833 (pending_lat/lng + review status) and the client-side guard in
-- businessService.update() which strips lat/lng. This trigger makes the freeze
-- real at the DB level: businesses.lat/lng can only change when the caller is
-- an admin (the approveLocationChange flow) or the service_role. Any other
-- UPDATE that tries to move the pin is rejected, so a raw PostgREST call can't
-- bypass admin review or push a device location onto the shop. INSERT is
-- unaffected (create() sets the initial location legitimately). Idempotent.
CREATE OR REPLACE FUNCTION public.enforce_business_location_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (NEW.lat IS DISTINCT FROM OLD.lat OR NEW.lng IS DISTINCT FROM OLD.lng) THEN
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Business location is frozen — submit a location change for admin approval';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_business_location_freeze ON public.businesses;
CREATE TRIGGER trg_enforce_business_location_freeze
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_business_location_freeze();
