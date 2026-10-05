import { describe, expect, it } from 'vitest';
import { parseByteRange } from './byte-range.ts';

describe('parseByteRange', () => {
  it('serves the whole file when there is no range', () => {
    expect(parseByteRange(null, 1000)).toBeNull();
  });
  it('handles the open-ended range a media element sends first', () => {
    expect(parseByteRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 });
  });
  it('handles a seek into the middle of the file', () => {
    expect(parseByteRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 });
    expect(parseByteRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 });
  });
  it('clamps an end past the file and supports suffix ranges', () => {
    expect(parseByteRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
  });
  it('rejects a start past the end, ignores malformed and multi-range headers', () => {
    expect(parseByteRange('bytes=1000-', 1000)).toBe('unsatisfiable');
    expect(parseByteRange('items=0-1', 1000)).toBeNull();
    expect(parseByteRange('bytes=0-1,5-9', 1000)).toBeNull();
  });
});
