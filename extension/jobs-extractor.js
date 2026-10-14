(function () {
  "use strict";

  // Collects label/value pairs from a job posting page. Layout-agnostic on purpose: Orbis (myFuture) renders
  // postings as label/value table rows in its classic UI and as label/value blocks in newer UIs, and other job
  // boards use <dl> lists. Field meaning is decided later by lib/jobs.js from the label text, not from markup.
  function text(element) {
    return (element?.innerText || element?.textContent || "").replace(/ /g, " ").trim();
  }

  function looksLikeLabel(value) {
    return value.length > 1 && value.length <= 80 && !/\n/.test(value) && /[A-Za-zÀ-ÿ]/.test(value);
  }

  function collectPairs(root = document) {
    const pairs = [];
    const seen = new Set();
    const add = (label, value) => {
      label = (label || "").trim(); value = (value || "").trim();
      if (!looksLikeLabel(label) || !value || value === label) return;
      const key = `${label}\u0000${value.slice(0, 200)}`;
      if (seen.has(key)) return;
      seen.add(key);
      pairs.push({ label, value: value.slice(0, 20000) });
    };

    // 0. Orbis Outcome UI (2024+): <div class="tag__key-value-list"><span class="label">Label:</span><p>value</p></div>.
    for (const block of root.querySelectorAll(".tag__key-value-list")) {
      const labelNode = block.querySelector(".label");
      if (!labelNode) continue;
      const label = text(labelNode);
      add(label, text(block).slice(text(block).indexOf(label) + label.length));
    }

    // 1. Table rows (also the legacy Orbis UI): <th>Label</th><td>Value</td> or <td>Label:</td><td>Value</td>.
    for (const row of root.querySelectorAll("tr")) {
      const cells = [...row.children].filter((cell) => /^(TD|TH)$/.test(cell.tagName));
      if (cells.length === 2) add(text(cells[0]), text(cells[1]));
    }

    // 2. Definition lists.
    for (const term of root.querySelectorAll("dt")) {
      const definition = term.nextElementSibling;
      if (definition && definition.tagName === "DD") add(text(term), text(definition));
    }

    // 3. Label-ish elements followed by a value sibling (div/span/strong/label/h4 "Label:" + next element).
    for (const element of root.querySelectorAll("label, strong, b, h3, h4, h5, span, div, p")) {
      if (element.children.length > 1) continue;
      const label = text(element);
      if (!/[:：]\s*$/.test(label) && !/label|heading|title|question/i.test(element.className || "")) continue;
      if (!looksLikeLabel(label)) continue;
      const sibling = element.nextElementSibling;
      if (sibling) { add(label, text(sibling)); continue; }
      // "Label: value" inside one parent, e.g. <p><strong>Salary:</strong> $25/h</p>.
      const parent = element.parentElement;
      if (parent && parent.children.length === 1) add(label, text(parent).slice(label.length));
    }
    return pairs;
  }

  function pageTitle() {
    const heading = document.querySelector("h1, h2, .dashboard-header__profile-information h1");
    return text(heading) || document.title.replace(/\s*[|–—-]\s*(myFuture|Orbis).*$/i, "").trim();
  }

  globalThis.__jobPostingCollect = function () {
    const main = document.querySelector("main, #mainContentDiv, .orbis-posting-content, [role='main']") || document.body;
    return {
      url: location.href,
      title: pageTitle(),
      pairs: collectPairs(document.body),
      text: text(main).slice(0, 30000),
      selection: String(getSelection?.() || "").trim().slice(0, 30000)
    };
  };
})();
