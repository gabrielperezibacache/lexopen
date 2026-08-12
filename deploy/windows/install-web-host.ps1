param(
  [string]$ProjectPath = "C:\LexOpen",
  [string]$TaskName = "LexOpen Web Host"
)

$node = (Get-Command node -ErrorAction Stop).Source
$runtime = Join-Path $ProjectPath "desktop\host-runtime.mjs"

if (-not (Test-Path $runtime)) {
  throw "No se encontró $runtime. Clone el repositorio y ejecute npm ci, npm run desktop:install y npm run desktop:build."
}

$action = New-ScheduledTaskAction `
  -Execute $node `
  -Argument "`"$runtime`"" `
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
