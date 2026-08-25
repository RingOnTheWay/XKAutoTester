# List assets of a release by tag (parameterized).
# NOTE: ASCII-only script (PS 5.1 reads no-BOM UTF-8 as ANSI)
# USAGE: powershell -ExecutionPolicy Bypass -File list-assets.ps1 -Version 0.1.5-dev.2
param([Parameter(Mandatory = $true)][string]$Version)
$ErrorActionPreference = 'Stop'
$repo = 'RingOnTheWay/XKAutoTester'
$tag = "v$Version"

$credQuery = Join-Path $PSScriptRoot 'xkat-cred-query.txt'
[System.IO.File]::WriteAllText($credQuery, "protocol=https`nhost=github.com`n`n", [System.Text.Encoding]::ASCII)
$credOutput = cmd /c "git credential fill < `"$credQuery`"" 2>&1
Remove-Item $credQuery -ErrorAction SilentlyContinue
$token = (($credOutput | Select-String '^password=.*').Line).Substring('password='.length)

$resp = Join-Path $PSScriptRoot "xkat-assets-resp-$Version.json"
# Resolve release id by tag
$idCode = & curl.exe -sS --ssl-no-revoke -o "$resp" -w '%{http_code}' -H "Authorization: Bearer $token" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$repo/releases/tags/$tag"
if ($idCode -ne '200') { Write-Output "RELEASE NOT FOUND http=$idCode"; throw 'release not found' }
$releaseId = (Get-Content $resp -Raw -Encoding UTF8 | ConvertFrom-Json).id

& curl.exe -sS --ssl-no-revoke -H "Authorization: Bearer $token" -H "Accept: application/vnd.github+json" `
  "https://api.github.com/repos/$repo/releases/$releaseId/assets" -o "$resp"
$assets = Get-Content $resp -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($a in $assets) {
  Write-Output ("{0}  {1} bytes  state={2}" -f $a.name, $a.size, $a.state)
}
Write-Output "TOTAL=$($assets.Count)"
