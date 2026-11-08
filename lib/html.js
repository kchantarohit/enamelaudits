// Tiny dependency-free HTML helpers. Good enough for auditing public marketing pages.

export function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

export function parseAttrs(tag) {
  const attrs = {};
  const inner = tag.replace(/^<\s*[\w:-]+/, '').replace(/\/?>$/, '');
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(inner))) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** All opening tags of the given name, as attribute maps (with the raw tag on `_raw`). */
export function findTags(html, name) {
  const re = new RegExp(`<${name}(?=[\\s>/])[^>]*>`, 'gi');
  return [...html.matchAll(re)].map(m => ({ ...parseAttrs(m[0]), _raw: m[0], _index: m.index }));
}

/** Inner content of all <name>...</name> elements. */
export function findElements(html, name) {
  const re = new RegExp(`<${name}(?=[\\s>])([^>]*)>([\\s\\S]*?)</${name}\\s*>`, 'gi');
  return [...html.matchAll(re)].map(m => ({ attrs: parseAttrs(`<${name}${m[1]}>`), inner: m[2], _index: m.index }));
}

export function textContent(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

export function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => safeChar(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeChar(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&copy;/g, '©');
}

function safeChar(n) {
  try { return String.fromCodePoint(n); } catch { return ''; }
}

export function metaContent(html, key) {
  const k = key.toLowerCase();
  const tag = findTags(html, 'meta').find(t => (t.name || t.property || '').toLowerCase() === k);
  return tag ? (tag.content || '').trim() : null;
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
