# sync-all.ps1 を毎日実行するタスクをタスクスケジューラへ登録する。
# 既に同名タスクがあれば上書き。ログオン中のみ実行（headed Chrome を開くため）。
# 予定時刻にPCがスリープ/電源断だった場合は次の起動時に実行される（StartWhenAvailable）。
[CmdletBinding()]
param(
    [string]$TaskName = "KindleBookshelfSync",
    [string]$At = "06:00",
    [switch]$WakeToRun   # スリープを解除して実行（電源設定でスリープ解除タイマーの許可が必要）
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$syncScript = Join-Path $scriptDirectory "sync-all.ps1"
if (-not (Test-Path -LiteralPath $syncScript -PathType Leaf)) {
    throw "sync-all.ps1 が見つかりません: $syncScript"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$syncScript`""

$trigger = New-ScheduledTaskTrigger -Daily -At $At

$settingsParams = @{
    StartWhenAvailable = $true
    ExecutionTimeLimit = (New-TimeSpan -Hours 1)
    MultipleInstances  = "IgnoreNew"
}
if ($WakeToRun) {
    $settingsParams.WakeToRun = $true
}
$settings = New-ScheduledTaskSettingsSet @settingsParams

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Description "Kindle購入データを取得してCloudflare R2へ同期" -Force | Out-Null

Write-Output "タスク '$TaskName' を登録しました（毎日 $At、未実行分は次回起動時に実行）。"
Write-Output "手動実行: Start-ScheduledTask -TaskName $TaskName"
Write-Output "削除:     Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"
