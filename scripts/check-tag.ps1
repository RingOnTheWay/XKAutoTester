# Check a git tag ref on the repo (status check).
# NOTE: ASCII-only script (PS 5.1 reads no-BOM UTF-8 as ANSI)
# USAGE: powershell -ExecutionPolicy Bypass -File check-tag.ps1 -Tag v0.1.5-dev.2
param([Parameter(Mandatory = $true)][string]$Tag)
$ErrorActionPreference = 'Stop'
$repo = 'RingOnTheWay/XKAutoTester'
$resp = Join-Path $PSScriptRoot "xkat-tag-resp-$Tag.json"
& curl.exe -sS --ssl-no-revoke "https://api.github.com/repos/$repo/git/ref/tags/$Tag" -o "$resp"
$ref = Get-Content $resp -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Output ("tag object sha={0} type={1}" -f $ref.object.sha, $ref.object.type)
# annotated tag: dereference to commit
if ($ref.object.type -eq 'tag') {
  & curl.exe -sS --ssl-no-revoke "https://api.github.com/repos/$repo/git/tags/$($ref.object.sha)" -o "$resp"
  $t = Get-Content $resp -Raw -Encoding UTF8 | ConvertFrom-Json
  Write-Output ("commit sha={0}  msg={1}" -f $t.object.sha, $t.message)
}
