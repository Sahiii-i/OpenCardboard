import { rename, rm } from 'node:fs/promises';
import { runFfmpeg } from './ffmpeg.ts';

/**
 * Loudness normalisation for finished exports. Social platforms play back around -14 LUFS,
 * and an un-normalised talking-head mix lands near -24, so it sounds quiet next to
 * everything else in the feed.
 *
 * Deliberately not a single `loudnorm` pass: on a short or hot master loudnorm silently
 * switches to dynamic mode and undershoots. Instead: measure, apply a plain gain into a
 * true-peak limiter, re-measure, and correct once if the limiter pulled it off target.
 */

export interface LoudnessMeasure {
  integratedLufs: number;
  truePeakDb: number;
}

/** Parse the JSON block `loudnorm=print_format=json` writes to stderr. */
export function parseLoudnormJson(stderr: string): LoudnessMeasure | null {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start === -1 || end < start) return null;
  try {
    const data = JSON.parse(stderr.slice(start, end + 1)) as { input_i?: string; input_tp?: string };
    const integratedLufs = Number(data.input_i);
    const truePeakDb = Number(data.input_tp);
    if (!Number.isFinite(integratedLufs) || !Number.isFinite(truePeakDb)) return null; // silence reads -inf
    return { integratedLufs, truePeakDb };
  } catch {
    return null;
  }
}

/** Gain (dB) to reach the target, or null when the file is already within tolerance. */
export function gainToTarget(measuredLufs: number, targetLufs: number, toleranceLu = 0.5): number | null {
  const gain = targetLufs - measuredLufs;
  return Math.abs(gain) <= toleranceLu ? null : gain;
}

export async function measureLoudness(path: string, signal?: AbortSignal): Promise<LoudnessMeasure | null> {
  const r = await runFfmpeg(['-i', path, '-vn', '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { signal });
  return r.code === 0 ? parseLoudnormJson(r.stderr) : null;
}

/**
 * Normalise `path` in place to `targetLufs`. Video is stream-copied; only audio is
 * re-encoded. Returns the final measurement, or null when there was nothing to do.
 */
export async function normalizeLoudness(
  path: string,
  opts: { targetLufs: number; ceilingDb?: number; audioCodec: string; signal?: AbortSignal },
): Promise<LoudnessMeasure | null> {
  const before = await measureLoudness(path, opts.signal);
  if (!before) return null;
  let gain = gainToTarget(before.integratedLufs, opts.targetLufs);
  if (gain === null) return before;

  // -2 dB leaves room for the AAC encoder's overshoot above the limiter
  const ceiling = Math.pow(10, (opts.ceilingDb ?? -2) / 20);
  const tmp = `${path}.loudness.tmp${path.slice(path.lastIndexOf('.'))}`;
  let after: LoudnessMeasure | null = null;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await runFfmpeg(
        [
          '-i', path,
          '-map', '0:v?', '-map', '0:a',
          '-c:v', 'copy',
          '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=${ceiling.toFixed(4)}:level=false`,
          '-c:a', opts.audioCodec, '-b:a', '192k',
          tmp,
        ],
        { signal: opts.signal },
      );
      if (r.code !== 0) throw new Error(`loudness pass failed: ${r.stderr.split('\n').slice(-3).join(' | ')}`);
      after = await measureLoudness(tmp, opts.signal);
      const correction = after ? gainToTarget(after.integratedLufs, opts.targetLufs) : null;
      if (correction === null) break;
      gain += correction; // the limiter shaved peaks off; push the remainder and redo from the source
    }
    await rename(tmp, path);
    return after;
  } finally {
    await rm(tmp, { force: true });
  }
}
