# Publish XKAutoTester release (create + upload assets), parameterized by -Version.
# NOTE: ASCII-only script (PS 5.1 reads no-BOM UTF-8 as ANSI, non-ASCII comments can swallow newlines)
# USAGE: powershell -ExecutionPolicy Bypass -File publish-release.ps1 -Version 0.1.5-dev.2
# PITFALLS (worked around below):
#   - PS 5.1 drops $null args passed to native commands -> use quoted 'NUL' / real strings, never $null
#   - Get-Content -Raw returns PSObject-wrapped string; ConvertTo-Json then serializes wrapper props
#     (value/ReadCount). Interpolation "$(...)" forces a plain string.
#   - curl needs --ssl-no-revoke (direct connection CRL check fails on this box)
#   - `-o NUL -w ...` under PS 5.1: PS treats `-w` as a filename when `-o` arg is unquoted NUL,
#     creating a stray `-w` file. Always quote: -o 'NUL'
param([Parameter(Mandatory = $true)][string]$Version)
$ErrorActionPreference = 'Stop'
$repo = 'RingOnTheWay/XKAutoTester'
$tag = "v$Version"
$bodyPath = Join-Path $PSScriptRoot "release-body-v$Version.md"
if (-not (Test-Path $bodyPath)) { throw "release body missing: $bodyPath" }

# 1. Get token from git credential manager (temp file + cmd redirect)
$credQuery = Join-Path $PSScriptRoot 'xkat-cred-query.txt'
[System.IO.File]::WriteAllText($credQuery, "protocol=https`nhost=github.com`n`n", [System.Text.Encoding]::ASCII)
$credOutput = cmd /c "git credential fill < `"$credQuery`"" 2>&1
Remove-Item $credQuery -ErrorAction SilentlyContinue
$passwordLine = ($credOutput | Select-String '^password=.*').Line
if (-not $passwordLine) { throw 'no github token' }
$token = $passwordLine.Substring('password='.length)
Write-Output 'TOKEN: OK'

$headers = @{
  'Authorization' = "Bearer $token"
  'Accept'        = 'application/vnd.github+json'
  'X-GitHub-Api-Version' = '2022-11-28'
}

# 2. Create release via curl (Invoke-RestMethod has TLS/proxy issues on this box)
$respFile = Join-Path $PSScriptRoot "xkat-release-resp-$Version.json"
$getCode = & curl.exe -sS --ssl-no-revoke -o "$respFile" -w '%{http_code}' -H "Authorization: Bearer $token" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$repo/releases/tags/$tag"
$release = $null
if ($getCode -eq '200') {
  $release = Get-Content $respFile -Raw -Encoding UTF8 | ConvertFrom-Json
  Write-Output "RELEASE_EXISTS id=$($release.id)"
} else {
  # PS 5.1 quirk: Get-Content -Raw returns PSObject-wrapped string; interpolate to plain string.
  $bodyText = "$(Get-Content $bodyPath -Raw -Encoding UTF8)"
  $payload = @{
    tag_name         = $tag
    target_commitish = 'dev'
    name             = $Version
    body             = $bodyText
    prerelease       = $true
  } | ConvertTo-Json -Depth 5
  $payloadFile = Join-Path $PSScriptRoot "xkat-release-payload-$Version.json"
  [System.IO.File]::WriteAllBytes($payloadFile, [System.Text.Encoding]::UTF8.GetBytes($payload))
  $postCode = & curl.exe -sS --ssl-no-revoke -o "$respFile" -w '%{http_code}' -X POST `
    -H "Authorization: Bearer $token" -H "Accept: application/vnd.github+json" -H "Content-Type: application/json" `
    --data-binary "@$payloadFile" "https://api.github.com/repos/$repo/releases"
  if ($postCode -ne '201') {
    Write-Output "CREATE FAILED http=$postCode"
    Get-Content $respFile -Raw -Encoding UTF8 | Write-Output
    throw 'release create failed'
  }
  $release = Get-Content $respFile -Raw -Encoding UTF8 | ConvertFrom-Json
  Write-Output "RELEASE_CREATED id=$($release.id)"
}
Write-Output "RELEASE_URL=$($release.html_url)"

# 3. Upload assets via curl (proxy, large files); glob dist for this version's exe/blockmap
$dist = Join-Path $PSScriptRoot '..\electron\dist'
if (-not (Test-Path $dist)) { throw "dist missing: $dist" }
$names = @(Get-ChildItem $dist -File | Where-Object { $_.Name -like "*Setup*v$Version*.exe*" } | Select-Object -ExpandProperty Name)
if ($names.Count -eq 0) { Write-Output 'WARN: no matching assets found in dist'; }
foreach ($name in $names) {
  $file = Join-Path $dist $name
  if (-not (Test-Path $file)) { Write-Output "SKIP(missing): $name"; continue }
  $encoded = [System.Uri]::EscapeDataString($name)
  # -o 'NUL' (quoted) -> PS 5.1 never treats it as a filename, no stray `-w` file
  & curl.exe -sS --ssl-no-revoke -X POST `
    -H "Authorization: Bearer $token" `
    -H "Content-Type: application/octet-stream" `
    --data-binary "@$file" `
    "https://uploads.github.com/repos/$repo/releases/$($release.id)/assets?name=$encoded" `
    -o 'NUL' -w "UPLOADED: $name (http %{http_code}, %{size_upload} bytes)`n"
}
Write-Output 'DONE'
