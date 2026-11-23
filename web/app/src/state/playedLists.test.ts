import { describe, expect, it, vi } from 'vitest';
import type { PlayedList } from './playedLists';

// The player and palette stores reach for the browser; only the pure parts are under test.
vi.mock('./player', () => ({ usePlayer: { subscribe: () => () => undefined } }));
vi.mock('./recents', () => ({ useRecents: { getState: () => ({ items: [] }) } }));
vi.mock('@/data/music/api', () => ({ fetchPlayedLists: async () => [] }));
vi.mock('@/extension/useYtAuth', () => ({ ensureYtAuth: async () => ({ signedIn: false }) }));
const sidebar: { title: string; id: string }[] = [];
vi.mock('@/lib/queryClient', () => ({ queryClient: { getQueryData: () => sidebar } }));
const { listOf, withPlayed, mergePlayed, youtubeCopyOf } = await import('./playedLists');

const list = (id: string): PlayedList => ({ kind: 'playlist', id, title: id, subtitle: '', thumbnail: null });

describe('listOf', () => {
  it('names playlists, Spotify playlists and albums, nothing else', () => {
    expect(listOf({ title: 'Mine', type: 'playlist', id: 'VLPL1' })).toEqual({ kind: 'playlist', id: 'VLPL1', title: 'Mine' });
    expect(listOf({ title: 'This Is', type: 'playlist', id: 'spotify:37i' })).toEqual({ kind: 'spotify-playlist', id: '37i', title: 'This Is' });
    expect(listOf({ title: 'Sunbari', type: 'album', id: 'MPREb_x' })).toEqual({ kind: 'album', id: 'MPREb_x', title: 'Sunbari' });
    expect(listOf({ title: 'Search', type: 'search' })).toBeNull();
    expect(listOf({ title: 'Artist', type: 'artist', id: 'UC1' })).toBeNull();
    expect(listOf({ title: 'Radio', type: 'radio', id: 'RD1' })).toBeNull();
  });
});

describe('withPlayed', () => {
  it('moves a replayed list to the front, once, and keeps 20', () => {
    const many = Array.from({ length: 20 }, (_, i) => list(`p${i}`));
    const next = withPlayed(many, list('p5'));
    expect(next[0]!.id).toBe('p5');
    expect(next.filter((l) => l.id === 'p5')).toHaveLength(1);
    expect(withPlayed(many, list('new'))).toHaveLength(20);
  });
});

describe('mergePlayed', () => {
  const at = (id: string, playedAt: number): PlayedList => ({ ...list(id), playedAt });

  it('is this browser alone without the account', () => {
    expect(mergePlayed([list('a')], null).map((l) => l.id)).toEqual(['a']);
  });

  it('puts lists played here since the last read first, then the account, then the rest', () => {
    const local = [at('VLPLnew', 200), at('VLPLold', 50), { ...list('37i'), kind: 'spotify-playlist' as const, playedAt: 40 }];
    const account = { fetchedAt: 100, items: [list('VLLM'), list('VLPLphone'), list('VLPLold')] };
    expect(mergePlayed(local, account).map((l) => l.id)).toEqual(['VLPLnew', 'VLPLphone', 'VLPLold', '37i']);
  });

  it('treats VLPL… and PL… as one list, and takes the account title', () => {
    const merged = mergePlayed([at('PLx', 200)], { fetchedAt: 100, items: [{ ...list('VLPLx'), title: 'Renamed' }] });
    expect(merged).toHaveLength(1);
    expect(merged[0]!.title).toBe('Renamed');
  });
});

describe('youtubeCopyOf', () => {
  it('finds a single library playlist of the same name', () => {
    sidebar.splice(0, sidebar.length, { title: 'Road Trip', id: 'VLPL1' }, { title: 'Dup', id: 'VLPL2' }, { title: 'dup', id: 'VLPL3' });
    expect(youtubeCopyOf(' road trip ')?.id).toBe('VLPL1');
    expect(youtubeCopyOf('Dup')).toBeNull();
    expect(youtubeCopyOf('Missing')).toBeNull();
  });
});
