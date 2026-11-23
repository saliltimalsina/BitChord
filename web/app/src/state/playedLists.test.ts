import { describe, expect, it, vi } from 'vitest';
import type { PlayedList } from './playedLists';

// The player and palette stores reach for the browser; only the pure parts are under test.
vi.mock('./player', () => ({ usePlayer: { subscribe: () => () => undefined } }));
vi.mock('./recents', () => ({ useRecents: { getState: () => ({ items: [] }) } }));
const { listOf, withPlayed } = await import('./playedLists');

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
