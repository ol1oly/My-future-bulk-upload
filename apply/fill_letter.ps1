# Fill [SLOT]-style .docx cover-letter templates with Word and export 1-page PDFs.
# One letter:
#   powershell -NoProfile -File fill_letter.ps1 -Template <en_fullstack.docx> -OutStem <dir\name> -SlotsJson <slots.json>
#              [-Forbid "CN,Beenox,Ada"] [-MaxPages 1]
# Many letters in ONE Word session (Word starts once, so each extra letter takes seconds instead of ~a minute):
#   powershell -NoProfile -File fill_letter.ps1 -BatchJson <jobs.json> [-PidFile <word.pid>]
#   jobs.json: [ { "template": "...docx", "outStem": "dir\\name", "slotsJson": "slots.json", "forbid": "", "maxPages": 1, "id": "..." } ]
# slots.json: { "SALUTATION": "Dear Jane Smith,", "ROLE": "...", "COMPANY": "...", "INTEREST_ABOUT_ROLE": "..." }
# Prints one JSON line per letter (UTF-8): { id, ok, docx, pdf, pages, leftovers, forbidden, error }. Never overwrites a template.
# -PidFile: where to write the id of the Word process this run started, so a caller that times out can end it.
param(
  [string] $Template,
  [string] $OutStem,
  [string] $SlotsJson,
  [string] $Forbid = "",
  [int] $MaxPages = 1,
  [string] $BatchJson,
  [string] $PidFile
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Fill-Letter($word, $template, $outStem, $slotsJson, $forbid, $maxPages, $id) {
  $result = [ordered]@{ id = $id; ok = $false; docx = "$outStem.docx"; pdf = "$outStem.pdf"; pages = 0; leftovers = @(); forbidden = @(); error = $null }
  $doc = $null
  try {
    $slots = [IO.File]::ReadAllText($slotsJson, [Text.Encoding]::UTF8) | ConvertFrom-Json
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outStem) | Out-Null
    Copy-Item -LiteralPath $template -Destination $result.docx -Force
    $doc = $word.Documents.Open($result.docx)
    foreach ($slot in $slots.PSObject.Properties) {
      $value = [string] $slot.Value
      # Templates say "[INTEREST_ABOUT_ROLE]." : when the text already ends with a period, replace the slot's period too.
      $tokens = @("[$($slot.Name)]")
      if ($value.EndsWith(".")) { $tokens = @("[$($slot.Name)].") + $tokens }
      foreach ($token in $tokens) {
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
    }

    $text = $doc.Content.Text
    $result.leftovers = @([regex]::Matches($text, "\[[A-Z_]+\]") | ForEach-Object { $_.Value } | Select-Object -Unique)
    $company = [string] $slots.COMPANY
    foreach ($name in ($forbid -split ",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }) {
      if ($company -and $company -match [regex]::Escape($name)) { continue }
      if ($text -match "\b$([regex]::Escape($name))\b") { $result.forbidden += $name }
    }
    $result.pages = $doc.ComputeStatistics(2)  # wdStatisticPages
    $doc.Save()
    $doc.ExportAsFixedFormat($result.pdf, 17)  # wdExportFormatPDF
    $result.ok = ($result.leftovers.Count -eq 0) -and ($result.forbidden.Count -eq 0) -and ($result.pages -le $maxPages)
    if (-not $result.ok) {
      $result.error = if ($result.pages -gt $maxPages) { "the letter is $($result.pages) pages; make it shorter" } else { "check failed: fix the slots (or the template) and re-run before using this letter" }
    }
  } catch {
    $result.error = $_.Exception.Message
  } finally {
    if ($doc) { $doc.Close([ref] 0) | Out-Null }
  }
  return $result
}

$word = $null
try {
  $before = @(Get-Process WINWORD -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
  $word = New-Object -ComObject Word.Application
  $started = @(Get-Process WINWORD -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id })
  if ($PidFile -and $started.Count -eq 1) { [IO.File]::WriteAllText($PidFile, [string] $started[0].Id) }
  $word.Visible = $false
  $word.DisplayAlerts = 0
  if ($BatchJson) {
    $jobs = [IO.File]::ReadAllText($BatchJson, [Text.Encoding]::UTF8) | ConvertFrom-Json
    foreach ($job in @($jobs)) {
      $pages = if ($job.maxPages) { [int] $job.maxPages } else { 1 }
      Fill-Letter $word $job.template $job.outStem $job.slotsJson ([string] $job.forbid) $pages ([string] $job.id) | ConvertTo-Json -Compress
    }
  } else {
    if (-not ($Template -and $OutStem -and $SlotsJson)) { throw "give -Template, -OutStem and -SlotsJson, or -BatchJson" }
    Fill-Letter $word $Template $OutStem $SlotsJson $Forbid $MaxPages "" | ConvertTo-Json -Compress
  }
} catch {
  [ordered]@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
} finally {
  if ($word) { $word.Quit() | Out-Null; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
}
