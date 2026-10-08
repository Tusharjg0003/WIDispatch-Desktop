$ErrorActionPreference = 'Stop'
$taskRoot = 'C:\Users\mabdu\OneDrive\Desktop\WIDispatch-Desktop'
$taskDocPath = Join-Path $taskRoot 'outputs\widispatch-it-20260929\WIDispatch_Client_IT_Questions_and_Answers.docx'
$taskRenderId = [guid]::NewGuid().ToString('N')
$taskLocalPath = Join-Path $env:TEMP "WIDispatch_IT_QA_$taskRenderId.docx"
[System.IO.File]::Copy($taskDocPath, $taskLocalPath, $true)
$taskPdfPath = Join-Path $taskRoot '.it-prep\qa-docx-render\WIDispatch_Client_IT_Questions_and_Answers.pdf'
$taskLocalPdf = Join-Path $env:TEMP "WIDispatch_IT_QA_$taskRenderId.pdf"
$taskWord = $null
$taskDoc = $null
try {
    Write-Output 'Starting Word renderer'
    $taskWord = New-Object -ComObject Word.Application
    Write-Output 'Word renderer connected'
    $taskWord.Visible = $false
    $taskWord.DisplayAlerts = 0
    $taskWord.AutomationSecurity = 3
    Write-Output 'Opening guide for read only rendering'
    $taskWord.Options.UpdateLinksAtOpen = $false
    $taskDoc = $taskWord.Documents.Open($taskLocalPath, $false, $true, $false)
    Write-Output 'Guide opened'
    Write-Output 'Exporting preview directly'
    $taskDoc.ExportAsFixedFormat($taskLocalPdf, 17)
    [System.IO.File]::Copy($taskLocalPdf, $taskPdfPath, $true)
    Write-Output "Rendered PDF: $taskPdfPath"
    Write-Output "Pages: $($taskDoc.ComputeStatistics(2))"
} finally {
    if ($null -ne $taskDoc) { $taskDoc.Close(0) }
    if ($null -ne $taskWord) { $taskWord.Quit() }
}
