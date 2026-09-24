$filePath = 'f:/gharpayy/src/bf100x/SplitFlow.tsx'
$lines = Get-Content $filePath
$lines[503] = '          {lead && lead.stage !== "Closed / Disqualified" ? (<WhatsAppDraftPanel lead={lead} />) : null}'
Set-Content $filePath $lines
Write-Host "Done. Line 504 is now: $($lines[503])"
