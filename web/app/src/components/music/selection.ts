/** Rows picked in a track list, by position, and the row a Shift-click extends from. */
export interface Selection {
  rows: ReadonlySet<number>;
  anchor: number | null;
}

export const NO_SELECTION: Selection = { rows: new Set(), anchor: null };

/**
 * The selection after a click on row [i], as Finder and Spotify do it: a
 * plain click picks that row alone; ⌘/Ctrl adds or takes it out; Shift picks
 * the range from the anchor (added to the rest with ⌘/Ctrl too).
 */
export function clickSelection(current: Selection, i: number, keys: { toggle: boolean; range: boolean }): Selection {
  if (keys.range && current.anchor !== null) {
    const [from, to] = current.anchor < i ? [current.anchor, i] : [i, current.anchor];
    const rows = new Set(keys.toggle ? current.rows : []);
    for (let n = from; n <= to; n++) rows.add(n);
    return { rows, anchor: current.anchor };
  }
  if (keys.toggle) {
    const rows = new Set(current.rows);
    if (rows.has(i)) rows.delete(i);
    else rows.add(i);
    return { rows, anchor: i };
  }
  return { rows: new Set([i]), anchor: i };
}

/** The picked rows' items, in list order. */
export function selectedItems<T>(items: readonly T[], selection: Selection): T[] {
  return items.filter((_, i) => selection.rows.has(i));
}
