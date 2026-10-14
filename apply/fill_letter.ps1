# Fill a [SLOT]-style .docx cover-letter template with Word and export a 1-page PDF.
# Usage: powershell -NoProfile -File fill_letter.ps1 -Template <slots\en_fullstack.docx> -OutStem <dir\name> -SlotsJson <slots.json>
#        [-Forbid "CN,Beenox,Ada"] [-MaxPages 1]
# slots.json: { "SALUTATION": "Dear Jane Smith,", "ROLE": "...", "COMPANY": "...", "INTEREST_ABOUT_ROLE": "...", "QUALITY": "..." }
# Prints one JSON line: { ok, docx, pdf, pages, leftovers, forbidden, error }. Never overwrites the template.
param(
  [Parameter(Mandatory)] [string] $Template,
  [Parameter(Mandatory)] [string] $OutStem,
  [Parameter(Mandatory)] [string] $SlotsJson,
  [string] $Forbid = "",
  [int] $MaxPages = 1
)
$ErrorActionPreference = "Stop"
$result = [ordered]@{ ok = $false; docx = "$OutStem.docx"; pdf = "$OutStem.pdf"; pages = 0; leftovers = @(); forbidden = @(); error = $null }
$word = $null; $doc = $null
try {
  $slots = Get-Content -LiteralPath $SlotsJson -Raw -Encoding UTF8 | ConvertFrom-Json
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutStem) | Out-Null
  Copy-Item -LiteralPath $Template -Destination $result.docx -Force
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open($result.docx)

  foreach ($slot in $slots.PSObject.Properties) {
    $token = "[$($slot.Name)]"
    $value = [string] $slot.Value
    # Word's Find spans formatting runs; setting Range.Text avoids the 255-char replace limit and keeps run style.
    for ($guard = 0; $guard -lt 20; $guard++) {
      $range = $doc.Content
      $find = $range.Find
      $find.ClearFormatting()
      $find.MatchWildcards = $false
      if (-not $find.Execute($token)) { break }
      $range.Text = $value
    }
  }
  # Templates say "[INTEREST_ABOUT_ROLE]." — avoid a doubled period when the sentence already ends with one.
  $range = $doc.Content; $find = $range.Find
  $null = $find.Execute("..", $false, $false, $false, $false, $false, $true, 1, $false, ".", 2)

  $text = $doc.Content.Text
  $result.leftovers = @([regex]::Matches($text, "\[[A-Z_]+\]") | ForEach-Object { $_.Value } | Select-Object -Unique)
  $company = [string] $slots.COMPANY
  foreach ($name in ($Forbid -split ",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }) {
    if ($company -and $company -match [regex]::Escape($name)) { continue }
    if ($text -match "\b$([regex]::Escape($name))\b") { $result.forbidden += $name }
  }
  $result.pages = $doc.ComputeStatistics(2)  # wdStatisticPages
  $doc.Save()
  $doc.ExportAsFixedFormat($result.pdf, 17)  # wdExportFormatPDF
  $result.ok = ($result.leftovers.Count -eq 0) -and ($result.forbidden.Count -eq 0) -and ($result.pages -le $MaxPages)
  if (-not $result.ok) { $result.error = "check failed: fix the slots (or the template) and re-run before using this letter" }
} catch {
  $result.error = $_.Exception.Message
} finally {
  if ($doc) { $doc.Close([ref] 0) | Out-Null }
  if ($word) { $word.Quit() | Out-Null; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
}
$result | ConvertTo-Json -Compress
