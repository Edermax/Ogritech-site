param([switch]$Cleanup)
$ErrorActionPreference='Stop'
# Fixed staging destination. Credentials and user sessions stay in process memory.
$project='fuesdztsvrkkgnbqhcxi'
$base="https://$project.supabase.co"
$shop='b8100000-0000-4000-8000-000000000001'
$client='b8300000-0000-4000-8000-000000000001'
$evidence='docs/evidencias/menu-branding-staging-smoke.json'
$fixtureCommitted=$false
$sqlFile='.tmp-menu-branding-fixture.sql'
function Query([string]$Sql) {
  [IO.File]::WriteAllText((Join-Path $PWD $sqlFile),$Sql)
  $ErrorActionPreference='Continue'
  $result=& .\node_modules\.bin\supabase.cmd db query --linked --project-ref $project --file $sqlFile --output json 2>&1
  $ErrorActionPreference='Stop'
  if($LASTEXITCODE -ne 0){throw ("SQL fixture: "+($result -join "`n"))}
}
try {
  $ErrorActionPreference='Continue'
  $raw=& .\node_modules\.bin\supabase.cmd projects api-keys --project-ref $project --reveal --output json 2>$null
  $ErrorActionPreference='Stop'
  if($LASTEXITCODE -ne 0){throw 'Não foi possível obter acesso ao staging.'}
  $keys=($raw -join "`n")|ConvertFrom-Json
  $admin=($keys|Where-Object name -eq 'service_role').api_key
  $anon=($keys|Where-Object name -eq 'anon').api_key
  $adminHeaders=@{apikey=$admin;Authorization="Bearer $admin"}
  if($Cleanup){
    $proof=Get-Content $evidence -Raw|ConvertFrom-Json
    if($proof.project -ne $project -or $proof.shop -ne $shop){throw 'Fixture inesperada.'}
    $user=[guid]::Parse($proof.user).ToString()
    Invoke-RestMethod "$base/storage/v1/object/menu-images" -Method Delete -Headers $adminHeaders -ContentType 'application/json' -Body (@{prefixes=@($proof.logo,$proof.cover)}|ConvertTo-Json) | Out-Null
    Query "begin; delete from public.online_menus where barbershop_id='$shop'; delete from public.platform_subscriptions where billing_customer_id in (select id from public.billing_customers where saas_client_id='$client'); delete from public.billing_customers where saas_client_id='$client'; delete from public.saas_clients where id='$client'; delete from public.profiles where id='$user'; delete from public.barbershops where id='$shop'; commit;"
    Invoke-RestMethod "$base/auth/v1/admin/users/$user" -Method Delete -Headers $adminHeaders|Out-Null
    $proof|Add-Member -NotePropertyName cleanedAt -NotePropertyValue ([datetime]::UtcNow.ToString('o')) -Force
    $proof|ConvertTo-Json -Depth 5|Set-Content $evidence
    Write-Output 'Fixture visual removida do staging.'
    return
  }
  $password=[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')+'aA9!'
  $email="branding-$([guid]::NewGuid().ToString('N'))@example.com"
  try {
  $created=Invoke-RestMethod "$base/auth/v1/admin/users" -Method Post -Headers $adminHeaders -ContentType 'application/json' -Body (@{email=$email;password=$password;email_confirm=$true}|ConvertTo-Json)
  } catch {
    $problem=$_.ErrorDetails.Message|ConvertFrom-Json; throw "Auth fixture: $($problem.code) $($problem.error_code) $($problem.msg) $($problem.message)"
  }
  $user=[guid]::Parse($created.id).ToString()
  $fixture=Get-Content 'supabase/tests/database/menu-branding.test.sql' -Raw -Encoding UTF8
  $fixture=$fixture.Substring(0,$fixture.IndexOf('reset role;'))
  $fixture=$fixture -replace 'select extensions.no_plan\(\);',''
  $fixture=[regex]::Replace($fixture, 'select extensions.lives_ok\(\$\$(.*?)\$\$,''[^'']*''\);', '$1;')
  $fixture=$fixture -replace '(?s)insert into auth.users.*?now\(\),now\(\)\);',''
  $fixture=$fixture -replace '(?m)^insert into public.barbershops.*b7100000-0000-4000-8000-000000000002.*[\r\n]*',''
  $fixture=$fixture.Replace('b7100000','b8100000').Replace('b7300000','b8300000').Replace('b7200000-0000-4000-8000-000000000001',$user).Replace('branding-fixture','branding-visual-smoke')
  $fixture += "reset role; delete from public.platform_admins where user_id='$user'; commit;"
  Query $fixture
  $fixtureCommitted=$true
  $logo="$shop/$([guid]::NewGuid()).jpg"; $cover="$shop/$([guid]::NewGuid()).jpg"
  @{project=$project;shop=$shop;user=$user;logo=$logo;cover=$cover;status="IN_PROGRESS"}|ConvertTo-Json|Set-Content $evidence
  $session=Invoke-RestMethod "$base/auth/v1/token?grant_type=password" -Method Post -Headers @{apikey=$anon} -ContentType 'application/json' -Body (@{email=$email;password=$password}|ConvertTo-Json)
  $ownerHeaders=@{apikey=$anon;Authorization="Bearer $($session.access_token)"}
  function Branding([string]$Action,$Payload=@{}) {
    Invoke-RestMethod "$base/rest/v1/rpc/menu_branding" -Method Post -Headers $ownerHeaders -ContentType 'application/json' -Body (@{target_barbershop_id=$shop;action=$Action;payload=$Payload}|ConvertTo-Json -Depth 8)
  }
  foreach($entry in @(@{path=$logo;file='assets/diniz-doces/logo.jpg'},@{path=$cover;file='assets/diniz-doces/bolo-de-corte.jpg'})){
    Invoke-RestMethod "$base/storage/v1/object/menu-images/$($entry.path)" -Method Post -Headers $ownerHeaders -ContentType 'image/jpeg' -InFile $entry.file|Out-Null
  }
  $saved=Branding 'save' @{primary_color='#ffffff';accent_color='#a52150';logo_path=$logo;cover_path=$cover}
  if($saved.identity.logo_path -ne $logo){throw 'Logo não foi persistido.'}
  Query "update public.online_menus set published=true,published_at=now() where barbershop_id='$shop';"
  $draft=Branding 'save' @{primary_color='#291a34';accent_color='#ffc857';logo_path=$logo;cover_path=$cover}
  $public=Invoke-RestMethod "$base/rest/v1/rpc/public_menu" -Method Post -Headers @{apikey=$anon} -ContentType 'application/json' -Body '{"target_slug":"branding-visual-smoke-menu"}'
  if(-not $draft.has_draft -or $public.menu.visual_identity.primary_color -ne '#ffffff'){throw 'Rascunho vazou para o público.'}
  $published=Branding 'publish'
  $public=Invoke-RestMethod "$base/rest/v1/rpc/public_menu" -Method Post -Headers @{apikey=$anon} -ContentType 'application/json' -Body '{"target_slug":"branding-visual-smoke-menu"}'
  if($public.menu.visual_identity.primary_color -ne '#291a34' -or $public.menu.visual_identity.cover_path -ne $cover){throw 'Publicação incompleta.'}
  $bytes=Invoke-WebRequest "$base/storage/v1/object/public/menu-images/$cover" -UseBasicParsing
  if($bytes.StatusCode -ne 200){throw 'Capa pública indisponível.'}
  @{project=$project;shop=$shop;user=$user;logo=$logo;cover=$cover;testedAt=[datetime]::UtcNow.ToString('o');upload='PASS';draftIsolation='PASS';publication='PASS';publicImage='PASS';preview='http://127.0.0.1:8088/cardapio/?env=staging&empresa=branding-visual-smoke-menu'}|ConvertTo-Json|Set-Content $evidence
  Write-Output 'PASS: upload real, rascunho isolado, publicação e imagem pública. Fixture pronta para inspeção visual.'
} catch {
  if($user -and -not $fixtureCommitted -and -not $Cleanup){
    try { Invoke-RestMethod "$base/auth/v1/admin/users/$user" -Method Delete -Headers $adminHeaders|Out-Null } catch {}
  }
  throw
} finally {
  $keys=$null;$raw=$null;$admin=$null;$anon=$null;$adminHeaders=$null;$ownerHeaders=$null;$session=$null;$password=$null
  if(Test-Path $sqlFile){Remove-Item -LiteralPath $sqlFile}
}

