import type { BoundingBox, TextFragment } from '@frameforge/scene-graph';

/** Keep a UTF-16 mapping back to the DOM while collapsing CSS whitespace. */
export function normalizeCapturedText(raw: string, whiteSpace: string) {
  const preserve = ['pre', 'pre-wrap', 'break-spaces'].includes(whiteSpace);
  const spans: { start: number; end: number }[] = [];
  let text = '';
  for (let i = 0; i < raw.length;) {
    const start = i;
    if (!preserve && /[\t\n\f\r ]/.test(raw[i]) && !(whiteSpace === 'pre-line' && raw[i] === '\n')) {
      const pattern = whiteSpace === 'pre-line' ? /[\t\f\r ]/ : /[\t\n\f\r ]/;
      while (i < raw.length && pattern.test(raw[i])) i++;
      text += ' '; spans.push({ start, end: i });
    } else {
      const value = String.fromCodePoint(raw.codePointAt(i)!);
      text += value;
      for (let j = 0; j < value.length; j++) spans.push({ start, end: i + value.length });
      i += value.length;
    }
  }
  return { text, spans };
}

/** Retain actual line positions, including the first-line indent after an inline element. */
export function* measureTextFragments(
  source: Node,
  normalized: ReturnType<typeof normalizeCapturedText>,
  originX: number,
  originY: number,
  signal?: AbortSignal
): Generator<void, TextFragment[]> {
  const fragments: TextFragment[] = [];
  const range = source.ownerDocument!.createRange();
  let current: TextFragment | null = null, measuredCharacters = 0;
  for (let i = 0; i < normalized.text.length;) {
    if (measuredCharacters++ % 64 === 0) { if (signal?.aborted) throw new Error('Capture cancelled.'); yield; }
    const value = String.fromCodePoint(normalized.text.codePointAt(i)!);
    const end = i + value.length;
    range.setStart(source, normalized.spans[i].start);
    range.setEnd(source, normalized.spans[end - 1].end);
    const rect = range.getBoundingClientRect();
    // Collapsed whitespace and explicit newlines have no painted rectangle.
    if (rect.width > 0 && rect.height > 0 && value !== '\n' && value !== '\r') {
      const bounds: BoundingBox = { x: rect.left - originX, y: rect.top - originY, width: rect.width, height: rect.height };
      if (current && current.end === i && Math.abs(current.bounds.y - bounds.y) < 1 && Math.abs(current.bounds.height - bounds.height) < 1) {
        const right = Math.max(current.bounds.x + current.bounds.width, bounds.x + bounds.width);
        current.bounds.x = Math.min(current.bounds.x, bounds.x);
        current.bounds.width = right - current.bounds.x;
        current.end = end;
      } else { current = { start: i, end, bounds }; fragments.push(current); }
    } else current = null;
    i = end;
  }
  return fragments;
}
