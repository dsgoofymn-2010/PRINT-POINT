/**
 * Parses a page-range expression such as "1-10, 15, 20-end" into a sorted list
 * of unique page numbers. Throws a descriptive Error on invalid input.
 */
export function parsePageRange(expr: string | null | undefined, totalPages: number): number[] {
  if (totalPages < 1) throw new Error('Document has no pages');
  const trimmed = (expr ?? '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'all') {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>();
  const toNum = (token: string): number => {
    const t = token.trim().toLowerCase();
    if (t === 'end' || t === 'last') return totalPages;
    if (!/^\d+$/.test(t)) throw new Error(`Invalid page "${token.trim()}"`);
    return Number(t);
  };

  for (const part of trimmed.split(',')) {
    if (!part.trim()) continue;
    const bounds = part.split('-');
    if (bounds.length > 2) throw new Error(`Invalid range "${part.trim()}"`);
    const start = toNum(bounds[0]);
    const end = bounds.length === 2 ? toNum(bounds[1]) : start;
    if (start < 1 || end < 1) throw new Error('Page numbers start at 1');
    if (start > end) throw new Error(`Range "${part.trim()}" is reversed`);
    if (end > totalPages) throw new Error(`Page ${end} is beyond the last page (${totalPages})`);
    for (let p = start; p <= end; p++) pages.add(p);
  }

  if (pages.size === 0) throw new Error('No pages selected');
  return [...pages].sort((a, b) => a - b);
}
