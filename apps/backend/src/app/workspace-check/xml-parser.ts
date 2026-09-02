/**
 * Minimal, purpose-built XML parser for the fixed workspace-SVG schema
 * (see docs/workspace-svg-format.md) — not a general-purpose XML/SVG parser. It only needs to
 * handle what the frontend's own `XMLSerializer.serializeToString()` ever produces: elements,
 * double-quoted attributes, self-closing tags and text content. No external dependency (no DOM
 * available on the backend) is worth pulling in for that fixed, self-controlled shape.
 */
export interface XmlElement {
  tagName: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  text: string;
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(value: string): string {
  return value.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === '#') {
      const isHex = entity[1] === 'x' || entity[1] === 'X';
      const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

export function parseXml(source: string): XmlElement {
  const len = source.length;
  let i = 0;

  const skipWhitespace = () => {
    while (i < len && /\s/.test(source[i])) i++;
  };

  /** Skips whitespace, the `<?xml ... ?>` declaration, comments and doctype-like `<! ... >`
   * markers — anything that isn't an element the caller cares about. */
  const skipNonElements = () => {
    for (;;) {
      skipWhitespace();
      if (source.startsWith('<?', i)) {
        const end = source.indexOf('?>', i);
        i = end === -1 ? len : end + 2;
        continue;
      }
      if (source.startsWith('<!--', i)) {
        const end = source.indexOf('-->', i);
        i = end === -1 ? len : end + 3;
        continue;
      }
      if (source.startsWith('<!', i)) {
        const end = source.indexOf('>', i);
        i = end === -1 ? len : end + 1;
        continue;
      }
      break;
    }
  };

  const parseAttributes = (): Record<string, string> => {
    const attributes: Record<string, string> = {};
    for (;;) {
      skipWhitespace();
      if (i >= len || source[i] === '/' || source[i] === '>') break;
      const nameMatch = /^[^\s=/>]+/.exec(source.slice(i));
      if (!nameMatch) break;
      const name = nameMatch[0];
      i += name.length;
      skipWhitespace();
      let value = '';
      if (source[i] === '=') {
        i++;
        skipWhitespace();
        const quote = source[i];
        if (quote === '"' || quote === "'") {
          i++;
          const end = source.indexOf(quote, i);
          const stop = end === -1 ? len : end;
          value = decodeEntities(source.slice(i, stop));
          i = stop + 1;
        }
      }
      attributes[name] = value;
    }
    return attributes;
  };

  const parseElement = (): XmlElement | null => {
    skipNonElements();
    if (source[i] !== '<') return null;
    i++;
    const nameMatch = /^[^\s/>]+/.exec(source.slice(i));
    if (!nameMatch) throw new Error('Balise XML malformée.');
    const tagName = nameMatch[0];
    i += tagName.length;
    const attributes = parseAttributes();
    skipWhitespace();

    if (source.startsWith('/>', i)) {
      i += 2;
      return { tagName, attributes, children: [], text: '' };
    }
    if (source[i] !== '>') throw new Error(`Balise <${tagName}> malformée.`);
    i++;

    const children: XmlElement[] = [];
    let text = '';
    for (;;) {
      if (source.startsWith(`</${tagName}>`, i)) {
        i += tagName.length + 3;
        break;
      }
      if (i >= len) throw new Error(`Balise <${tagName}> jamais refermée.`);
      if (source[i] === '<' && !source.startsWith('<!--', i)) {
        const child = parseElement();
        if (child) children.push(child);
        continue;
      }
      if (source.startsWith('<!--', i)) {
        const end = source.indexOf('-->', i);
        i = end === -1 ? len : end + 3;
        continue;
      }
      const next = source.indexOf('<', i);
      const stop = next === -1 ? len : next;
      text += source.slice(i, stop);
      i = stop;
    }
    return { tagName, attributes, children, text: decodeEntities(text.trim()) };
  };

  const root = parseElement();
  if (!root) {
    throw new Error('Document XML vide ou invalide.');
  }
  return root;
}

export function findChild(element: XmlElement, tagName: string): XmlElement | null {
  return element.children.find((child) => child.tagName === tagName) ?? null;
}

export function findDescendant(
  element: XmlElement,
  predicate: (candidate: XmlElement) => boolean,
): XmlElement | null {
  for (const child of element.children) {
    if (predicate(child)) return child;
    const found = findDescendant(child, predicate);
    if (found) return found;
  }
  return null;
}
