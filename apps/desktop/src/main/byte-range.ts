/**
 * Parse a single HTTP `Range: bytes=...` header against a file size (RFC 9110 §14.1.2).
 * Returns null when there is no usable range (serve the whole file with 200),
 * 'unsatisfiable' for a range that starts past the end (416), else inclusive offsets.
 * Media elements only ever send one range, so multi-range requests fall back to 200.
 */
export function parseByteRange(
  header: string | null,
  size: number,
): { start: number; end: number } | 'unsatisfiable' | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, a, b] = m;
  if (a === '' && b === '') return null;
  if (a === '') {
    // suffix range: the last N bytes
    const n = Number(b);
    if (n === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  if (start >= size) return 'unsatisfiable';
  const end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
  if (end < start) return null;
  return { start, end };
}
