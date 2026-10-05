import { describe, expect, it } from 'vitest';
import { newId } from '@cutboard/schema';
import { applyOp, applyOps, makeDoc, trackOfKind } from './test-helpers.ts';
import { captionClockMs, createItem } from './index.ts';
import type { Item, TimelineDoc } from './index.ts';

const STYLE = {
  fontFamily: 'Inter', fontSize: 72, fontWeight: 900, color: '#ffffff', align: 'center', lineHeight: 1.2,
  padding: 8, strokeWidth: 0, highlight: 'active-word', uppercase: true, placementY: 0.82, maxCharsPerLine: 32,
};

function captionItem(doc: TimelineDoc, startFrame: number, durationFrames: number, clock?: 'item'): Item {
  return createItem('caption', {
    id: newId('itm'),
    trackId: trackOfKind(doc, 'text').id,
    startFrame,
    durationFrames,
    sourceInFrame: 0,
    props: {
      // two words, 0-500 ms and 500-1000 ms on the card's own clock
      words: [{ w: 'hello', startMs: 0, endMs: 500 }, { w: 'there', startMs: 500, endMs: 1000 }],
      style: STYLE,
      mode: 'phrase',
      maxWordsPerCard: 4,
      ...(clock ? { clock } : {}),
    },
  } as never);
}

describe('caption clock', () => {
  it('item-clock cards count from their own start, wherever they sit', () => {
    const doc = makeDoc();
    const card = captionItem(doc, 900, 30, 'item'); // 30 s into the timeline
    expect(captionClockMs(card, 900, 30)).toBe(0);
    expect(captionClockMs(card, 915, 30)).toBe(500);
  });

  it('legacy cards keep the timeline clock', () => {
    const doc = makeDoc();
    const card = captionItem(doc, 900, 30);
    expect(captionClockMs(card, 915, 30)).toBe(30500);
  });

  it('moving an item-clock card keeps its words in sync', () => {
    const doc = makeDoc();
    const card = captionItem(doc, 900, 30, 'item');
    const { doc: d1 } = applyOp(doc, { type: 'item.add', item: card });
    const { doc: d2 } = applyOp(d1, { type: 'item.move', itemId: card.id, startFrame: 300 } as never);
    const moved = d2.items.find((i) => i.id === card.id)!;
    expect(captionClockMs(moved, 315, 30)).toBe(500);
  });

  it('splitting an item-clock card advances the right half, so its second word still lines up', () => {
    const doc = makeDoc();
    const card = captionItem(doc, 900, 30, 'item');
    const { doc: d1 } = applyOp(doc, { type: 'item.add', item: card });
    const right = newId('itm');
    const { doc: d2, inverse } = applyOp(d1, { type: 'item.split', itemId: card.id, atFrame: 915, newItemId: right });
    const b = d2.items.find((i) => i.id === right)!;
    expect(b.sourceInFrame).toBe(15);
    expect(captionClockMs(b, 915, 30)).toBe(500); // 'there' starts exactly at the split
    const { doc: d3 } = applyOps(d2, inverse);
    expect(d3.items.find((i) => i.id === card.id)).toEqual(card);
  });

  it('trimming the head of an item-clock card advances its clock', () => {
    const doc = makeDoc();
    const card = captionItem(doc, 900, 30, 'item');
    const { doc: d1 } = applyOp(doc, { type: 'item.add', item: card });
    const { doc: d2 } = applyOp(d1, { type: 'item.trim', itemId: card.id, edge: 'in', frame: 915, ripple: false });
    const t = d2.items[0]!;
    expect(t.startFrame).toBe(915);
    expect(t.sourceInFrame).toBe(15);
    expect(captionClockMs(t, 915, 30)).toBe(500);
  });
});
