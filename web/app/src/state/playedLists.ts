import { create } from 'zustand';
import type { MusicItem } from '@/data/music/types';
import type { QueueSource } from '@/playback/queue/timeline';
import { usePlayer } from './player';
import { useRecents } from './recents';

/**
 * Home's Recent playlists: the playlists and albums songs were last played
 * out of in this browser, newest first. Played, not merely opened (that is
 * the palette's Recently opened). The phone's RecentPlaylists, here.
 */

export type PlayedList = Pick<MusicItem, 'kind' | 'id' | 'title' | 'subtitle' | 'thumbnail'>;

const KEY = 'bitchord:recent-played-lists';
const LIMIT = 20;

function load(): PlayedList[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as PlayedList[]).slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

/** The list a queue source names, when it names a playlist or album. */
export function listOf(source: QueueSource | null | undefined): Pick<PlayedList, 'kind' | 'id' | 'title'> | null {
  if (!source?.id) return null;
  if (source.type === 'album') return { kind: 'album', id: source.id, title: source.title };
  if (source.type !== 'playlist') return null;
  return source.id.startsWith('spotify:')
    ? { kind: 'spotify-playlist', id: source.id.slice('spotify:'.length), title: source.title }
    : { kind: 'playlist', id: source.id, title: source.title };
}

/** [list] to the front, once. */
export function withPlayed(lists: PlayedList[], list: PlayedList): PlayedList[] {
  return [list, ...lists.filter((l) => !(l.kind === list.kind && l.id === list.id))].slice(0, LIMIT);
}

interface PlayedListsState {
  items: PlayedList[];
  remember: (list: PlayedList) => void;
}

export const usePlayedLists = create<PlayedListsState>()((set, get) => ({
  items: load(),
  remember: (list) => {
    const items = withPlayed(get().items, list);
    set({ items });
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      // Storage unavailable: the row lasts for this tab.
    }
  },
}));

/**
 * Runs for the app's lifetime (AppShell): when a song starts playing out of a
 * playlist or album, that list joins the row. Its artwork and byline come from
 * the page as it was opened (the palette's history), else what the row had,
 * else the song's own cover.
 */
export function startPlayedListTracking(): () => void {
  return usePlayer.subscribe((state, before) => {
    if (state.status !== 'playing') return;
    const entry = state.queue[state.index];
    const was = before.queue[before.index];
    if (before.status === 'playing' && entry?.source?.id === was?.source?.id) return;
    const list = listOf(entry?.source);
    if (!list || !entry) return;
    const page = useRecents.getState().items.find((r) => r.kind === list.kind && r.id === list.id);
    const known = usePlayedLists.getState().items.find((l) => l.kind === list.kind && l.id === list.id);
    usePlayedLists.getState().remember({
      ...list,
      title: page?.title ?? list.title,
      subtitle: page?.subtitle ?? known?.subtitle ?? '',
      thumbnail: page?.thumbnail ?? known?.thumbnail ?? entry.track.thumbnail,
    });
  });
}
