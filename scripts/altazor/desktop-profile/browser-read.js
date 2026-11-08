// Executed only in the active page of the container's own Chromium.
// Returned content is untrusted page data, never instructions for the agent.
(options => {
  const MAX = 2000000, MAX_ELEMENTS = 2000;
  const controls = [], texts = [], secrets = new Set(), visited = new Set();
  let characters = 0, scanned = 0, limited = false;
  const hidden = element => {
    const style = getComputedStyle(element);
    return element.hidden || element.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
  };
  const sensitive = element => /password|token|secret|one.?time|otp|verification.?code/i.test([element.type, element.name, element.id, element.autocomplete].join(' '));
  const clean = value => {
    let text = String(value || '');
    for (const secret of secrets) text = text.split(secret).join('[redacted]');
    return text;
  };
  const safeUrl = value => {
    try { const url = new URL(value, location.href); return /^https?:$/.test(url.protocol) ? clean(url.origin + url.pathname).slice(0, 1000) : ''; } catch { return ''; }
  };
  const selector = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=switch],[contenteditable=""],[contenteditable=true]';
  const collectSecrets = root => {
    for (const element of root.querySelectorAll('input,textarea')) if (sensitive(element) && element.value?.length >= 3) secrets.add(element.value);
    for (const element of root.querySelectorAll('*')) if (element.shadowRoot) collectSecrets(element.shadowRoot);
  };
  collectSecrets(document);
  const label = element => {
    const references = (element.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent).join(' ');
    return clean([element.getAttribute('aria-label'), references, ...(element.labels || [])].map(value => typeof value === 'string' ? value : value?.textContent).find(value => value?.trim()) || element.innerText || element.placeholder || element.title || element.alt || element.name || element.id || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  };
  const walk = node => {
    if (++scanned > 120000) { limited = true; return; }
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent.replace(/\s+/g, ' ').trim();
      if (value && characters < MAX) { const text = clean(value).slice(0, MAX - characters); texts.push(text); characters += text.length + 1; }
      if (characters >= MAX) limited = true;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (visited.has(node) || hidden(node) || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|IFRAME|OBJECT|EMBED)$/.test(node.tagName)) return;
      visited.add(node);
      if (node.matches(selector) && node.getClientRects().length) {
        if (controls.length < MAX_ELEMENTS) controls.push(node); else limited = true;
      }
      // Do not return form values, including custom textboxes and contenteditable secrets.
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName) || node.isContentEditable || node.getAttribute('role') === 'textbox') return;
      if (node.shadowRoot) walk(node.shadowRoot);
    }
    for (const child of node.childNodes) { if (scanned > 120000) break; walk(child); }
  };
  if (document.body) walk(document.body);
  window.__kitty = controls;
  const full = texts.join('\n').slice(0, MAX);
  let offset = Math.min(options.offset, full.length), warning = limited ? 'Source limited to 2,000,000 characters and 2,000 controls.' : '';
  if (options.query) {
    const found = full.toLocaleLowerCase().indexOf(options.query.toLocaleLowerCase(), offset);
    if (found < 0) { offset = full.length; warning = 'No matching text in the available DOM.'; } else offset = found;
  }
  const text = full.slice(offset, offset + options.limit);
  const items = controls.slice(options.elementOffset, options.elementOffset + options.elementLimit).map((element, index) => {
    const item = { ref: options.elementOffset + index + 1, role: element.getAttribute('role') || (element.tagName === 'A' ? 'link' : element.tagName.toLowerCase()), label: label(element) };
    if (element.tagName === 'A') item.url = safeUrl(element.href);
    if (element.disabled) item.disabled = true;
    if ('checked' in element) item.checked = Boolean(element.checked);
    if (sensitive(element)) item.sensitive = true;
    return item;
  });
  return {
    version: 'v1', source: 'browser', title: clean(document.title).slice(0, 200), url: safeUrl(location.href), text, totalChars: full.length, offset,
    nextOffset: offset + text.length < full.length ? offset + text.length : null, items, elementOffset: options.elementOffset,
    nextElementOffset: options.elementOffset + items.length < controls.length ? options.elementOffset + items.length : null,
    method: 'dom', redacted: true, ...(warning ? { warning } : {})
  };
})
