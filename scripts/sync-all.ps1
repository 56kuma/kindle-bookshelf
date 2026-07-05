# Kindle購入データの全自動同期:
#   1. kindle-purchase-index の export（無人モード）でCSVを再取得
#   2. CSVを検証（必須列・前回比の行数急減チェック）
#   3. 前回アップロードと差分がある時だけ Cloudflare R2 へアップロード
#   4. ローカル閲覧用に data\ へコピー
# 失敗時は Windows トースト通知とログで知らせる。
# 終了コード: 0=成功(差分なし含む) / 2=Amazonセッション切れ / 1=その他失敗
[CmdletBinding()]
param(
    [switch]$SkipExport,   # 取得済みCSVで検証～アップロードだけ行う
    [switch]$Force         # 行数急減チェックを無視して続行
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $scriptDirectory ".."))
$purchaseIndexRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot "..\kindle-purchase-index"))
$csvPath = Join-Path $purchaseIndexRoot "csv\kindle-web-library.csv"

$syncDirectory = Join-Path $repositoryRoot ".sync"
$logDirectory = Join-Path $syncDirectory "logs"
$statePath = Join-Path $syncDirectory "state.json"
$historyPath = Join-Path $syncDirectory "history.json"
$statusLocalCopy = Join-Path $repositoryRoot "data\sync-status.json"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$logPath = Join-Path $logDirectory ("sync-" + (Get-Date -Format "yyyy-MM-dd") + ".log")

function Write-Log {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
    # Write-Output だと呼び出し元関数の戻り値に混入するため Write-Host を使う
    Write-Host $line
}

function Show-Toast {
    param([string]$Title, [string]$Message)
    try {
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(
            [Windows.UI.Notifications.ToastTemplateType]::ToastText02)
        $texts = $template.GetElementsByTagName("text")
        $texts.Item(0).AppendChild($template.CreateTextNode($Title)) | Out-Null
        $texts.Item(1).AppendChild($template.CreateTextNode($Message)) | Out-Null
        $toast = New-Object Windows.UI.Notifications.ToastNotification($template)
        $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
    } catch {
        Write-Log "トースト通知に失敗（無視して続行）: $_"
    }
}

# stdout/stderr を一時ファイル経由で回収して外部プロセスを実行する。
# PowerShell 5.1 の 2>&1 は ErrorActionPreference=Stop と組み合わせると
# stderr 出力だけで例外化するため、Start-Process のリダイレクトを使う。
function Invoke-LoggedProcess {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory
    )
    $stdoutPath = [IO.Path]::GetTempFileName()
    $stderrPath = [IO.Path]::GetTempFileName()
    try {
        $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList `
            -WorkingDirectory $WorkingDirectory -NoNewWindow -Wait -PassThru `
            -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
        foreach ($outputFile in @($stdoutPath, $stderrPath)) {
            Get-Content -LiteralPath $outputFile -Encoding UTF8 |
                Where-Object { $_ } |
                ForEach-Object { Write-Log "  $_" }
        }
        return $process.ExitCode
    } finally {
        Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
    }
}

function Read-SyncState {
    if (Test-Path -LiteralPath $statePath -PathType Leaf) {
        try {
            return Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
        } catch {
            Write-Log "state.json の読み込みに失敗。初回扱いで続行: $_"
        }
    }
    return $null
}

# 実行結果を .sync\history.json に追記（直近30件）し、画面の「同期ログ」用に
# data\sync-status.json とR2の sync-status.json へ反映する。失敗しても同期自体は止めない。
function Save-RunHistory {
    param([string]$Status, [int]$Rows, [string]$Message)
    try {
        $runs = @()
        if (Test-Path -LiteralPath $historyPath -PathType Leaf) {
            try {
                $parsed = Get-Content -LiteralPath $historyPath -Raw -Encoding UTF8 | ConvertFrom-Json
                if ($null -ne $parsed -and $parsed.PSObject.Properties.Name -contains "runs") {
                    $runs = @($parsed.runs)
                }
            } catch {
                Write-Log "history.json の読み込みに失敗。新規作成します: $_"
            }
        }

        $entry = [ordered]@{
            at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            status = $Status
            rows = $Rows
            message = $Message
        }
        $runs = @($runs + @($entry) | Select-Object -Last 30)
        $payload = [ordered]@{ updated_at = $entry.at; runs = $runs }
        $json = ConvertTo-Json -InputObject $payload -Depth 5
        Set-Content -LiteralPath $historyPath -Value $json -Encoding UTF8

        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $statusLocalCopy) | Out-Null
        Copy-Item -LiteralPath $historyPath -Destination $statusLocalCopy -Force

        $npx = Get-Command "npx.cmd" -ErrorAction SilentlyContinue
        if ($null -ne $npx) {
            $uploadExit = Invoke-LoggedProcess -FilePath $npx.Source -ArgumentList @(
                "wrangler", "r2", "object", "put", "kindle-bookshelf-data/sync-status.json",
                "--remote", "--file=$historyPath", "--content-type=application/json"
            ) -WorkingDirectory $repositoryRoot
            if ($uploadExit -ne 0) {
                Write-Log "同期ログのR2アップロードに失敗（無視して続行）: exit=$uploadExit"
            }
        }
    } catch {
        Write-Log "同期ログの保存に失敗（無視して続行）: $_"
    }
}

