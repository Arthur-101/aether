/**
 * Normalizes LaTeX delimiters written by a model into the `$` / `$$` form that
 * `remark-math` understands.
 *
 * Models commonly emit `\[ ... \]` for display math and `\( ... \)` for inline
 * math. CommonMark treats `\[` as an escaped bracket, so without this pass the
 * formula reaches the screen as literal backslashes and braces. Code spans and
 * fenced blocks are left untouched so shell and source examples survive.
 */
export function normalizeMathDelimiters(markdown: string): string {
  if (!markdown.includes('\\[') && !markdown.includes('\\(')) {
    return markdown;
  }

  const segments = markdown.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g);
  return segments
    .map((segment, index) => {
      // Odd indexes are the captured code segments.
      if (index % 2 === 1) return segment;
      return segment
        .replace(
          /\\\[([\s\S]+?)\\\]/g,
          (_match, body: string) => `\n\n$$\n${body.trim()}\n$$\n\n`
        )
        .replace(/\\\(([\s\S]+?)\\\)/g, (_match, body: string) => `$${body.trim()}$`);
    })
    .join('');
}