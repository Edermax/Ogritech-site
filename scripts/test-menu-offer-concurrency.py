"""Exercise separate PostgreSQL sessions in a task-owned clone; never modify the source DB."""
from pathlib import Path
import subprocess, os, concurrent.futures, time, json
ROOT = Path(__file__).resolve().parent.parent
CONTAINER = "supabase_db_ogritech-local"
DB = "ogritech_offer_concurrency_" + str(os.getpid())
created = False

def command(*args, data=None, check=True):
    result = subprocess.run(["docker", "exec", "-i", CONTAINER, *args], input=data, capture_output=True)
    if check and result.returncode: raise RuntimeError(result.stderr.decode()[-1800:])
    return result

def sql(statement, check=True):
    return command("psql", "-U", "supabase_admin", "-d", DB, "-At", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", data=statement.encode(), check=check)

def race(first, second, sqlstate="23514", reservation=False):
    # The first session holds the same advisory lock used by the invariant. A second
    # session cannot pass the lock until the first transaction is visible.
    lock_filter = "l.locktype='relation' and l.relation='private.menu_offer_changes'::regclass and l.mode='RowExclusiveLock'" if reservation else "l.locktype='advisory'"
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(sql, "BEGIN;set application_name='menu_offer_race_first';" + first + ";select pg_sleep(2);COMMIT;")
        for attempt in range(25):
            locked = sql(f"select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.datname=current_database() and a.application_name='menu_offer_race_first' and {lock_filter} and l.granted").stdout.decode().strip()
            if locked != "0": break
            time.sleep(0.05)
        else: raise AssertionError("First transaction did not reach the contact guard")
        b = pool.submit(sql, "BEGIN;" + second + ";COMMIT;", False)
        a.result()
        result = b.result()
    assert result.returncode != 0 and sqlstate.encode() in result.stderr, result.stderr.decode()

TENANT = "dd100000-0000-4000-8000-000000000001"
MENU = "dd400000-0000-4000-8000-000000000001"
SIGNUP = "dd300000-0000-4000-8000-000000000001"
def change(offer):
    return f"select public.backend_billing_change_offer('{TENANT}','{offer}',(select updated_at from private.billing_signups where id='{SIGNUP}'))"

def phone(value):
    return f"update public.online_menus set whatsapp_phone='{value}' where id='{MENU}'"

try:
    command("createdb", "-U", "postgres", DB)
    created = True
    dump = command("pg_dump", "-U", "supabase_admin", "-d", "postgres", "-Fc", "--exclude-extension=pg_cron", "--exclude-schema=cron").stdout
    restored = command("pg_restore", "-U", "supabase_admin", "--no-owner", "--no-privileges", "-d", DB, data=dump, check=False)
    if restored.returncode:
        raise RuntimeError(restored.stderr.decode()[:2600])
    # Schedulers are intentionally inert in the clone; the unmodified SQL suite tests real pg_cron.
    sql("create schema if not exists cron;create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;")
    names = sql("select name from supabase_migrations.schema_migrations").stdout.decode().splitlines()
    pending = [f for f in sorted((ROOT/"supabase/migrations").glob("*.sql")) if f.stem.split("_",1)[1] not in names]
    sql("BEGIN;" + "\n".join(f.read_text(encoding="utf-8").replace("create extension if not exists pg_cron with schema pg_catalog;", "") for f in pending) + "COMMIT;")
    fixture = (ROOT/"supabase/tests/database/split-menu-offers.test.sql").read_text(encoding="utf-8").split("create temporary table offers_original_boundary")[0]
    fixture = "\n".join(line for line in fixture.splitlines() if not line.startswith(("begin;", "select extensions.")))
    sql("BEGIN;" + fixture + f"delete from public.business_whatsapp_shares where barbershop_id='{TENANT}';" + phone("5511999999999") + f";update public.online_menus set published=true,published_at=now() where id='{MENU}';COMMIT;")
    race(phone(""), change("cardapio"))
    sql(phone("5511999999999"))
    race(change("cardapio"), phone(""))
    sql(f"insert into public.business_whatsapp_shares(barbershop_id,phone) values('{TENANT}','5511988887777')")
    race(phone(""), f"update public.business_whatsapp_shares set phone=null where barbershop_id='{TENANT}'")
    state = sql(f"select private.menu_offer('{TENANT}'),public.public_menu('offers-fixture')->'menu'->>'whatsapp_phone'").stdout.decode().strip()
    assert state == "cardapio|5511988887777", state
    claim = f"select public.backend_billing_offer_change_claim('{TENANT}','encomendas',(select updated_at from private.billing_signups where id='{SIGNUP}'))"
    race(claim, claim, "55000", True)
    print(json.dumps({"concurrentContactRaces":3,"concurrentReservationRaces":1,"passed":True,"sourceDatabaseModified":False}))
finally:
    if created:
        command("dropdb", "-U", "postgres", DB)
