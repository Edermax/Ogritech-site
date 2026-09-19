param(
  [Parameter(Mandatory = $true)][string]$ProjectRef,
  [Parameter(Mandatory = $true)][string]$SecretsFile,
  [switch]$Apply,
  [switch]$RepairMigrationHistory
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$secretsPath = (Resolve-Path -LiteralPath $SecretsFile).Path
$required = @(
  "ALLOWED_ORIGINS", "PUBLIC_APP_URL", "MERCADO_PAGO_ACCESS_TOKEN",
  "MERCADO_PAGO_WEBHOOK_SECRET", "MP_PLAN_MONTHLY_ID", "MP_PLAN_QUARTERLY_ID",
  "MP_PLAN_SEMIANNUAL_ID", "MP_PLAN_ANNUAL_ID", "BILLING_TERMS_VERSION",
  "BILLING_TERMS_SHA256", "BILLING_CRON_SECRET", "RESEND_API_KEY"
)
$values = @{}
Get-Content -LiteralPath $secretsPath | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') { $values[$matches[1].Trim()] = $matches[2].Trim() }
}
$missing = $required | Where-Object { -not $values.ContainsKey($_) -or -not $values[$_] -or $values[$_] -match 'substitua|gere-um' }
if ($missing) { throw "Secrets ausentes ou placeholders: $($missing -join ', ')" }

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label falhou com código de saída $LASTEXITCODE."
  }
}

Push-Location $repo
try {
  Invoke-CheckedCommand "Validação local" { npm run validate }
  if (-not $Apply) {
    Write-Host "Preflight concluído. Execute novamente com -Apply para publicar em $ProjectRef."
    exit 0
  }
  $policy = Get-Content -Raw -LiteralPath (Join-Path $repo "config/migration-release-policy.json") | ConvertFrom-Json
  if ($ProjectRef -eq $policy.production.projectRef) { throw "Publicação direta em produção bloqueada. Homologue e atualize a política de release primeiro." }
  if ($ProjectRef -ne $policy.staging.projectRef) { throw "ProjectRef não corresponde ao staging autorizado pela política de release." }
  Invoke-CheckedCommand "Vínculo com o Supabase" { npx supabase link --project-ref $ProjectRef }
  Invoke-CheckedCommand "Publicação dos secrets" { npx supabase secrets set --env-file $secretsPath --project-ref $ProjectRef }
  if ($RepairMigrationHistory) {
    $migrationFiles = Get-ChildItem -LiteralPath (Join-Path $repo "supabase/migrations") -Filter "*.sql"
    foreach ($property in $policy.staging.remoteVersionAliases.PSObject.Properties) {
      $name = $property.Name
      $remoteVersion = [string]$property.Value
      $localFile = $migrationFiles | Where-Object { $_.BaseName -match "^[0-9]+_$([regex]::Escape($name))$" } | Select-Object -First 1
      if (-not $localFile) { throw "Migration local não encontrada para alias $name." }
      $localVersion = ($localFile.BaseName -split '_', 2)[0]
      Invoke-CheckedCommand "Reparo da migration remota $remoteVersion" { npx supabase migration repair --linked --status reverted $remoteVersion }
      Invoke-CheckedCommand "Reparo da migration local $localVersion" { npx supabase migration repair --linked --status applied $localVersion }
    }
  }
  Invoke-CheckedCommand "Aplicação das migrations" { npx supabase db push --linked --include-all }
  @("ogritech-billing", "mercado-pago-webhook", "billing-lifecycle", "billing-email-dispatch") | ForEach-Object {
    $functionName = $_
    Invoke-CheckedCommand "Publicação da função $functionName" { npx supabase functions deploy $functionName --project-ref $ProjectRef }
  }
  Write-Host "Billing publicado em sequência. Configure agora o webhook e o agendamento descritos em docs/OGRITECH_BILLING.md."
} finally {
  Pop-Location
}
