import { describe, expect, it } from 'vitest';
import type { Item, Op } from '@cutboard/schema';
import { captionClockMs } from '@cutboard/editor-core';
import { addCaptions } from './macros.ts';

const FPS = 30;
const video = (id: string, startFrame: number, durationFrames: number, sourceInFrame: number) =>
  ({ id, trackId: 'trk_video', type: 'video', assetId: 'ast_a', startFrame, durationFrames, sourceInFrame, speed: 1 }) as unknown as Item;

// The Apex intro cut: source 0-20.95 s, then source 26.77-92.15 s butted up against it.
const items = [video('itm_a', 0, 629, 0), video('itm_b', 629, 1961, 803)];
// one word per second of source, 400 ms long
const words = Array.from({ length: 92 }, (_, i) => ({ w: `w${i}`, startMs: i * 1000, endMs: i * 1000 + 400, conf: 1 }));

async function run(): Promise<Item[]> {
  const applied: Op[] = [];
  const snapshot = {
    doc: {
      project: { fps: FPS },
      tracks: [{ id: 'trk_text', kind: 'text', name: 'Text', locked: false }, { id: 'trk_video', kind: 'video', name: 'V', locked: false }],
      items,
      markers: [],
    },
    assets: [{ id: 'ast_a', kind: 'video' }],
    transcripts: [{ assetId: 'ast_a', words }],
  };
  const ctx = {
    getSnapshot: async () => snapshot,
    applyOps: async (ops: Op[]) => {
      applied.push(...ops);
      return { inverses: [], seq: 1 };
    },
    actor: 'builtin-agent',
  } as never;
  await addCaptions.handler({ preset: 'karaoke', wordsPerCard: 4 } as never, ctx);
  return applied.filter((op) => op.type === 'item.add').map((op) => (op as { item: Item }).item);
}

/** The word the renderer would highlight at a timeline frame, across all cards. */
function activeWordAt(cards: Item[], frame: number): string | null {
  for (const card of cards) {
    if (frame < card.startFrame || frame >= card.startFrame + card.durationFrames) continue;
    const t = captionClockMs(card, frame, FPS);
    const words = (card.props as { words: { w: string; startMs: number; endMs: number }[] }).words;
    const hit = words.find((w) => t >= w.startMs && t < w.endMs);
    if (hit) return hit.w;
  }
  return null;
}

describe('addCaptions across a cut', () => {
  it('highlights the word being spoken on both sides of the cut', async () => {
    const cards = await run();
    // before the cut: source 5.2 s is timeline 5.2 s
    expect(activeWordAt(cards, Math.round(5.2 * FPS))).toBe('w5');
    // after the cut: source 30.2 s plays at timeline 30.2 - 26.767 + 20.967 = 24.4 s
    expect(activeWordAt(cards, Math.round(24.4 * FPS))).toBe('w30');
    // and near the end: source 90.2 s plays at 84.4 s
    expect(activeWordAt(cards, Math.round(84.4 * FPS))).toBe('w90');
  });

  it('marks cards as item-clock with word times inside the card', async () => {
    const cards = await run();
    for (const card of cards) {
      const props = card.props as { clock?: string; words: { startMs: number }[] };
      expect(props.clock).toBe('item');
      expect(props.words[0]!.startMs).toBeLessThan((card.durationFrames / FPS) * 1000);
    }
  });
});
