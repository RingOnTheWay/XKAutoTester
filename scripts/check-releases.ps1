# List all releases (incl drafts/prereleases) - status check.
# NOTE: ASCII-only script (PS 5.1 reads no-BOM UTF-8 as ANSI)
# USAGE: powershell -ExecutionPolicy Bypass -File check-releases.ps1
$ErrorActionPreference = 'Stop'
$repo = 'RingOnTheWay/XKAutoTester'

$credQuery = Join-Path $PSScriptRoot 'xkat-cred-query.txt'
[System.IO.File]::WriteAllText($credQuery, "protocol=https`nhost=github.com`n`n", [System.Text.Encoding]::ASCII)
$credOutput = cmd /c "git credential fill < `"$credQuery`"" 2>&1
Remove-Item $credQuery -ErrorAction SilentlyContinue
$token = (($credOutput | Select-String '^password=.*').Line).Substring('password='.length)

$resp = Join-Path $PSScriptRoot 'xkat-releases-resp.json'
& curl.exe -sS --ssl-no-revoke -H "Authorization: Bearer $token" -H "Accept: application/vnd.github+json" `
  "https://api.github.com/repos/$repo/releases?per_page=20" -o "$resp"
$releases = Get-Content $resp -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Output '--- ALL RELEASES ---'
foreach ($r in $releases) {
  Write-Output ("id={0} tag={1} draft={2} prerelease={3} assets={4}" -f $r.id, $r.tag_name, $r.draft, $r.prerelease, $r.assets.Count)
}
