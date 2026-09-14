// McGill myFuture (Orbis) — create application packages. Run INSIDE the "Create Application Package" form page
// (overview -> "Create Application Package").
// window.__MFP = { packages: [{ name: 'en_cv_2026-09-14', cv: 'en_cv_2026-09-14', transcript?: '...', coverLetter?: '...' }],
//                  dryRun?: true }   // cv / transcript / coverLetter = document NAMES exactly as shown in the dropdowns
// Returns a JSON string, never token values.
(async () => {
  const cfg = window.__MFP || {};
  const P = cfg.packages || [];
  if (!P.length) throw new Error('window.__MFP.packages is empty');
  const form = document.querySelector('input[name=name]')?.closest('form');
  if (!form || !form.querySelector('select[name="14"]')) throw new Error('not on the "Create Application Package" form');

  const SEL = { coverLetter: '13', cv: '14', transcript: '15', other: '16' };
  const pick = (field, docName) => {
    if (!docName) return '';
    const s = form.querySelector(`select[name="${SEL[field]}"]`);
    if (!s) throw new Error(`the package form has no ${field} dropdown`);
    const opts = [...s.options].filter(o => o.text.trim() === docName);
    if (opts.length !== 1) throw new Error(`${field} "${docName}": ${opts.length} documents with that name`);
    return opts[0].value;
  };
  const plan = P.map(p => ({ name: p.name, ids: Object.fromEntries(Object.keys(SEL).map(k => [k, pick(k, p[k])])) }));
  if (plan.some(p => !p.name || !p.ids.cv)) throw new Error('every package needs a name and a cv');
  if (cfg.dryRun) return JSON.stringify({ dryRun: true, packages: plan.map(p => ({ name: p.name, parts: Object.keys(p.ids).filter(k => p.ids[k]) })) });

  const results = [];
  for (const [k, p] of plan.entries()) {
    if (k) await new Promise(r => setTimeout(r, 300));  // gentle on the site's security service
    const fd = new FormData(form);
    fd.set('name', p.name);
    for (const [field, id] of Object.entries(p.ids)) {
      if (form.querySelector(`select[name="${SEL[field]}"]`)) fd.set(SEL[field], id);
    }
    const r = await fetch(location.origin + '/myAccount/opportunities/documents.htm', { method: 'POST', body: fd, credentials: 'same-origin' });
    const d = new DOMParser().parseFromString(await r.text(), 'text/html');
    d.querySelectorAll('script,style,noscript').forEach(x => x.remove());
    const t = d.body.textContent;
    const status = /Documents Created In/.test(t) ? 'created' : /PACKAGE REQUIREMENTS/.test(t) ? 'form-returned (not created)' : 'unexpected-page';
    results.push({ name: p.name, status });
    if (status !== 'created') break;
  }
  return JSON.stringify({ ok: results.length === plan.length && results.every(r => r.status === 'created'), results });
})();
