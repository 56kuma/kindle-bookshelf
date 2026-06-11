[CmdletBinding()]
param(
    [string]$SourcePath = "",
    [string]$DestinationPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $scriptDirectory ".."))

if ([string]::IsNullOrWhiteSpace($SourcePath)) {
    $SourcePath = Join-Path $repositoryRoot "..\kindle-purchase-index\csv\kindle-web-library.csv"
}
if ([string]::IsNullOrWhiteSpace($DestinationPath)) {
    $DestinationPath = Join-Path $repositoryRoot "data\kindle-web-library.csv"
}

$sourceFullPath = [IO.Path]::GetFullPath($SourcePath)
$destinationFullPath = [IO.Path]::GetFullPath($DestinationPath)

if (-not (Test-Path -LiteralPath $sourceFullPath -PathType Leaf)) {
    throw "Source CSV not found: $sourceFullPath"
}

$rows = @(Import-Csv -LiteralPath $sourceFullPath)
$requiredColumns = @("purchased_at", "title", "author", "asin", "cover_url", "is_manga")
$missingColumns = @($requiredColumns | Where-Object { $_ -notin $rows[0].PSObject.Properties.Name })
if ($missingColumns.Count -gt 0) {
    throw "Required CSV columns are missing: $($missingColumns -join ', ')"
}

$destinationDirectory = Split-Path -Parent $destinationFullPath
New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
Copy-Item -LiteralPath $sourceFullPath -Destination $destinationFullPath -Force

Write-Output "Copied $($rows.Count) books to $destinationFullPath"
