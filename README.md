# myFuture bulk

Refresh your job-search documents on McGill **myFuture**: upload CVs, a transcript and
cover letters, rebuild one application package per CV, and delete the older dated copies.

## Job search and applications
- **Smart search**: search every posting at once with filters myFuture lacks. Use the *myFuture search* bookmark from
  `ui/install.html`, or the extension.
- **Extension** (`extension/`, load unpacked), works on its own: Smart search, and **My postings**, your shortlist, saved
  postings and applications in one list. **Prepare…** builds a package from your CV, transcript and cover letter;
  **Apply** / **Apply to all ready** opens myFuture's form with the package pre-selected (a banner follows you through
  every step). **Sync** reads your shortlist and which applications are started or submitted.
- **With Claude** (optional): tailored cover letters and application plans (`apply/`), handed to the extension through the local bridge
  (`native\install_host.ps1`). Details in `docs/job-applications.md`.

## Safety
Only PDFs upload. Nothing is ever submitted for you: you submit each application in myFuture.
