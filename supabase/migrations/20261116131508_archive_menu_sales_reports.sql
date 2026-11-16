-- Keep the unique period record so the daily scheduler cannot recreate a cleared report.
-- Only administrative SQL can archive reports; application roles retain their existing grants.
alter table private.menu_sales_reports add column archived_at timestamptz;

-- Preserve the existing offer and authorization guards while hiding archived periods.
do $archive_reports$
declare target regprocedure; definition text; patched text;
begin
 target:='private.menu_sales_reports(uuid)'::regprocedure;
 definition:=pg_get_functiondef(target);
 patched:=replace(definition,
  'from private.menu_sales_reports where barbershop_id=target_barbershop_id',
  'from private.menu_sales_reports where barbershop_id=target_barbershop_id and archived_at is null');
 if patched=definition then raise exception 'Sales report list anchor missing'; end if;
 execute patched;

 target:='private.menu_sales_report(uuid,uuid)'::regprocedure;
 definition:=pg_get_functiondef(target);
 patched:=replace(definition,
  'where id=target_report_id and barbershop_id=target_barbershop_id;',
  'where id=target_report_id and barbershop_id=target_barbershop_id and archived_at is null;');
 if patched=definition then raise exception 'Sales report detail anchor missing'; end if;
 execute patched;
end $archive_reports$;

