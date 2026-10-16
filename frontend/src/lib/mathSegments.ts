export type MathSegment =
  | { type: 'text'; value: string }
  | { type: 'math'; value: string; displayMode: boolean }
  | { type: 'malformed'; value: string };

function isEscaped(source: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function findClosingDelimiter(source: string, start: number, delimiter: string): number {
  let index = start;
  while (index < source.length) {
    const found = source.indexOf(delimiter, index);
    if (found < 0) return -1;
    if (!isEscaped(source, found)) return found;
    index = found + delimiter.length;
  }
  return -1;
}

export function parseMathSegments(source: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let text = '';
  let index = 0;
  const flushText = () => {
    if (text) segments.push({ type: 'text', value: text });
    text = '';
  };

  while (index < source.length) {
    if (source[index] === '\\') {
      let runEnd = index;
      while (source[runEnd] === '\\') runEnd += 1;
      const slashCount = runEnd - index;
      if (source[runEnd] === '$' && slashCount % 2 === 1) {
        text += `${'\\'.repeat(slashCount - 1)}$`;
        index = runEnd + 1;
        continue;
      }
      text += '\\'.repeat(slashCount);
      index = runEnd;
      continue;
    }
    if (source[index] !== '$') {
      text += source[index];
      index += 1;
      continue;
    }
    const displayMode = source[index + 1] === '$';
    const delimiter = displayMode ? '$$' : '$';
    const contentStart = index + delimiter.length;
    const closeIndex = findClosingDelimiter(source, contentStart, delimiter);
    flushText();
    if (closeIndex < 0) {
      segments.push({ type: 'malformed', value: source.slice(index) });
      return segments;
    }
    segments.push({ type: 'math', value: source.slice(contentStart, closeIndex), displayMode });
    index = closeIndex + delimiter.length;
  }
  flushText();
  return segments;
}