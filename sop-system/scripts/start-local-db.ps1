$ErrorActionPreference = "Stop"

# Build paths from the script location so parent-folder renames never break startup.
$scriptRoot = $PSScriptRoot
$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Path $scriptRoot -Parent))
$localRoot = Join-Path $projectRoot ".local"
$dataDir = Join-Path $localRoot "mariadb-data"
$port = 3307

function Test-PortListening {
  param([int]$Port)
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return [bool]$listener
}

if (Test-PortListening -Port $port) {
  Write-Output "[local-db] MariaDB already listening on port $port."
  exit 0
}

New-Item -ItemType Directory -Force -Path $localRoot | Out-Null
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

$zipPath = Join-Path $localRoot "mariadb-11.8.6-winx64.zip"
$extractRoot = Join-Path $localRoot "mariadb-11.8.6"
$mariaRoot = Join-Path $extractRoot "mariadb-11.8.6-winx64"
$binDir = Join-Path $mariaRoot "bin"
$myIniPath = Join-Path $dataDir "my.ini"

if (-not (Test-Path $mariaRoot)) {
  if (-not (Test-Path $zipPath)) {
    Write-Output "[local-db] Downloading MariaDB portable package..."
    curl.exe -L "https://archive.mariadb.org/mariadb-11.8.6/winx64-packages/mariadb-11.8.6-winx64.zip" -o $zipPath
  }

  Write-Output "[local-db] Extracting MariaDB package..."
  Expand-Archive -Path $zipPath -DestinationPath $extractRoot
}

# Initialize database files if they don't exist yet
$isInitialized = Test-Path (Join-Path $dataDir "mysql")
if (-not $isInitialized) {
  Write-Output "[local-db] Initializing local database files..."
  & (Join-Path $binDir "mariadb-install-db.exe") -d $dataDir -p root -P $port | Out-Host
}

# Always (re)write my.ini so it never contains stale absolute paths
$mariaRootIni = $mariaRoot -replace '\\', '/'
$dataDirIni = $dataDir -replace '\\', '/'
$myIniContent = @"
[mysqld]
basedir="$mariaRootIni"
datadir="$dataDirIni"
port=$port
"@

Set-Content -Path $myIniPath -Value $myIniContent -Encoding ASCII

$stdoutLog = Join-Path $localRoot "mariadb.stdout.log"
$stderrLog = Join-Path $localRoot "mariadb.stderr.log"

Write-Output "[local-db] Starting MariaDB on port $port..."
Start-Process `
  -FilePath (Join-Path $binDir "mariadbd.exe") `
  -ArgumentList ("--defaults-file=`"{0}`"" -f $myIniPath), "--console" `
  -WorkingDirectory $projectRoot `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog | Out-Null

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-PortListening -Port $port) {
    $ready = $true
    break
  }
}

if (-not $ready) {
  Write-Output "[local-db] Failed to start MariaDB. Last errors:"
  if (Test-Path $stderrLog) {
    Get-Content $stderrLog -Tail 50 | Out-Host
  }
  throw "MariaDB did not start on port $port."
}

# Ensure expected application database exists.
& (Join-Path $binDir "mariadb.exe") `
  -h 127.0.0.1 `
  -P $port `
  -u root `
  -proot `
  -e "CREATE DATABASE IF NOT EXISTS sop_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" | Out-Null

Write-Output "[local-db] MariaDB is ready on port $port."
