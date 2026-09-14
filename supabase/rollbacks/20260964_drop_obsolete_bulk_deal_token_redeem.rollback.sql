-- Rollback: 20260964_drop_obsolete_bulk_deal_token_redeem.rollback.sql
-- Description: Re-create obsolete 1-argument bulk_deal_token_redeem(text) overload verbatim from catalog snapshot.

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
$function$;

REVOKE ALL ON FUNCTION public.bulk_deal_token_redeem(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_deal_token_redeem(text) TO authenticated, postgres, service_role;
