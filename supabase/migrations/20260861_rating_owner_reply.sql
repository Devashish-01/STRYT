-- Business/provider owner replies to a review. ReviewsManager.tsx's "Post
-- reply" button used to only flip local React state (never persisted, gone
-- on refresh) — this adds the real column + a SECURITY DEFINER RPC so only
-- the rated business's/provider's own owner can write a reply to their row.
--
-- APPLIED TO PRODUCTION via mcp__supabase__apply_migration as `rating_owner_reply`.
alter table public.ratings
  add column if not exists owner_reply text,
  add column if not exists owner_reply_at timestamptz;

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
  v_rating public.ratings%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if length(trim(coalesce(p_reply, ''))) < 2 then raise exception 'REPLY_TOO_SHORT'; end if;

  select ratee_type, ratee_id into v_ratee_type, v_ratee_id
  from public.ratings where id = p_rating_id;
  if not found then raise exception 'RATING_NOT_FOUND'; end if;

  if v_ratee_type = 'BUSINESS' then
    select owner_user_id into v_owner from public.businesses where id = v_ratee_id;
  elsif v_ratee_type = 'PROVIDER' then
    select user_id into v_owner from public.providers where id = v_ratee_id;
  else
    raise exception 'NOT_REPLYABLE';
  end if;

  if v_owner is null or v_owner != v_uid then raise exception 'FORBIDDEN'; end if;

  update public.ratings
  set owner_reply = left(trim(p_reply), 2000), owner_reply_at = now()
  where id = p_rating_id
  returning * into v_rating;

  return v_rating;
end
$function$;

REVOKE EXECUTE ON FUNCTION public.reply_to_rating(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reply_to_rating(text, text) TO authenticated;
