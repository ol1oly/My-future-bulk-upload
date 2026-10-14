// Shows the cover-letter PDF the extension handed over (chrome.storage.session "viewPdf": { name, base64 }).
(async () => {
  "use strict";
  const { viewPdf } = await chrome.storage.session.get("viewPdf");
  if (!viewPdf?.base64) {
    document.body.append(Object.assign(document.createElement("p"), { textContent: "No letter to show. Open it again from the extension." }));
    return;
  }
  const binary = atob(viewPdf.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  document.title = viewPdf.name || "Cover letter";
  document.querySelector("#name").textContent = viewPdf.name || "Cover letter";
  const download = document.querySelector("#download");
  download.href = url;
  download.download = viewPdf.name || "cover-letter.pdf";
  document.querySelector("#pdf").src = url;
})();
