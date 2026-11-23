import { create } from 'zustand';
import { fetchPlayedLists } from '@/data/music/api';
import type { MusicItem } from '@/data/music/types';
import { ensureYtAuth } from '@/extension/useYtAuth';
import { queryClient } from '@/lib/queryClient';
import type { QueueSource } from '@/playback/queue/timeline';
import { usePlayer } from './player';
import { useRecents } from './recents';

/**
 * Home's Recent playlists: the playlists and albums songs were last played
 * out of, newest first. Played, not merely opened (that is the palette's
 * Recently opened). The phone's RecentPlaylists, here.
 *
 * Two lists, merged:
 *  - the account's Library › Recently played, the same on every signed-in
 *    device (the phone, this browser, YouTube Music itself). Plays land there
 *    because their history entry names the list (historyReporting);
 *  - this browser's own, which moves a list up the moment it starts playing,
 *    before YouTube has caught up, and keeps what YouTube can't know about:
 *    Spotify playlists with no YouTube copy, lists not in the library.
 */

export type PlayedList = Pick<MusicItem, 'kind' | 'id' | 'title' | 'subtitle' | 'thumbnail'> & {
  /** When it started playing here (ms); missing on entries saved before it was kept. */
  playedAt?: number;
};

interface AccountLists {
  items: PlayedList[];
  fetchedAt: number;
}

const KEY = 'bitchord:recent-played-lists';
const ACCOUNT_KEY = 'bitchord:account-played-lists';
const LIMIT = 20;
/** While the app is in front: often enough that a play on the phone shows here within a minute. */
const POLL_MS = 45_000;
/** After a play is registered: YouTube takes a moment to file it. */
const AFTER_PLAY_MS = 4_000;
const LIKED_MUSIC = 'LM';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the row lasts for this tab.
  }
}

function loadLocal(): PlayedList[] {
  const parsed = read<unknown>(KEY, []);
  return Array.isArray(parsed) ? (parsed as PlayedList[]).slice(0, LIMIT) : [];
}

function loadAccount(): AccountLists | null {
  const parsed = read<AccountLists | null>(ACCOUNT_KEY, null);
  return parsed && Array.isArray(parsed.items) && typeof parsed.fetchedAt === 'number' ? parsed : null;
}

/** One list, however it is spelled: a playlist's page is VLPL…, its list PL…. */
const keyOf = (l: Pick<PlayedList, 'kind' | 'id'>) => `${l.kind === 'spotify-playlist' ? 'spotify' : 'yt'}:${l.id.replace(/^VL/, '')}`;

/**
 * The YouTube Music copy of a Spotify playlist (Spotify › Replace makes them
 * under the same name), from the library playlists already loaded for the
 * sidebar. Only an unambiguous match: one library playlist of that exact name.
 */
export function youtubeCopyOf(title: string): MusicItem | null {
  const playlists = queryClient.getQueryData<MusicItem[]>(['music', 'library', 'sidebar-playlists']) ?? [];
  const name = title.trim().toLowerCase();
  const matches = playlists.filter((p) => p.title.trim().toLowerCase() === name);
  return matches.length === 1 ? matches[0]! : null;
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
  return [list, ...lists.filter((l) => keyOf(l) !== keyOf(list))].slice(0, LIMIT);
}

/**
 * What the row shows: lists played here since the account was last read (it
 * may not have them yet), then the account's order, then the rest of this
 * browser's, which YouTube doesn't list. Liked Music is left out: YouTube
 * keeps it first for good, so it would never move.
 */
export function mergePlayed(local: PlayedList[], account: AccountLists | null): PlayedList[] {
  if (!account) return local.slice(0, LIMIT);
  const fresh = local.filter((l) => (l.playedAt ?? 0) > account.fetchedAt);
  const seen = new Set<string>();
  const out: PlayedList[] = [];
  for (const list of [...fresh, ...account.items, ...local]) {
    const key = keyOf(list);
    if (list.id.replace(/^VL/, '') === LIKED_MUSIC || seen.has(key)) continue;
    seen.add(key);
    // The account's entry, for its current title and artwork, at this browser's place for it.
    const fromAccount = account.items.find((a) => keyOf(a) === key);
    out.push(fromAccount && fromAccount !== list ? { ...list, title: fromAccount.title, subtitle: fromAccount.subtitle, thumbnail: fromAccount.thumbnail ?? list.thumbnail } : list);
  }
  return out.slice(0, LIMIT);
}

