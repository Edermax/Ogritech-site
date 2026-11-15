-- A historical ledger entry must never authorize a second payout after the provider reversed it.
do $guard$ declare definition text; patched text;
begin
 definition:=pg_get_functiondef('private.prepare_subscription_refund(uuid,jsonb)'::regprocedure);
 patched:=replace(definition,' select * into strict invoice from public.platform_invoices where id=payment.invoice_id;',
 ' if payment.provider=''mercado_pago'' and exists(select 1 from private.billing_payment_intents original where original.provider_payment_id=payment.provider_payment_id and (original.status<>''approved'' or original.amount_cents<>(payment.gross_amount*100)::integer)) then raise exception ''O pagamento original foi estornado ou diverge do financeiro. Concilie-o antes de preparar uma nova devolução.'' using errcode=''23514''; end if;
 select * into strict invoice from public.platform_invoices where id=payment.invoice_id;');
 if patched=definition then raise exception 'Refund original-payment anchor missing'; end if;execute patched;
 definition:=pg_get_functiondef('private.subscription_finance(uuid)'::regprocedure);
 patched:=replace(definition,'and p.status in (''approved'',''partially_refunded'')',
 'and not exists(select 1 from private.billing_payment_intents original where p.provider=''mercado_pago'' and original.provider_payment_id=p.provider_payment_id and (original.status<>''approved'' or original.amount_cents<>(p.gross_amount*100)::integer)) and p.status in (''approved'',''partially_refunded'')');
 patched:=replace(patched,'''id'',t.id,''status'',t.status,',
 '''id'',t.id,''status'',t.status,''payment_valid'',not exists(select 1 from public.platform_payments original_payment join private.billing_payment_intents original on original_payment.provider=''mercado_pago'' and original.provider_payment_id=original_payment.provider_payment_id where original_payment.id=r.payment_id and (original.status<>''approved'' or original.amount_cents<>(original_payment.gross_amount*100)::integer)),');
 if patched=definition then raise exception 'Refund candidate anchor missing'; end if;execute patched;
end $guard$;
notify pgrst,'reload schema';
