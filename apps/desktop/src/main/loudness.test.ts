import { describe, expect, it, vi } from 'vitest';

vi.mock('./ffmpeg.ts', () => ({ runFfmpeg: vi.fn() }));
const { parseLoudnormJson, gainToTarget } = await import('./loudness.ts');

const STDERR = `[Parsed_loudnorm_0 @ 0x1] \n{\n\t"input_i" : "-24.62",\n\t"input_tp" : "-5.31",\n\t"input_lra" : "6.10",\n\t"input_thresh" : "-34.80",\n\t"target_offset" : "0.00"\n}\n`;

describe('loudness', () => {
  it('reads integrated loudness and true peak from loudnorm output', () => {
    expect(parseLoudnormJson(STDERR)).toEqual({ integratedLufs: -24.62, truePeakDb: -5.31 });
  });

  it('treats silence (-inf) and junk as unmeasurable', () => {
    expect(parseLoudnormJson('{ "input_i" : "-inf", "input_tp" : "-inf" }')).toBeNull();
    expect(parseLoudnormJson('no json here')).toBeNull();
  });

  it('computes the gain to target, skipping files already within tolerance', () => {
    expect(gainToTarget(-24.6, -14)).toBeCloseTo(10.6);
    expect(gainToTarget(-14.3, -14)).toBeNull();
    expect(gainToTarget(-9, -14)).toBe(-5);
  });
});
