-- Wrapper invoker: a implementação privada mantém a autorização do gestor.
grant execute on function private.business_plan_capacity(uuid) to authenticated;
