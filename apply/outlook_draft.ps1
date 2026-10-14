# Create (never send) an Outlook desktop draft with attachments, for postings that ask to apply by email.
# Usage: powershell -NoProfile -File outlook_draft.ps1 -To a@b.com -Subject "..." -BodyFile body.txt -Attach "a.pdf","b.pdf"
# Prints one JSON line: { ok, to, subject, attachments, error }. The draft lands in Outlook's Drafts folder for review.
param(
  [Parameter(Mandatory)] [string] $To,
  [Parameter(Mandatory)] [string] $Subject,
  [Parameter(Mandatory)] [string] $BodyFile,
  [string[]] $Attach = @()
)
$ErrorActionPreference = "Stop"
$result = [ordered]@{ ok = $false; to = $To; subject = $Subject; attachments = @(); error = $null }
try {
  foreach ($file in $Attach) { if (-not (Test-Path -LiteralPath $file)) { throw "attachment not found: $file" } }
  $outlook = New-Object -ComObject Outlook.Application
  $mail = $outlook.CreateItem(0)  # olMailItem
  $mail.To = $To
  $mail.Subject = $Subject
  $mail.Body = Get-Content -LiteralPath $BodyFile -Raw -Encoding UTF8
  foreach ($file in $Attach) { $null = $mail.Attachments.Add((Resolve-Path -LiteralPath $file).Path); $result.attachments += (Split-Path -Leaf $file) }
  $mail.Save()  # draft only — sending is always the user's click
  $result.ok = $true
} catch { $result.error = $_.Exception.Message }
$result | ConvertTo-Json -Compress
