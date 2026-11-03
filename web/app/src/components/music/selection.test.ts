import { describe, expect, it } from 'vitest';
import { clickSelection, NO_SELECTION, selectedItems } from './selection';

const plain = { toggle: false, range: false };
const toggle = { toggle: true, range: false };
const range = { toggle: false, range: true };
const rows = (s: { rows: ReadonlySet<number> }) => [...s.rows].sort((a, b) => a - b);

describe('selecting songs', () => {
  it('picks one row with a plain click, replacing the rest', () => {
    const s = clickSelection(clickSelection(NO_SELECTION, 2, plain), 5, plain);
    expect(rows(s)).toEqual([5]);
    expect(s.anchor).toBe(5);
  });

  it('adds and takes out rows with ⌘/Ctrl', () => {
    let s = clickSelection(NO_SELECTION, 1, plain);
    s = clickSelection(s, 4, toggle);
    expect(rows(s)).toEqual([1, 4]);
    s = clickSelection(s, 1, toggle);
    expect(rows(s)).toEqual([4]);
  });

  it('picks a range with Shift, either way from the anchor', () => {
    const down = clickSelection(clickSelection(NO_SELECTION, 2, plain), 5, range);
    expect(rows(down)).toEqual([2, 3, 4, 5]);
    const up = clickSelection(clickSelection(NO_SELECTION, 5, plain), 3, range);
    expect(rows(up)).toEqual([3, 4, 5]);
  });

  it('adds a range to the rest with ⌘/Ctrl and Shift together', () => {
    let s = clickSelection(NO_SELECTION, 0, plain);
    s = clickSelection(s, 6, toggle);
    s = clickSelection(s, 8, { toggle: true, range: true });
    expect(rows(s)).toEqual([0, 6, 7, 8]);
  });

  it('treats Shift with nothing picked yet as a plain click', () => {
    expect(rows(clickSelection(NO_SELECTION, 3, range))).toEqual([3]);
  });

  it('gives the picked items in list order', () => {
    const s = clickSelection(clickSelection(NO_SELECTION, 3, plain), 1, toggle);
    expect(selectedItems(['a', 'b', 'c', 'd'], s)).toEqual(['b', 'd']);
  });
});
