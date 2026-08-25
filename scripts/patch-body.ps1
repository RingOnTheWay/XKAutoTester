# Patch XKAutoTester release body (dot-format asset SHA256) + verify hash parsing vs local exe.
# NOTE: ASCII-only script (PS 5.1 reads no-BOM UTF-8 as ANSI, non-ASCII comments can swallow newlines)
# USAGE: powershell -ExecutionPolicy Bypass -File patch-body.ps1 -Version 0.1.5-dev.2
# PITFALLS (worked around below): same as publish-release.ps1 (see header there)
param([Parameter(Mandatory = $true)][string]$Version)
$ErrorActionPreference = 'Stop'
$repo = 'RingOnTheWay/XKAutoTester'
$tag = "v$Version"
$bodyPath = Join-Path $PSScriptRoot "release-body-v$Version.md"
if (-not (Test-Path $bodyPath)) { throw "release body missing: $bodyPath" }

# token via git credential manager
$credQuery = Join-Path $PSScriptRoot 'xkat-cred-query.txt'
[System.IO.File]::WriteAllText($credQuery, "protocol=https`nhost=github.com`n`n", [System.Text.Encoding]::ASCII)
$credOutput = cmd /c "git credential fill < `"$credQuery`"" 2>&1
Remove-Item $credQuery -ErrorAction SilentlyContinue
$passwordLine = ($credOutput | Select-String '^password=.*').Line
if (-not $passwordLine) { throw 'no github token' }
$token = $passwordLine.Substring('password='.length)
Write-Output 'TOKEN: OK'

$resp = Join-Path $PSScriptRoot "xkat-patch-resp-$Version.json"

# 0. Resolve release id by tag
$idCode = & curl.exe -sS --ssl-no-revoke -o "$resp" -w '%{http_code}' -H "Authorization: Bearer $token" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$repo/releases/tags/$tag"
if ($idCode -ne '200') { Write-Output "RELEASE NOT FOUND http=$idCode"; Get-Content $resp -Raw -Encoding UTF8 | Write-Output; throw 'release not found' }
$releaseId = (Get-Content $resp -Raw -Encoding UTF8 | ConvertFrom-Json).id
Write-Output "RELEASE_ID=$releaseId"

# PATCH release body (dot-format asset names in SHA256 section)
$bodyText = "$(Get-Content $bodyPath -Raw -Encoding UTF8)"
$payload = @{
  body       = $bodyText
  prerelease = $true
} | ConvertTo-Json -Depth 5
$pf = Join-Path $PSScriptRoot "xkat-body-payload-$Version.json"
[System.IO.File]::WriteAllBytes($pf, [System.Text.Encoding]::UTF8.GetBytes($payload))
$code = & curl.exe -sS --ssl-no-revoke -X PATCH `
  -H "Authorization: Bearer $token" -H "Accept: application/vnd.github+json" -H "Content-Type: application/json" `
  --data-binary "@$pf" -o "$resp" -w '%{http_code}' `
  "https://api.github.com/repos/$repo/releases/$releaseId"
Write-Output "PATCH BODY http=$code"
if ($code -ne '200') { Get-Content $resp -Raw -Encoding UTF8 | Write-Output; throw 'body patch failed' }

# Verify: fetch release, check prerelease flag + parse SHA256 from body
& curl.exe -sS --ssl-no-revoke -H "Authorization: Bearer $token" -H "Accept: application/vnd.github+json" `
  "https://api.github.com/repos/$repo/releases/$releaseId" -o "$resp"
$rel = Get-Content $resp -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Output ("draft={0} prerelease={1} assets={2}" -f $rel.draft, $rel.prerelease, $rel.assets.Count)

$body = $rel.body
function ParseSha256([string]$b, [string]$fileName) {
  if ($fileName) {
    $escaped = [regex]::Escape($fileName)
    if ($b -match "\*\*$escaped\*\*[\s\S]*?SHA256:\s*([a-fA-F0-9]{64})\b") {
      return $Matches[1].ToLower()
    }
  }
  if ($b -match 'SHA256:\s*([a-fA-F0-9]{64})\b') { return $Matches[1].ToLower() }
  return $null
}

# dot-format asset names (GitHub normalizes spaces in asset filenames to dots)
$names = @{
  FULL = "XKAutoTester.Setup.v$Version.exe"
  LITE = "XKAutoTester.Lite.Setup.v$Version.exe"
}
# local filenames use spaces, not dots (dot only appears in version number, keep it)
$localNames = @{
  FULL = "XKAutoTester Setup v$Version.exe"
  LITE = "XKAutoTester Lite Setup v$Version.exe"
}

# Compute local sha256 of built exe (if present) to cross-check body hash
function Get-FileSha256([string]$p) {
  if (-not (Test-Path $p)) { return $null }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $fs = [System.IO.File]::OpenRead($p)
    try { return ([System.BitConverter]::ToString($sha.ComputeHash($fs))).Replace('-', '').ToLower() }
    finally { $fs.Dispose() }
  } finally { $sha.Dispose() }
}

$dist = Join-Path $PSScriptRoot '..\electron\dist'
foreach ($key in $names.Keys) {
  $fileName = $names[$key]
  $parsed = ParseSha256 $body $fileName
  $localPath = Join-Path $dist $localNames[$key]
  $localHash = Get-FileSha256 $localPath
  $localPart = if ($localHash) { $localHash } else { '(local exe missing)' }
  if (-not $parsed) {
    Write-Output ("{0}: BODY PARSE FAILED (no SHA256 found for {1})" -f $key, $fileName)
    continue
  }
  if ($localHash -and $parsed -ne $localHash) {
    Write-Output ("{0}: MISMATCH body={1} local={2}" -f $key, $parsed, $localHash)
  } else {
    Write-Output ("{0}: OK body={1} local={2}" -f $key, $parsed, $localPart)
  }
}
