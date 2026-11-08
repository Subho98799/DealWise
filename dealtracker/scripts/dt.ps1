# DealTracker helper for Windows PowerShell. Usage: .\scripts\dt.ps1 <command>
# Commands: install, create-role, create-role-test, migrate, migrate-test, test, lint, backend, frontend, check, docs
# (same meaning as scripts/dt.sh). If scripts are blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
param([string]$Command = "help")
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Py = Join-Path $Root "backend\.venv\Scripts\python.exe"
Set-Location (Join-Path $Root "backend")

function Blank-Env($dir) {
  $target = Join-Path $dir ".env"
  if (-not (Test-Path $target)) {
    Get-Content (Join-Path $dir ".env.example") | Where-Object { $_ -match '^[A-Z_]+=' } |
      ForEach-Object { ($_ -split '=')[0] + '=' } | Set-Content $target
  }
}
function Run($exe, [string[]]$argv) { & $exe @argv; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }

switch ($Command) {
  "install" {
    Run "py" @("-3.12", "-m", "venv", ".venv"); Run $Py @("-m", "pip", "install", "-q", "-r", "requirements-dev.txt")
    Blank-Env (Join-Path $Root "backend")
    Set-Location (Join-Path $Root "frontend"); Run "yarn" @("install"); Blank-Env (Join-Path $Root "frontend")
  }
  "create-role" { Run $Py @("scripts\create_role.py") }
  "create-role-test" { Run $Py @("scripts\create_role.py", "--test") }
  "migrate" { Run $Py @("-m", "alembic", "upgrade", "head") }
  "migrate-test" {
    $env:MIGRATION_DATABASE_URL = (& $Py -c "import sys; sys.path.insert(0,'scripts'); from _common import env; print(env('TEST_MIGRATION_DATABASE_URL') or '')")
    Run $Py @("-m", "alembic", "upgrade", "head")
    Remove-Item Env:MIGRATION_DATABASE_URL
  }
  "test" {
    Run $Py @("-m", "pytest", "-q")
    Set-Location (Join-Path $Root "frontend"); Run "yarn" @("typecheck"); Run "yarn" @("test")
  }
  "lint" {
    Run (Join-Path $Root "backend\.venv\Scripts\ruff.exe") @("check", "app", "tests", "scripts")
    Set-Location (Join-Path $Root "frontend"); Run "corepack" @("yarn", "lint")
  }
  "backend" { Run $Py @("-m", "uvicorn", "app.main:app", "--reload", "--port", "8000") }
  "frontend" { Set-Location (Join-Path $Root "frontend"); Run "yarn" @("dev") }
  "check" { Run $Py @("scripts\check_setup.py") }
  "docs" { Run $Py @("scripts\check_docs.py") }
  default { Get-Content $PSCommandPath -TotalCount 3 }
}
