import { useEffect } from 'react';
import { create } from 'zustand';
import type { MusicItem } from '@/data/music/types';

/** What the command palette's "Recently opened" remembers of an item. */
export type RecentItem = Pick<MusicItem, 'kind' | 'id' | 'title' | 'subtitle' | 'thumbnail'> &
  Partial<Pick<MusicItem, 'artists' | 'album' | 'durationSec' | 'explicit'>>;

const KEY = 'bitchord:recently-opened';
/** What the palette's "Recently opened" lists. */
export const RECENTS_LIMIT = 8;
/** Kept: Home's Recent playlists row reads further back than the palette. */
const STORED_LIMIT = 24;

function load(): RecentItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    // Played videos used to be remembered as "Song • …".
    return (parsed as RecentItem[])
      .slice(0, STORED_LIMIT)
      .map((r) => (r.kind === 'video' && r.subtitle?.startsWith('Song') ? { ...r, subtitle: r.subtitle.replace(/^Song/, 'Video') } : r));
  } catch {
    return [];
  }
}

/** The newest first, one entry per item, at most [limit]. */
export function withRecent(list: RecentItem[], item: RecentItem, limit = RECENTS_LIMIT): RecentItem[] {
  return [item, ...list.filter((r) => !(r.kind === item.kind && r.id === item.id))].slice(0, limit);
}

interface RecentsState {
  items: RecentItem[];
  remember: (item: RecentItem) => void;
}

export const useRecents = create<RecentsState>()((set, get) => ({
  items: load(),
  remember: (item) => {
    const items = withRecent(get().items, item, STORED_LIMIT);
    set({ items });
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      // Storage full or blocked: the list still lives for this tab.
    }
  },
}));

/** Remembers a detail page once its header has loaded. */
export function useRememberRecent(item: RecentItem | null | undefined) {
  const key = item ? `${item.kind}:${item.id}:${item.title}:${item.thumbnail ?? ''}` : null;
  useEffect(() => {
    if (item) useRecents.getState().remember(item);
    // Keyed on the item's identity and look, not the object, which is rebuilt each render.
  }, [key]);
}
