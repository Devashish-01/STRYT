# STRYT Weekly Database Backup Script
# Performs logical row export with live verify and schema snapshot on Supabase Free tier.

$ErrorActionPreference = "Stop"

# Ensure run from repo root
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $RepoRoot

$BackupsDir = "D:\STRYT-db-backups"
if (-not (Test-Path $BackupsDir)) {
    New-Item -ItemType Directory -Path $BackupsDir -Force | Out-Null
}

$UtcStamp = [DateTime]::UtcNow.ToString("yyyy-MM-dd_HHmm") + "Z"
$FolderName = "weekly_" + $UtcStamp
$TargetDir = Join-Path $BackupsDir $FolderName

Write-Host "=== STRYT Weekly DB Backup ==="
Write-Host "Timestamp: $UtcStamp"
Write-Host "Target:    $TargetDir"

# 1. Run live data export with verification
Write-Host "`n1. Exporting live rows with verification..."
$exportProcess = Start-Process -FilePath "node" -ArgumentList "scripts/export-live-data.mjs", "`"$TargetDir`"", "--verify" -NoNewWindow -PassThru -RedirectStandardOutput "$TargetDir-export.log" -RedirectStandardError "$TargetDir-export-err.log" -Wait

$exportCode = $exportProcess.ExitCode
$exportOutput = ""
if (Test-Path "$TargetDir-export.log") {
    $exportOutput = Get-Content "$TargetDir-export.log" -Raw
    Write-Host $exportOutput
}
if (Test-Path "$TargetDir-export-err.log") {
    $errContent = Get-Content "$TargetDir-export-err.log" -Raw
    if ($errContent -and $errContent.Trim()) {
        Write-Warning $errContent
    }
    Remove-Item "$TargetDir-export-err.log" -Force -ErrorAction SilentlyContinue
}
Remove-Item "$TargetDir-export.log" -Force -ErrorAction SilentlyContinue

# Extract verify summary line
$verifySummary = ($exportOutput -split "`r?`n" | Where-Object { $_ -match "verified|Checksums match|restored" }) -join " | "
if (-not $verifySummary) {
    $verifySummary = "exit code: $exportCode"
}

# 2. Run live schema snapshot
$schemaFile = Join-Path $TargetDir "schema.sql"
Write-Host "`n2. Capturing schema snapshot to $schemaFile..."
$schemaProcess = Start-Process -FilePath "node" -ArgumentList "scripts/snapshot-live-schema.mjs", "`"$schemaFile`"" -NoNewWindow -PassThru -RedirectStandardOutput "$TargetDir-schema.log" -RedirectStandardError "$TargetDir-schema-err.log" -Wait

$schemaCode = $schemaProcess.ExitCode
if (Test-Path "$TargetDir-schema.log") {
    $schemaOutput = Get-Content "$TargetDir-schema.log" -Raw
    Write-Host $schemaOutput
    Remove-Item "$TargetDir-schema.log" -Force -ErrorAction SilentlyContinue
}
if (Test-Path "$TargetDir-schema-err.log") {
    $schemaErr = Get-Content "$TargetDir-schema-err.log" -Raw
    if ($schemaErr -and $schemaErr.Trim()) {
        Write-Warning $schemaErr
    }
    Remove-Item "$TargetDir-schema-err.log" -Force -ErrorAction SilentlyContinue
}

# 3. Append to backup.log
$LogFile = Join-Path $BackupsDir "backup.log"
$LogEntry = "[$UtcStamp] folder=$FolderName exportExit=$exportCode schemaExit=$schemaCode summary=`"$verifySummary`""
Add-Content -Path $LogFile -Value $LogEntry
Write-Host "`n3. Logged to $LogFile"
Write-Host $LogEntry

# 4. Retention: keep newest 8 weekly folders matching ^weekly_\d{4}-\d{2}-\d{2}_\d{4}Z$
Write-Host "`n4. Checking retention (keeping newest 8 weekly backups)..."
$WeeklyBackups = Get-ChildItem -Path $BackupsDir -Directory | Where-Object { $_.Name -match '^weekly_\d{4}-\d{2}-\d{2}_\d{4}Z$' } | Sort-Object Name -Descending
if ($WeeklyBackups.Count -gt 8) {
    $ToRemove = $WeeklyBackups | Select-Object -Skip 8
    foreach ($dir in $ToRemove) {
        Write-Host "Removing expired weekly backup: $($dir.FullName)"
        Remove-Item -Path $dir.FullName -Recurse -Force
    }
} else {
    Write-Host "Found $($WeeklyBackups.Count) weekly backup(s). No expiration cleanup needed."
}

# Check success
if ($exportCode -ne 0 -or $schemaCode -ne 0) {
    Write-Error "Backup completed with errors (export: $exportCode, schema: $schemaCode)"
    exit 1
}

Write-Host "`n=== Backup completed successfully ==="
exit 0
