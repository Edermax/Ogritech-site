-- Keep privilege elevation outside the exposed PostgREST schema.
alter function public.platform_menu_trial_reviews() set schema private;
alter function public.platform_decide_menu_trial_review(uuid,text,text) set schema private;

create or replace function private.platform_menu_trial_reviews() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(review) order by (review.status='pending') desc,
   case when review.status='pending' then review.created_at end asc,review.created_at desc) from
  (select id,business_name,contact_email,document_last_four,phone_last_four,reasons,status,decision_note,created_at,approved_until
   from private.menu_trial_reviews order by (status='pending') desc,
    case when status='pending' then created_at end asc,created_at desc limit 100) review),'[]'::jsonb);
end $$;

create function public.platform_menu_trial_reviews() returns jsonb
language sql security invoker set search_path='' as $$ select private.platform_menu_trial_reviews() $$;
create function public.platform_decide_menu_trial_review(target_review_id uuid,decision text,reason text) returns void
language sql security invoker set search_path='' as $$ select private.platform_decide_menu_trial_review(target_review_id,decision,reason) $$;

revoke all on function public.platform_menu_trial_reviews(),public.platform_decide_menu_trial_review(uuid,text,text),
 private.platform_menu_trial_reviews(),private.platform_decide_menu_trial_review(uuid,text,text) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function public.platform_menu_trial_reviews(),public.platform_decide_menu_trial_review(uuid,text,text),
 private.platform_menu_trial_reviews(),private.platform_decide_menu_trial_review(uuid,text,text) to authenticated;
