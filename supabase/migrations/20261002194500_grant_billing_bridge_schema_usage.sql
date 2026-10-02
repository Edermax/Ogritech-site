-- The restricted bridge uses security_invoker, so service_role needs schema usage.
grant usage on schema private to service_role;
notify pgrst, 'reload schema';
