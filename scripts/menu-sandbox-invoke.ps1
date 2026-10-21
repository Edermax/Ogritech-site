param([Parameter(Mandatory)][ValidateSet('e2e_status','e2e_replay','e2e_cancel')][string]$Action)
$ErrorActionPreference='Stop'
$qaKeysRaw = & .\node_modules\.bin\supabase.cmd projects api-keys --project-ref fuesdztsvrkkgnbqhcxi --reveal --output json 2>$null
if($LASTEXITCODE -ne 0){throw 'Administrative authentication unavailable'}
$qaKeys=($qaKeysRaw -join "`n")|ConvertFrom-Json
$qaJwt=($qaKeys|Where-Object {$_.name -eq 'service_role'}).api_key
$qaSecret=($qaKeys|Where-Object {$_.type -eq 'secret' -and $_.name -eq 'default'}).api_key
try {
 $qaResponse=Invoke-WebRequest -Uri 'https://fuesdztsvrkkgnbqhcxi.supabase.co/functions/v1/menu-sandbox-qa' -Method Post -ContentType 'application/json' -Headers @{Authorization=('Bearer '+$qaJwt);'x-qa-admin-key'=$qaSecret} -Body (@{action=$Action}|ConvertTo-Json -Compress) -SkipHttpErrorCheck
 [PSCustomObject]@{status=[int]$qaResponse.StatusCode;body=($qaResponse.Content|ConvertFrom-Json)}|ConvertTo-Json -Depth 8
} finally {$qaKeysRaw=$null;$qaKeys=$null;$qaJwt=$null;$qaSecret=$null}
