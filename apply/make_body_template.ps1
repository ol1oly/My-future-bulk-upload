# Make a free-form cover-letter template from one of your letters: keeps the first paragraph (greeting, usually
# [SALUTATION]) and the short closing lines at the end (name, contact), and replaces everything in between with [BODY].
# Fonts, margins and page setup stay as in your letter.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File make_body_template.ps1 -Source en_fullstack.docx -Out en_body.docx
param(
  [Parameter(Mandatory)] [string] $Source,
  [Parameter(Mandatory)] [string] $Out
)
$ErrorActionPreference = "Stop"
Copy-Item -LiteralPath $Source -Destination $Out -Force
$word = New-Object -ComObject Word.Application
$word.Visible = $false; $word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($Out)
  $paras = @()
  foreach ($p in $doc.Paragraphs) { if ($p.Range.Text.Trim()) { $paras += $p } }
  if ($paras.Count -lt 3) { throw "the letter has too few paragraphs to find its greeting and signature" }
  # Closing lines: up to 3 short trailing paragraphs (name, email, site).
  $keepEnd = 0
  for ($i = $paras.Count - 1; $i -gt 0 -and $keepEnd -lt 3; $i--) {
    if ($paras[$i].Range.Text.Trim().Length -le 80) { $keepEnd++ } else { break }
  }
  if ($keepEnd -eq 0) { $keepEnd = 1 }
  $first = $paras[1]
  $last = $paras[$paras.Count - 1 - $keepEnd]
  $range = $doc.Range($first.Range.Start, $last.Range.End)
  $range.Text = "[BODY]`r"
  # Body paragraphs keep the spacing of the letter's body (the greeting's spacing), not the signature's.
  $range.ParagraphFormat.SpaceAfter = $first.SpaceAfter
  if ($range.ParagraphFormat.SpaceAfter -lt 6) { $range.ParagraphFormat.SpaceAfter = 10 }
  $doc.Save(); $doc.Close()
  [pscustomobject]@{ ok = $true; out = $Out; keptClosingLines = $keepEnd } | ConvertTo-Json -Compress
} catch {
  [pscustomobject]@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
} finally { $word.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