try {
    Write-Log "===== 同期開始 ====="

    # --- 1. エクスポート（無人モード） ---
    if ($SkipExport) {
        Write-Log "エクスポートをスキップ（-SkipExport）"
    } else {
        Write-Log "Kindleライブラリを取得中..."
        $npm = Get-Command "npm.cmd" -ErrorAction Stop
        $env:KINDLE_UNATTENDED = "1"
        try {
            $exportExitCode = Invoke-LoggedProcess -FilePath $npm.Source `
                -ArgumentList @("run", "export") -WorkingDirectory $purchaseIndexRoot
        } finally {
            Remove-Item Env:\KINDLE_UNATTENDED -ErrorAction SilentlyContinue
        }

        if ($exportExitCode -eq 2) {
            Write-Log "Amazonセッション切れ。手動での再ログインが必要です。"
            Show-Toast "Kindle同期: 再ログインが必要" "Amazonセッションが切れています。kindle-purchase-index で npm run export を1回手動実行してください。"
            Save-RunHistory -Status "login_required" -Rows 0 -Message "Amazonセッション切れ。要手動ログイン"
            exit 2
        }
        if ($exportExitCode -ne 0) {
            throw "エクスポートが終了コード $exportExitCode で失敗しました。"
        }
    }

    # --- 2. CSV検証 ---
    if (-not (Test-Path -LiteralPath $csvPath -PathType Leaf)) {
        throw "CSVが見つかりません: $csvPath"
    }
    $rows = @(Import-Csv -LiteralPath $csvPath)
    if ($rows.Count -eq 0) {
        throw "CSVに本が1冊もありません: $csvPath"
    }
    $requiredColumns = @("purchased_at", "title", "author", "asin", "cover_url", "is_manga")
    $missingColumns = @($requiredColumns | Where-Object { $_ -notin $rows[0].PSObject.Properties.Name })
    if ($missingColumns.Count -gt 0) {
        throw "必須列がありません: $($missingColumns -join ', ')"
    }
    Write-Log "CSV検証OK: $($rows.Count) 冊"

    $state = Read-SyncState
    if (-not $Force -and $null -ne $state -and $state.lastRowCount -gt 0) {
        $threshold = [Math]::Floor($state.lastRowCount * 0.95)
        if ($rows.Count -lt $threshold) {
            $message = "冊数が前回 $($state.lastRowCount) → 今回 $($rows.Count) に急減。取得失敗の可能性があるため中止（意図的なら -Force で再実行）。"
            Write-Log $message
            Show-Toast "Kindle同期: 中止" $message
            Save-RunHistory -Status "aborted" -Rows $rows.Count -Message $message
            exit 1
        }
    }

    # --- 3. 差分チェックとR2アップロード ---
    $csvHash = (Get-FileHash -LiteralPath $csvPath -Algorithm SHA256).Hash
    $lastHash = if ($null -ne $state) { $state.lastUploadedHash } else { $null }

    if ($csvHash -eq $lastHash) {
        Write-Log "前回アップロードから変更なし。アップロードをスキップ。"
    } else {
        Write-Log "Cloudflare R2 へアップロード中..."
        $uploadScript = Join-Path $scriptDirectory "upload-cloudflare-data.ps1"
        $uploadExitCode = Invoke-LoggedProcess -FilePath "powershell.exe" -ArgumentList @(
            "-NoProfile", "-ExecutionPolicy", "Bypass",
            "-File", "`"$uploadScript`"", "-SourcePath", "`"$csvPath`""
        ) -WorkingDirectory $repositoryRoot
        if ($uploadExitCode -ne 0) {
            throw "R2アップロードが終了コード $uploadExitCode で失敗しました。"
        }
        Write-Log "アップロード完了。"
    }

    # --- 4. ローカル閲覧用コピー ---
    $copyScript = Join-Path $scriptDirectory "sync-kindle-csv.ps1"
    $copyExitCode = Invoke-LoggedProcess -FilePath "powershell.exe" -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass",
        "-File", "`"$copyScript`"", "-SourcePath", "`"$csvPath`""
    ) -WorkingDirectory $repositoryRoot
    if ($copyExitCode -ne 0) {
        throw "ローカルコピーが終了コード $copyExitCode で失敗しました。"
    }

    # --- 5. 状態を保存 ---
    $newState = @{
        lastRowCount = $rows.Count
        lastUploadedHash = $csvHash
        lastSyncAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    }
    $newState | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8

    Save-RunHistory -Status "success" -Rows $rows.Count -Message ""
    Write-Log "===== 同期完了: $($rows.Count) 冊 ====="
    exit 0
} catch {
    Write-Log "同期失敗: $_"
    Show-Toast "Kindle同期: 失敗" "$_ / ログ: $logPath"
    Save-RunHistory -Status "failed" -Rows 0 -Message "$_"
    exit 1
}
