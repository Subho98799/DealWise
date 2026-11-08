# Checks your setup and prints PASS/FAIL per item. Never prints secret values.
& (Join-Path $PSScriptRoot "dt.ps1") check
exit $LASTEXITCODE
