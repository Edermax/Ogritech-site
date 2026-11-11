param(
  [Parameter(Mandatory = $true)][ValidateSet('staging','production')][string]$Environment,
  [Parameter(Mandatory = $true)][string]$CliPath,
  [switch]$Apply,
  [switch]$Initialize,
  [switch]$Enable
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$projectRef = if ($Environment -eq 'production') { 'mvzcoaiiwytycdqcvydf' } else { 'fuesdztsvrkkgnbqhcxi' }
$privatePath = Join-Path $repo 'private'
$backupPath = Join-Path $privatePath "menu-order-push-$Environment.dpapi"
if (-not $Apply) {
  Write-Host "Preflight: $Environment ($projectRef), envio habilitado=$($Enable.IsPresent). Nenhuma chave ou configuração alterada."
  Write-Host 'Requer migration aplicada, pg_net, pg_cron e Vault. -Initialize cria as chaves somente na primeira configuração.'
  exit 0
}
New-Item -ItemType Directory -Force -Path $privatePath | Out-Null
if (Test-Path -LiteralPath $backupPath) {
  $secure = (Get-Content -Raw -LiteralPath $backupPath).Trim() | ConvertTo-SecureString
  $plain = [System.Net.NetworkCredential]::new('', $secure).Password
} else {
  if (-not $Initialize) { throw 'Backup das chaves ausente. Use -Initialize apenas para a primeira configuração. Não substitua chaves existentes no servidor.' }
  $plain = & node -e "const c=require('crypto'); const k=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'}); const j=k.privateKey.export({format:'jwk'}); const p=Buffer.concat([Buffer.from([4]),Buffer.from(j.x,'base64url'),Buffer.from(j.y,'base64url')]).toString('base64url'); process.stdout.write(JSON.stringify({publicKey:p,privateJwk:j,secret:c.randomBytes(32).toString('hex')}));"
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível gerar as chaves.' }
  $plain | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $backupPath -Encoding utf8
}
$keys = $plain | ConvertFrom-Json
if ($keys.publicKey -notmatch '^[A-Za-z0-9_-]{87}$' -or $keys.secret -notmatch '^[a-f0-9]{64}$') { throw 'Backup de chaves inválido.' }
$suffix = [guid]::NewGuid().ToString('N')
$envPath = Join-Path $privatePath ".order-push-$suffix.env"
$sqlPath = Join-Path $privatePath ".order-push-$suffix.sql"
$enabled = if ($Enable) { 'true' } else { 'false' }
$jwk = $keys.privateJwk | ConvertTo-Json -Compress
$url = "https://$projectRef.supabase.co/functions/v1/menu-order-push-dispatch"
try {
  @"
MENU_ORDER_PUSH_PUBLIC_KEY=$($keys.publicKey)
MENU_ORDER_PUSH_PRIVATE_JWK='$jwk'
MENU_ORDER_PUSH_DISPATCH_SECRET=$($keys.secret)
MENU_ORDER_PUSH_CONTACT=mailto:suporte@ogritech.com.br
MENU_ORDER_PUSH_ENABLED=$enabled
"@ | Set-Content -LiteralPath $envPath -Encoding utf8
  @"
do `$config`$
declare target_id uuid;
begin
  if to_regprocedure('private.wake_menu_order_push_dispatch()') is null then raise exception 'Aplique a migration primeiro'; end if;
  select id into target_id from vault.secrets where name='menu_order_push_dispatch_url';
  if target_id is null then perform vault.create_secret('$url','menu_order_push_dispatch_url');
  else perform vault.update_secret(target_id,'$url'); end if;
  select id into target_id from vault.secrets where name='menu_order_push_dispatch_secret';
  if target_id is null then perform vault.create_secret('$($keys.secret)','menu_order_push_dispatch_secret');
  else perform vault.update_secret(target_id,'$($keys.secret)'); end if;
end `$config`$;
select cron.schedule('menu-order-push-dispatch','* * * * *','select private.wake_menu_order_push_dispatch()');
"@ | Set-Content -LiteralPath $sqlPath -Encoding utf8
  & $CliPath secrets set --env-file $envPath --project-ref $projectRef
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao configurar os secrets.' }
  $configurationResult = & $CliPath db query --linked --project-ref $projectRef --file $sqlPath 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao configurar Vault/agendamento. Desative o envio até corrigir a configuração.' }
  Write-Host "Notificações configuradas em $Environment; envio habilitado=$enabled. Backup protegido pelo usuário Windows em private/."
} finally {
  foreach ($temporaryPath in @($envPath,$sqlPath)) {
    if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath -Force }
  }
  $plain = $null; $keys = $null; $jwk = $null
}
