// Isolated local database only. Never reset or change the running application's DB.
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const container='ogritech-catalog-validation-20261117',database='postgres';
const out='outputs/catalog-review';fs.mkdirSync(out,{recursive:true});
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:64*1024*1024});if(r.status!==0)throw new Error((r.stderr||r.stdout||r.error?.message||'docker failed').slice(-3500));return r.stdout;}
function sql(input){return docker(['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],input);}
if(process.argv.includes('--reset-isolated')){
 if(docker(['inspect',container,'--format','{{.HostConfig.NetworkMode}}']).trim()!=='none')throw new Error('Refusing reset outside the isolated offline container.');
 sql('drop schema if exists private,public,auth,storage,supabase_migrations cascade;create schema public;grant usage on schema public to anon,authenticated,service_role;');
}
if(process.argv.includes('--prepare')||process.argv.includes('--reset-isolated')){
 if(docker(['exec',container,'psql','-U','postgres','-d',database,'-Atc',"select count(*) from pg_tables where schemaname in ('public','storage')"]).trim()!=='0')throw new Error('Isolated database is populated; use --migrate or --test.');
 const base=docker(['exec','supabase_db_ogritech-local','pg_dump','-U','postgres','-d','postgres','--schema-only','--no-owner','--no-privileges','--schema=auth','--schema=storage']);
 // Source storage policies/auth triggers refer to app functions that do not exist yet.
 // Replay application migrations after importing only the service-owned base schemas.
 const serviceBase=base.replace(/^CREATE SCHEMA /gm,'CREATE SCHEMA IF NOT EXISTS ').replace(/^CREATE POLICY [\s\S]*?;\r?\n/gm,'').replace(/^CREATE TRIGGER [\s\S]*?;\r?\n/gm,'');
 sql('begin;\n'+serviceBase+'\ngrant usage on schema auth,storage to anon,authenticated,service_role;\ncommit;');fs.writeFileSync(path.join(out,'local-bootstrap.txt'),'Empty service-owned auth/storage schemas only; source application policies/triggers excluded; all application migrations replayed separately.\n');
}
if(process.argv.includes('--prepare')||process.argv.includes('--reset-isolated')||process.argv.includes('--migrate')){
 const authFunctions=docker(['exec','supabase_db_ogritech-local','psql','-U','postgres','-d','postgres','-Atc',"select pg_get_functiondef(p.oid)||';' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' and p.proname in ('uid','role','jwt')"]);
 sql(authFunctions);
 sql('create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key);');
 const applied=new Set(sql('select version from supabase_migrations.schema_migrations;').match(/\b\d{8,14}\b/g)||[]);
 for(const file of fs.readdirSync('supabase/migrations').filter(n=>/^\d+.*\.sql$/.test(n)).sort((a,b)=>a.split('_')[0].padEnd(14,'0').localeCompare(b.split('_')[0].padEnd(14,'0')))){
  const version=file.split('_')[0];if(applied.has(version))continue;
  const source=fs.readFileSync(path.join('supabase/migrations',file),'utf8');
  try{sql(`begin;\n${source}\ninsert into supabase_migrations.schema_migrations(version) values ('${version}');\ncommit;`);process.stdout.write(file+' OK\n');}
  catch(error){fs.writeFileSync(path.join(out,'database-error.txt'),file+'\n'+error.message);throw error;}
 }
}
if(process.argv.includes('--refresh-functions')){
 if(docker(['inspect',container,'--format','{{.HostConfig.NetworkMode}}']).trim()!=='none')throw new Error('Refusing local function refresh outside isolated container.');
 const source=fs.readFileSync('supabase/migrations/20261117132401_catalog_profiles_and_commercial_plans.sql','utf8');
 const definitions=source.match(/create(?: or replace)? function [\s\S]*?\$\$;/gi)||[];
 sql('begin;\n'+definitions.map(text=>text.replace(/^create function /i,'create or replace function ')).join('\n')+'\ncommit;');
}
const testFile=process.argv.find(arg=>arg.startsWith('--test-file='))?.slice('--test-file='.length);
if(process.argv.includes('--test')||testFile){
 let count=0,assertions=0,failures=[];
 for(const file of fs.readdirSync('supabase/tests/database').filter(n=>n.endsWith('.sql')&&(!testFile||n===testFile)).sort()){
  let result;try{result=sql(fs.readFileSync(path.join('supabase/tests/database',file),'utf8'));}
  catch(error){failures.push(file);fs.writeFileSync(path.join(out,'db-'+file+'.log'),error.message);console.error('DBFAIL '+file+': '+error.message.slice(0,500));continue;}
  fs.writeFileSync(path.join(out,'db-'+file+'.log'),result);
  if(/not ok \d|Looks like you failed|Looks like you planned/.test(result)){failures.push(file);console.error('DBFAIL '+file+': pgTAP assertion failure');}
  assertions+=(result.match(/\bok \d+/g)||[]).length;count++;
 }
 console.log(JSON.stringify({database,files:count,assertions,failures}));if(failures.length)process.exitCode=1;
}