interface PlayedListsState {
  local: PlayedList[];
  account: AccountLists | null;
  /** The merged row. */
  items: PlayedList[];
  remember: (list: PlayedList) => void;
  setAccount: (account: AccountLists | null) => void;
}

export const usePlayedLists = create<PlayedListsState>()((set, get) => {
  const local = loadLocal();
  const account = loadAccount();
  return {
    local,
    account,
    items: mergePlayed(local, account),
    remember: (list) => {
      const next = withPlayed(get().local, { ...list, playedAt: Date.now() });
      write(KEY, next);
      set({ local: next, items: mergePlayed(next, get().account) });
    },
    setAccount: (account) => {
      write(ACCOUNT_KEY, account);
      set({ account, items: mergePlayed(get().local, account) });
    },
  };
});

let refreshing: Promise<void> | null = null;

/** Reads the account's Recently played again. Signed out, it is dropped: the row is this browser's alone. */
export function refreshPlayedLists(): Promise<void> {
  refreshing ??= (async () => {
    try {
      const auth = await ensureYtAuth();
      if (!auth.signedIn) {
        usePlayedLists.getState().setAccount(null);
        return;
      }
      const startedAt = Date.now();
      const items = await fetchPlayedLists();
      usePlayedLists.getState().setAccount({
        items: items.map(({ kind, id, title, subtitle, thumbnail }) => ({ kind, id, title, subtitle, thumbnail })),
        fetchedAt: startedAt,
      });
    } catch {
      // Offline, or YouTube said no: keep what the row had.
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

let afterPlay: ReturnType<typeof setTimeout> | null = null;

/** A play naming a list was registered: read the account once YouTube has filed it. */
export function playedListRegistered(): void {
  if (afterPlay) clearTimeout(afterPlay);
  afterPlay = setTimeout(() => {
    afterPlay = null;
    void refreshPlayedLists();
  }, AFTER_PLAY_MS);
}

/**
 * Runs for the app's lifetime (AppShell). When a song starts playing out of a
 * playlist or album, that list goes to the front at once. A Spotify playlist
 * with a YouTube copy is kept as the copy, the list its plays are filed under.
 * The account is read on start, whenever the tab comes back, and every
 * [POLL_MS] while it is in front.
 */
export function startPlayedListTracking(): () => void {
  const offPlayer = usePlayer.subscribe((state, before) => {
    if (state.status !== 'playing') return;
    const entry = state.queue[state.index];
    const was = before.queue[before.index];
    if (before.status === 'playing' && entry?.source?.id === was?.source?.id) return;
    const named = listOf(entry?.source);
    if (!named || !entry) return;
    const copy = named.kind === 'spotify-playlist' ? youtubeCopyOf(named.title) : null;
    const list = copy ? { kind: 'playlist' as const, id: copy.id, title: copy.title } : named;
    const page = useRecents.getState().items.find((r) => keyOf(r) === keyOf(list));
    const known = usePlayedLists.getState().items.find((l) => keyOf(l) === keyOf(list));
    usePlayedLists.getState().remember({
      ...list,
      title: page?.title ?? list.title,
      subtitle: page?.subtitle ?? known?.subtitle ?? copy?.subtitle ?? '',
      thumbnail: page?.thumbnail ?? known?.thumbnail ?? copy?.thumbnail ?? entry.track.thumbnail,
    });
  });

  void refreshPlayedLists();
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshPlayedLists();
  }, POLL_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') void refreshPlayedLists();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  return () => {
    offPlayer();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    if (afterPlay) clearTimeout(afterPlay);
  };
}
