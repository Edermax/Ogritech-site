-- Transport and recovery scheduler; secrets/jobs are configured separately.
-- Supabase documents pg_cron in pg_catalog and pg_net in extensions.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
