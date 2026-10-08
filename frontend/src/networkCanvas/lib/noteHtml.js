// Note rich text (SWIIMS `noteHtml`): a small allow-list of inline/block tags
// written by the contentEditable note editor. Everything else — scripts,
// styles, event handlers, links, every attribute — is stripped, so a note
// imported from a file can never inject markup into the page.

const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "BR", "DIV", "P", "SPAN", "UL", "OL", "LI"]);

export const escapeNoteHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");

function cleanNode(node, doc) {
  const out = doc.createDocumentFragment();
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      out.appendChild(doc.createTextNode(child.textContent));
      return;
    }
    if (child.nodeType !== 1) return;
    const tag = child.tagName.toUpperCase();
    const inner = cleanNode(child, doc);
    if (ALLOWED_TAGS.has(tag)) {
      const el = doc.createElement(tag.toLowerCase());
      el.appendChild(inner);
      out.appendChild(el);
    } else if (tag !== "SCRIPT" && tag !== "STYLE") {
      // Unknown wrapper: keep its text, drop the element.
      out.appendChild(inner);
    }
  });
  return out;
}

/** Allow-listed copy of note HTML (browser only; falls back to escaping). */
export function sanitizeNoteHtml(html) {
  if (html == null || html === "") return "";
  if (typeof DOMParser === "undefined" || typeof document === "undefined") return escapeNoteHtml(String(html).replace(/<[^>]*>/g, ""));
  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = parsed.body.firstChild;
  const container = document.createElement("div");
  container.appendChild(cleanNode(root, document));
  return container.innerHTML;
}

/** Plain text of note HTML, for the node label / search / exports. */
export function noteHtmlToText(html) {
  if (!html) return "";
  if (typeof document === "undefined") return String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "");
  const el = document.createElement("div");
  el.innerHTML = sanitizeNoteHtml(html.replace(/<br\s*\/?>/gi, "\n"));
  return el.textContent.trim();
}
