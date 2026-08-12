param(
  [string]$ProjectPath = "C:\LexOpen",
  [string]$TaskName = "LexOpen Web Host",
  [string]$DataDir = ""
)

$node = (Get-Command node -ErrorAction Stop).Source
$runtime = Join-Path $ProjectPath "scripts\web-host.mjs"
$launcher = Join-Path $ProjectPath "scripts\web-host-windows.cmd"

if (-not (Test-Path $runtime)) {
  throw "No se encontró $runtime. Clone el repositorio y ejecute npm ci, npm run desktop:install y npm run desktop:build."
}

if (-not $DataDir) {
  $DataDir = Join-Path $env:LOCALAPPDATA "LexOpen"
}

# Wrapper so Scheduled Task sets fail-closed demo flags even before .env exists.
$launcherBody = @"
@echo off
set NODE_ENV=production
set LEXOPEN_DEMO_SWITCHER=0
set HERMES_ALLOW_DEMO=0
set LLM_ALLOW_DEMO=0
set PJUD_ALLOW_DEMO=0
set LEXOPEN_DATA_DIR=$DataDir
"$node" "$runtime"
"@
Set-Content -Path $launcher -Value $launcherBody -Encoding ASCII

$action = New-ScheduledTaskAction `
  -Execute $launcher `
  -WorkingDirectory $ProjectPath
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Days 3650) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -RunLevel Highest `
  -Force

Write-Host "Tarea '$TaskName' instalada. LexOpen iniciará con Windows."
Write-Host "Data dir: $DataDir"
Write-Host "Launcher: $launcher"
