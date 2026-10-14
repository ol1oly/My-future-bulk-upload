# Build cover-letter templates (.docx with [SLOT]s) from a JSON file of paragraphs, reusing the look of an existing letter.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File build_templates.ps1 -Json templates.json -Base my_letter.docx -OutDir slots
# templates.json: { "<lang>_<track>": ["[SALUTATION]", "paragraph with [ROLE] [COMPANY] [INTEREST_ABOUT_ROLE]", ..., "Name", "contact line"] }
param(
  [Parameter(Mandatory)] [string] $Json,
  [Parameter(Mandatory)] [string] $Base,
  [Parameter(Mandatory)] [string] $OutDir
)
$ErrorActionPreference = "Stop"
$templates = [IO.File]::ReadAllText($Json, [Text.Encoding]::UTF8) | ConvertFrom-Json
$out = $OutDir
New-Item -ItemType Directory -Force -Path $out | Out-Null
$base = $Base
$word = New-Object -ComObject Word.Application
$word.Visible = $false; $word.DisplayAlerts = 0
try {
  foreach ($prop in $templates.PSObject.Properties) {
    if ($prop.Name.StartsWith("_")) { continue }
    $dst = Join-Path $out "$($prop.Name).docx"
    Copy-Item -LiteralPath $base -Destination $dst -Force
    $doc = $word.Documents.Open($dst)
    $content = $doc.Content
    $content.Text = ($prop.Value -join "`r")
    $content.Font.Bold = $false
    $content.Font.Underline = 0
    while ($doc.Hyperlinks.Count -gt 0) { $doc.Hyperlinks.Item(1).Delete() }
    $content.ParagraphFormat.SpaceBefore = 0
    $content.ParagraphFormat.SpaceAfter = 10
    $content.ParagraphFormat.FirstLineIndent = 0
    $count = $doc.Paragraphs.Count
    # Name and contact line close together at the end.
    $doc.Paragraphs.Item($count - 1).SpaceAfter = 0
    $doc.Save(); $doc.Close()
    [pscustomobject]@{ template = $prop.Name; paragraphs = $count }
  }
} finally { $word.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
