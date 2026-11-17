-- Function-qualified PL/pgSQL parameters must follow the helper's new name.
do $patch$ declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.backend_catalog_offer_change_claim_before_reauthorization(uuid,text,timestamptz,text)'::regprocedure);
 patched:=replace(definition,'backend_catalog_offer_change_claim.target_cycle','backend_catalog_offer_change_claim_before_reauthorization.target_cycle');
 if patched=definition then raise exception 'Renamed cycle claim parameter anchor missing'; end if;
 execute patched;
end $patch$;
