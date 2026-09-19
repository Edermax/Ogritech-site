-- Corrige a autorização: SECURITY DEFINER troca current_user pelo proprietário.
-- A fronteira permanece no EXECUTE concedido exclusivamente a service_role.
create or replace function private.record_menu_ai_staging_event(target_slug text,target_session_token text,target_message_hash text,target_route text,target_outcome text,target_provider text,target_model text,target_latency_ms integer,target_input_tokens integer,target_output_tokens integer,target_estimated_cost_micros integer)
returns bigint language plpgsql security definer set search_path=''
as $$
declare menu public.online_menus; event_id bigint;
begin
  if length(coalesce(target_session_token,'')) not between 20 and 120 or target_session_token !~ '^[A-Za-z0-9_-]+$' or target_message_hash !~ '^[a-f0-9]{64}$' or target_route not in ('deterministic','model','fallback') or target_outcome not in ('accepted','rejected','timeout','invalid_output','provider_error','budget_blocked','kill_switch') or target_latency_ms not between 0 and 120000 or target_input_tokens not between 0 and 100000 or target_output_tokens not between 0 and 100000 or target_estimated_cost_micros not between 0 and 100000000 then raise exception 'Telemetria inválida' using errcode='22023'; end if;
  select * into menu from public.online_menus where slug=target_slug and published;
  if menu.id is null then raise exception 'Cardápio indisponível' using errcode='22023'; end if;
  insert into private.menu_ai_staging_events(barbershop_id,menu_id,session_hash,message_hash,route,outcome,provider,model,latency_ms,input_tokens,output_tokens,estimated_cost_micros)
  values(menu.barbershop_id,menu.id,encode(extensions.digest(menu.id::text||':'||target_session_token,'sha256'),'hex'),target_message_hash,target_route,target_outcome,target_provider,target_model,target_latency_ms,target_input_tokens,target_output_tokens,target_estimated_cost_micros)
  returning id into event_id;
  return event_id;
end;
$$;
revoke all on function private.record_menu_ai_staging_event(text,text,text,text,text,text,text,integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function private.record_menu_ai_staging_event(text,text,text,text,text,text,text,integer,integer,integer,integer) to service_role;
