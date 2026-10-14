# myFuture bulk

Refresh your job-search documents on McGill **myFuture**: upload CVs, a transcript and
cover letters, rebuild one application package per CV, and delete the older dated copies.

## Job search and applications
- **Smart search**: search every posting at once with filters myFuture lacks. Use the *myFuture search* bookmark from
  `ui/install.html`, or the extension.
- **Extension** (`extension/`, load unpacked), works on its own: Smart search, and **My postings**: your open myFuture
  shortlist, suggestions and applications. **Find matches** reads every Internship / Co-op posting and suggests the best
  ones; **Apply** opens myFuture's form (a banner follows each step and pre-selects your package); **Package…** optionally
  bundles the recommended CV, transcript and a cover letter (yours, or a PDF you pick, with a preview); **View letter**
  opens the letter in a package; **Sync** reads your shortlist and what's already submitted.
- **With Claude Code** (optional, Windows + Word): install the local bridge (`native\install_host.ps1`) and set up a
  profile of facts + letter templates (`apply/SKILL.md`). Then Find matches lets Claude pick postings and explain why, and
  **Package… → Write one with Claude** drafts the posting-specific sentence (Claude runs with no tools; you review and
  preview the whole letter) and builds the PDF from your template.

## Safety
Only PDFs upload. Nothing is ever submitted for you: you submit each application in myFuture.
