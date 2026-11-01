/** `text` with every match of the search marked, the way a highlighter would. */
export function Highlight({ text, pattern }: { text: string; pattern: RegExp | null }) {
  if (!pattern || text === '') return <>{text}</>;
  // A capture group keeps the matches in split's output, at the odd indices.
  const pieces = text.split(new RegExp(`(${pattern.source})`, 'giu'));
  return <>{pieces.map((piece, i) => (i % 2 === 1 ? <mark key={i}>{piece}</mark> : piece))}</>;
}
