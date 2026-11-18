"""Concurrent inventory requests in a task-owned database. Never reset the source DB."""
from pathlib import Path
import subprocess, os, concurrent.futures, time, json, re
ROOT=Path(__file__).resolve().parent.parent
CONTAINER=os.environ.get('OGRITECH_STOCK_TEST_CONTAINER','supabase_db_ogritech-local')
DB='ogritech_stock_race_'+str(os.getpid())
def command(*args,data=None,check=True):
 r=subprocess.run(['docker','exec','-i',CONTAINER,*args],input=data,capture_output=True)
 if check and r.returncode: raise RuntimeError(r.stderr.decode()[-2500:])
 return r
def sql(text,check=True):
 return command('psql','-X','-U','supabase_admin','-d',DB,'-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',data=text.encode(),check=check)
TENANT='cd100000-0000-4000-8000-000000000001'
ITEM='cd600000-0000-4000-8000-000000000001'
AUTH="set local role authenticated;select set_config('request.jwt.claims','{\"sub\":\"cd800000-0000-4000-8000-000000000001\",\"role\":\"authenticated\"}',true);"
def move(op,qty,version,key):
 return AUTH+f"select public.catalog_stock_command('{TENANT}','{ITEM}','{op}',{qty},'Contagem concorrente','{key}',{version});"
def order(key):
 return f"select public.public_create_menu_order_v2('inventory-fixture','Cliente ficticio','','11988887777','pickup',null,'','[{{\"menu_item_price_id\":\"cd700000-0000-4000-8000-000000000001\",\"quantity\":1}}]',true,'{key}');"
def balance():return int(sql('select quantity from private.catalog_stock').stdout.strip())
def race(first,second,expected_error=None):
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  a=pool.submit(sql,"begin;set application_name='stock_race_first';"+first+'select pg_sleep(1.5);commit;')
  for _ in range(60):
   found=sql("select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.datname=current_database() and a.application_name='stock_race_first' and l.locktype='advisory' and l.granted").stdout.strip()
   if found!=b'0':break
   time.sleep(.03)
  else:raise AssertionError('First transaction never acquired the stock lock')
  b=pool.submit(sql,'begin;'+second+'commit;',False)
  a.result();result=b.result()
 if expected_error:assert result.returncode and expected_error.encode() in result.stderr,result.stderr.decode()
 else:assert result.returncode==0,result.stderr.decode()
created=False
try:
 command('createdb','-U','postgres',DB);created=True
 dump=command('pg_dump','-U','supabase_admin','-d','postgres','--schema-only','--no-owner','--exclude-extension=pg_cron','--exclude-schema=cron').stdout
 command('psql','-X','-U','supabase_admin','-d',DB,'-v','ON_ERROR_STOP=1',data=dump)
 reference=command('pg_dump','-U','supabase_admin','-d','postgres','--data-only','--no-owner','--table=public.platform_products','--table=public.saas_plans','--table=public.menu_catalog_templates').stdout
 command('psql','-X','-U','supabase_admin','-d',DB,'-v','ON_ERROR_STOP=1',data=reference)
 sql('create schema if not exists cron;create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;')
 # CI starts with a full supabase db reset; the offline runner already has this migration.
 # Every source table stays untouched and the clone is dropped in finally.
 fixture=(ROOT/'supabase/tests/database/catalog-inventory.test.sql').read_text(encoding='utf8').split('-- Helpers')[0]
 fixture=re.sub(r"select extensions.lives_ok\(\$\$(.*?)\$\$,'[^']*'\);",lambda m:m.group(1)+';',fixture,flags=re.S)
 fixture='\n'.join(line for line in fixture.splitlines() if not line.startswith(('begin;','select extensions.')))
 sql('begin;'+fixture+move('enable',1,0,'ce900000-0000-4000-8000-000000000001')+'commit;')
 race(order('ce900000-0000-4000-8000-000000000002'),order('ce900000-0000-4000-8000-000000000003'),'23514')
 assert balance()==0
 assert int(sql('select count(*) from private.catalog_stock_allocations').stdout.strip())==1
 assert int(sql('select count(*) from public.menu_orders where not is_test').stdout.strip())==1
 # Repeating an identical request in two sessions makes one entry, not two.
 version=int(sql('select version from private.catalog_stock').stdout.strip())
 repeat=move('entry',3,version,'ce900000-0000-4000-8000-000000000004')
 race(repeat,repeat);assert balance()==3
 assert int(sql("select count(*) from private.catalog_stock_movements where kind='entry'").stdout.strip())==1
 # Two manual forms based on the same version cannot silently overwrite each other.
 version=int(sql('select version from private.catalog_stock').stdout.strip())
 race(move('adjust',1,version,'ce900000-0000-4000-8000-000000000005'),move('adjust',2,version,'ce900000-0000-4000-8000-000000000006'),'40001')
 assert balance()==1
 print(json.dumps({'checks':['last unit sold once','failed checkout leaves no orphan order','concurrent retry adds units once','stale physical count rejected'],'passed':True}))
finally:
 if created:command('dropdb','-U','postgres','--force',DB)
