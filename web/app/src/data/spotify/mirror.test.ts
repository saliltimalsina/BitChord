import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MusicItem, Track } from '@/data/music/types';

const calls: string[] = [];
const music = {
  fetchLibrary: vi.fn(),
  fetchPlaylist: vi.fn(),
  createPlaylist: vi.fn(),
  addToPlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
};
const spotify = { fetchSpotifyPlaylists: vi.fn(), fetchSpotifyTracks: vi.fn(), matchToYouTube: vi.fn() };
vi.mock('@/data/music/api', () => music);
vi.mock('./api', () => spotify);

const { planMirror, runMirror } = await import('./mirror');

const item = (id: string, title: string): MusicItem => ({
  kind: 'playlist', id, title, subtitle: '', artists: [], album: null, thumbnail: null, wide: false, durationSec: null, explicit: false,
});
const track = (videoId: string) => ({ videoId } as Track);
const sp = (id: string, name: string) => ({ id, name, owner: null, imageUrl: null });
const spTrack = (id: string) => ({ id, title: id, artist: 'A', album: '', durationMs: 1000, imageUrl: null });

beforeEach(() => {
  calls.length = 0;
  Object.values(music).forEach((f) => f.mockReset());
  Object.values(spotify).forEach((f) => f.mockReset());
  music.createPlaylist.mockImplementation(async (title: string) => {
    calls.push(`create:${title}`);
    return `new-${title}`;
  });
  music.addToPlaylist.mockImplementation(async (id: string, ids: string[]) => void calls.push(`add:${id}:${ids.length}`));
  music.deletePlaylist.mockImplementation(async (id: string) => void calls.push(`delete:${id}`));
});

describe('planMirror', () => {
  it('deletes only playlists YouTube says the account can edit, never Liked Music', async () => {
    music.fetchLibrary.mockResolvedValue({
      data: { grid: [item('VLLM', 'Liked Music'), item('VLPLmine', 'Mine'), item('VLPLsaved', 'Saved'), item('VLPLbroken', 'Broken')] },
      next: null,
    });
    music.fetchPlaylist.mockImplementation(async (id: string) => {
      if (id === 'VLPLbroken') throw new Error('nope');
      return { page: { editable: id === 'VLPLmine' } };
    });
    spotify.fetchSpotifyPlaylists.mockResolvedValue([sp('liked', 'Liked Songs')]);
    const plan = await planMirror();
    expect(plan.toDelete.map((p) => p.title)).toEqual(['Mine']);
    expect(plan.toCopy.map((p) => p.name)).toEqual(['Liked Songs']);
    expect(music.fetchPlaylist).not.toHaveBeenCalledWith('VLLM');
  });
});

describe('runMirror', () => {
  it('makes every copy before deleting anything, and skips playlists with nothing found', async () => {
    spotify.fetchSpotifyTracks.mockImplementation(async (id: string) => (id === 'empty' ? [spTrack('x')] : [spTrack('a'), spTrack('b')]));
    spotify.matchToYouTube.mockImplementation(async (t: { id: string }) => (t.id === 'x' || t.id === 'b' ? null : track(`v-${t.id}`)));
    const result = await runMirror({ toDelete: [item('VLPLold', 'Old')], toCopy: [sp('one', 'One'), sp('empty', 'Empty')] }, () => undefined);
    expect(calls).toEqual(['create:One', 'delete:VLPLold']);
    expect(result.copies[0]).toMatchObject({ copied: 1, total: 2, missing: ['b — A'] });
    expect(result.copies[1]).toMatchObject({ createdId: null, copied: 0 });
    expect(result.deleted).toBe(1);
  });

  it('deletes nothing when a copy fails', async () => {
    spotify.fetchSpotifyTracks.mockRejectedValue(new Error('Spotify down'));
    await expect(runMirror({ toDelete: [item('VLPLold', 'Old')], toCopy: [sp('one', 'One')] }, () => undefined)).rejects.toThrow('Spotify down');
    expect(music.deletePlaylist).not.toHaveBeenCalled();
  });

  it('fills a long playlist in chunks after creating it', async () => {
    const many = Array.from({ length: 250 }, (_, i) => spTrack(`t${i}`));
    spotify.fetchSpotifyTracks.mockResolvedValue(many);
    spotify.matchToYouTube.mockImplementation(async (t: { id: string }) => track(`v-${t.id}`));
    await runMirror({ toDelete: [], toCopy: [sp('big', 'Big')] }, () => undefined);
    expect(calls).toEqual(['create:Big', 'add:new-Big:100', 'add:new-Big:50']);
    expect(music.createPlaylist.mock.calls[0]![1]).toHaveLength(100);
  });
});
