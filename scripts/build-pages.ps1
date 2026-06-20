[CmdletBinding()]
param(
    [string]$OutputDirectory = "",
    [switch]$IncludeCsv
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $scriptDirectory ".."))

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repositoryRoot "dist"
}

$outputFullPath = [IO.Path]::GetFullPath($OutputDirectory)
$expectedDefaultPath = [IO.Path]::GetFullPath((Join-Path $repositoryRoot "dist"))

if ($outputFullPath -ne $expectedDefaultPath -and -not $outputFullPath.StartsWith("$repositoryRoot\")) {
    throw "Output directory must be inside the repository: $outputFullPath"
}

if (Test-Path -LiteralPath $outputFullPath) {
    Remove-Item -LiteralPath $outputFullPath -Recurse -Force
}

New-Item -ItemType Directory -Force -Path (Join-Path $outputFullPath "data") | Out-Null

@("index.html", "app.js", "styles.css", "_headers") | ForEach-Object {
    Copy-Item -LiteralPath (Join-Path $repositoryRoot $_) -Destination $outputFullPath
}

# NOTE: Do not copy Pages Functions (/api/*) into dist.
# Because wrangler.toml sets pages_build_output_dir, the Functions source is the
# repo-root functions\ directory and is compiled automatically at deploy time.
# Placing functions\ inside dist makes them static assets and breaks routing.

if ($IncludeCsv) {
    & (Join-Path $scriptDirectory "sync-kindle-csv.ps1")
    Copy-Item `
        -LiteralPath (Join-Path $repositoryRoot "data\kindle-web-library.csv") `
        -Destination (Join-Path $outputFullPath "data\kindle-web-library.csv")
}

Write-Output "Cloudflare Pages assets built at $outputFullPath"
