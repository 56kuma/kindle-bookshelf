[CmdletBinding()]
param(
    [string]$BucketName = "kindle-bookshelf-data",
    [string]$ObjectKey = "kindle-web-library.csv",
    [string]$SourcePath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $scriptDirectory ".."))

if ([string]::IsNullOrWhiteSpace($SourcePath)) {
    $SourcePath = Join-Path $repositoryRoot "..\kindle-purchase-index\csv\kindle-web-library.csv"
}

$sourceFullPath = [IO.Path]::GetFullPath($SourcePath)
if (-not (Test-Path -LiteralPath $sourceFullPath -PathType Leaf)) {
    throw "Source CSV not found: $sourceFullPath"
}

$rows = @(Import-Csv -LiteralPath $sourceFullPath)
if ($rows.Count -eq 0) {
    throw "Source CSV contains no books: $sourceFullPath"
}

$requiredColumns = @("purchased_at", "title", "author", "asin", "cover_url", "is_manga")
$missingColumns = @($requiredColumns | Where-Object { $_ -notin $rows[0].PSObject.Properties.Name })
if ($missingColumns.Count -gt 0) {
    throw "Required CSV columns are missing: $($missingColumns -join ', ')"
}

$npx = Get-Command "npx.cmd" -ErrorAction Stop
$objectPath = "$BucketName/$ObjectKey"

& $npx.Source wrangler r2 object put $objectPath `
    --file=$sourceFullPath `
    --content-type="text/csv; charset=utf-8" `
    --cache-control="private, no-cache"

if ($LASTEXITCODE -ne 0) {
    throw "Cloudflare R2 upload failed with exit code $LASTEXITCODE"
}

Write-Output "Uploaded $($rows.Count) books to R2: $objectPath"
