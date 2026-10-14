(function () {
  "use strict";

  // In-page engine for an Orbis (myFuture) postings results page. Runs in the page's MAIN world because it reuses
  // the page's own controller path, form tokens and helpers. Tokens never leave the page: callers get plain posting
  // data and act through open()/apply()/toggleShortlist()/notInterested().
  if (globalThis.__orbisBoard) return;

  const params = new Map();   // postingId -> { view, apply } buildForm parameter objects
  const details = new Map();  // postingId -> [{label, value}]
  const CACHE_KEY = `__orbisBoardDetails:${location.pathname}`;

  try {
    for (const [id, pairs] of Object.entries(JSON.parse(sessionStorage.getItem(CACHE_KEY) || "{}"))) details.set(id, pairs);
  } catch (error) { /* cache is optional */ }

  function persist() {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(details))); } catch (error) { /* quota: keep in memory */ }
  }

  function tokensFrom(fn, keys) {
    const source = String(fn || "");
    const out = {};
    for (const key of keys) {
      const match = source.match(new RegExp(`${key}\\s*:\\s*'([^']+)'`));
      if (match) out[key] = match[1];
    }
    return out;
  }

  function buildFormParams(anchor) {
    const match = (anchor?.getAttribute("onclick") || "").match(/buildForm\((\{.*?\})\s*,/);
    return match ? JSON.parse(match[1].replace(/'/g, '"')) : null;
  }

  function ready() {
    return typeof globalThis.loadPostingTable === "function" && typeof globalThis.controllerPath === "string";
  }

  function text(node) {
    return (node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  async function post(body) {
    const response = await fetch(globalThis.controllerPath, { method: "POST", body, credentials: "same-origin" });
    if (!response.ok) throw new Error(`myFuture answered ${response.status}`);
    // Some myFuture responses are Windows-1252 without saying so; decoding them as UTF-8 breaks accents.
    const bytes = await response.arrayBuffer();
    let html;
    try { html = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch (error) { html = new TextDecoder("windows-1252").decode(bytes); }
    return new DOMParser().parseFromString(html, "text/html");
  }

  function parseRows(doc) {
    const rows = [];
    const headers = [...doc.querySelectorAll("#postingsTable thead th")].map(text);
    const col = (name) => headers.findIndex((header) => header.toLowerCase() === name);
    const idx = { status: col("app status"), id: col("id"), title: col("job title"), org: col("organization"), division: col("division"), type: col("position type"), city: col("city"), deadline: col("app deadline") };
    for (const tr of doc.querySelectorAll("#postingsTable tbody tr")) {
      // Rows carry an extra leading cell (Shortlist/Apply buttons) that has no header.
      const all = [...tr.children];
      const cells = all.slice(Math.max(0, all.length - headers.length));
      const id = text(cells[idx.id]) || (tr.className.match(/posting(\d+)/) || [])[1];
      if (!id) continue;
      const anchors = [...tr.querySelectorAll("a")];
      const applyAnchor = anchors.find((a) => text(a) === "Apply" || text(a) === "Postuler");
      const viewAnchor = anchors.find((a) => a !== applyAnchor && /buildForm/.test(a.getAttribute("onclick") || ""));
      params.set(id, { view: buildFormParams(viewAnchor), apply: buildFormParams(applyAnchor) });
      rows.push({
        id,
        title: text(cells[idx.title]).replace(/^NEW\s+/, ""),
        organization: text(cells[idx.org]),
        division: text(cells[idx.division]),
        positionType: text(cells[idx.type]),
        city: text(cells[idx.city]),
        deadlineText: text(cells[idx.deadline]),
        appStatus: text(cells[idx.status]),
        shortlisted: /\bisFav\b/.test(tr.className),
        isNew: /\bisNew\b/.test(tr.className),
        canApply: Boolean(applyAnchor)
      });
    }
    return rows;
  }

  async function listAll({ onProgress } = {}) {
    if (!ready()) throw new Error("Open the myFuture postings results (View all available postings or a search) first.");
    const tok = tokensFrom(globalThis.loadPostingTable, ["action", "initialSearchAction"]);
    const all = [];
    const seen = new Set();
    for (let page = 1; page <= 50; page += 1) {
      const body = new URLSearchParams({
        action: tok.action, orderBy: "", oldOrderBy: "ID", sortDirection: "Reverse", keyword: "", searchBy: "advanced",
        searchType: "", initialSearchAction: tok.initialSearchAction, postings: "infoForPostings", page: String(page),
        currentPage: "1", rand: String(Math.floor(Math.random() * 100000))
      });
      const rows = parseRows(await post(body)).filter((row) => !seen.has(row.id));
      rows.forEach((row) => seen.add(row.id));
      all.push(...rows);
      onProgress?.({ phase: "list", done: all.length });
      if (rows.length === 0) break;
    }
    return all;
  }

  async function fetchDetail(id) {
    if (details.has(id)) return details.get(id);
    const view = params.get(id)?.view;
    if (!view) throw new Error(`No view link for posting ${id}`);
    const body = new FormData();
    for (const [key, value] of Object.entries(view)) body.append(key, value);
    const doc = await post(body);
    const pairs = [];
    for (const tr of doc.querySelectorAll("tr")) {
      const cells = [...tr.children];
      if (cells.length !== 2) continue;
      const label = text(cells[0]);
      const value = (cells[1].innerText || cells[1].textContent || "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
      const links = [...cells[1].querySelectorAll("a[href^='http'], a[href^='mailto:']")].map((a) => a.getAttribute("href"));
      if (label && label.length < 80 && value) pairs.push({ label, value: links.length && !links.every((href) => value.includes(href.replace(/^mailto:/, ""))) ? `${value}\n${links.join("\n")}` : value });
    }
    details.set(id, pairs);
    return pairs;
  }

  async function fetchDetails(ids, { concurrency = 3, onProgress } = {}) {
    let next = 0, done = 0;
    const errors = {};
    async function worker() {
      while (next < ids.length) {
        const id = ids[next++];
        try { await fetchDetail(id); } catch (error) { errors[id] = error.message; }
        done += 1;
        onProgress?.({ phase: "details", done, total: ids.length });
        if (done % 20 === 0) persist();
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    persist();
    return { details: Object.fromEntries(ids.filter((id) => details.has(id)).map((id) => [id, details.get(id)])), errors };
  }

  function submitForm(formParams, target = "_BLANK") {
    if (!formParams || !globalThis.orbisAppSr?.buildForm) throw new Error("This posting has no such action.");
    globalThis.orbisAppSr.buildForm(formParams, "", target).submit();
  }

  async function toggle(fnName, id) {
    const { action } = tokensFrom(globalThis[fnName], ["action"]);
    if (!action) throw new Error(`${fnName} not available on this page`);
    const response = await fetch(globalThis.controllerPath, {
      method: "POST", credentials: "same-origin",
      body: new URLSearchParams({ action, postingId: String(id), rand: String(Math.floor(Math.random() * 100000)) })
    });
    if (!response.ok) throw new Error(`myFuture answered ${response.status}`);
    return true;
  }

  globalThis.__orbisBoard = {
    ready,
    listAll,
    fetchDetail,
    fetchDetails,
    cached: (id) => details.get(String(id)) || null,
    clearCache() { details.clear(); try { sessionStorage.removeItem(CACHE_KEY); } catch (error) { /* ignore */ } },
    open: (id) => submitForm(params.get(String(id))?.view),
    // Opens myFuture's own application wizard in a new tab; the student chooses documents and submits there.
    apply: (id) => submitForm(params.get(String(id))?.apply),
    // Same form in THIS tab (used by the bridge in a tab it opened, so no pop-up permission is needed).
    applyHere: (id) => submitForm(params.get(String(id))?.apply, "_self"),
    toggleShortlist: (id) => toggle("saveFavoritePosting", id),
    notInterested: (id) => toggle("toggleBlacklistPosting", id)
  };
})();
