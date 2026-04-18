$ErrorActionPreference = 'Stop'
$mainPath = Join-Path $PSScriptRoot '..\assets\js\main.js'
$outMsg = Join-Path $PSScriptRoot '..\assets\js\features\messages.js'
$lines = Get-Content -LiteralPath $mainPath -Encoding UTF8

$msgHeader = @'
// Messages: Supabase realtime, rendering, reactions, replies, send, upload, channel switch.
// Classic script. Uses globals from state/config/auth/presence and main.js (notify, escHtml, escapeJsString, formatTime, scrollToBottom, autoResize, playNotificationSound, getUserColor, deleteMessage, isAdmin).
'@

$msgParts = @()
$msgParts += $lines[127..429]
$msgParts += ''
$msgParts += $lines[573..882]
$msgParts += ''
$msgParts += $lines[914..943]

($msgHeader + "`n`n" + ($msgParts -join "`n")) | Set-Content -LiteralPath $outMsg -Encoding UTF8

$newMain = [System.Collections.ArrayList]@()
[void]$newMain.AddRange([string[]]$lines[0..126])
[void]$newMain.AddRange([string[]]$lines[430..571])
[void]$newMain.AddRange([string[]]$lines[883..911])
[void]$newMain.AddRange([string[]]$lines[944..($lines.Length - 1)])

$newMain | Set-Content -LiteralPath $mainPath -Encoding UTF8

Write-Host "Wrote $outMsg and updated main.js"
