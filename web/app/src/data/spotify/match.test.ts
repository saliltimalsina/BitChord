import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/data/music/types';

const searchSongs = vi.fn<(q: string) => Promise<Track[]>>();
const searchVideos = vi.fn<(q: string) => Promise<Track[]>>();
vi.mock('@/data/music/api', () => ({ searchSongs: (q: string) => searchSongs(q), searchVideos: (q: string) => searchVideos(q) }));
vi.mock('@/extension/bridge', () => ({ getBridge: () => null }));

const { matchToYouTube } = await import('./api');

const row = (videoId: string, title: string, artist: string, durationSec: number, extra: Partial<Track> = {}): Track => ({
  videoId,
  title,
  artists: [{ name: artist, id: null }],
  album: null,
  durationSec,
  explicit: false,
  thumbnail: null,
  index: null,
  plays: null,
  ...extra,
});

// What YouTube Music answers for "Simrayo Gauley Bhai": every song but that one.
const gauleyBhaiSongs = [
  row('abhagi', 'Abhagi', 'Gauley Bhai', 323, { videoType: 'song', album: { name: 'Sunbari', id: null } }),
  row('kalosaap', 'Kalo Saap', 'Gauley Bhai', 215, { videoType: 'song' }),
  row('sadiyantra', 'Sadiyantra', 'Gauley Bhai', 406, { videoType: 'song' }),
];
let n = 0;
const spotify = (title: string, artist: string, seconds: number) => ({
  id: `sp${n++}`,
  title,
  artist,
  album: 'Sunbari',
  durationMs: seconds * 1000,
  imageUrl: null,
});

describe('matchToYouTube', () => {
  beforeEach(() => {
    searchSongs.mockReset().mockResolvedValue(gauleyBhaiSongs);
    searchVideos.mockReset();
  });

  it('takes the catalogue song when there is one, without asking for videos', async () => {
    const found = await matchToYouTube(spotify('Abhagi', 'Gauley Bhai', 322));
    expect(found?.videoId).toBe('abhagi');
    expect(found?.matchedVideo).toBeUndefined();
    expect(searchVideos).not.toHaveBeenCalled();
  });

  it("falls back to the artist's own video, never to another song by them", async () => {
    searchVideos.mockResolvedValue([
      row('kappa', 'Simrayo - Gauley Bhai - Music Mojo Season 6 - Kappa TV', 'Kappa TV', 433, { videoType: 'fan' }),
      row('omv', 'Simrayo', 'Gauley Bhai', 396, { videoType: 'official' }),
    ]);
    const found = await matchToYouTube(spotify('Simrayo', 'Gauley Bhai', 370));
    expect(found?.videoId).toBe('omv');
    expect(found?.matchedVideo).toBe(true);
  });

  it('never takes a fan upload, even one credited to the artist', async () => {
    searchVideos.mockResolvedValue([row('live', 'Simrayo (Live)', 'Gauley Bhai', 380, { videoType: 'fan' }), row('fan', 'Simrayo', 'Gauley Bhai', 372, { videoType: 'fan' })]);
    expect(await matchToYouTube(spotify('Simrayo', 'Gauley Bhai', 370))).toBeNull();
  });

  it('answers nothing rather than the first hit when neither search has the track', async () => {
    searchVideos.mockResolvedValue([]);
    expect(await matchToYouTube(spotify('Pakyo Hai', 'Gauley Bhai', 151))).toBeNull();
  });
});

describe('matchToYouTube, long music videos', () => {
  beforeEach(() => {
    searchSongs.mockReset().mockResolvedValue(gauleyBhaiSongs);
    searchVideos.mockReset();
  });

  it("takes the artist's own video under the exact title, however long its intro", async () => {
    searchVideos.mockResolvedValue([
      row('ugc', 'Aunty ko tato bagaicha l gauley bhai l', 'UVWXYOGI', 222, { videoType: 'fan' }),
      row('omv', 'Aunty Ko Tato Bagaicha', 'Gauley Bhai', 449, { videoType: 'official' }),
      row('karaoke', 'Aunty Ko Tato Bagaicha - Gauley Bhai (KARAOKE WITH LYRICS)', 'Karaoke Nepal', 300, { videoType: 'fan' }),
    ]);
    const found = await matchToYouTube(spotify('Aunty Ko Tato Bagaicha', 'Gauley Bhai', 300));
    expect(found?.videoId).toBe('omv');
  });

  it("still refuses the artist's other videos, live takes included", async () => {
    searchVideos.mockResolvedValue([
      row('live', 'Gauley Bhai - Abhagi || Live at Fandom', 'Gauley Bhai', 409, { videoType: 'official' }),
      row('morau', 'Morau', 'Gauley Bhai', 369, { videoType: 'official' }),
    ]);
    expect(await matchToYouTube(spotify('Bhok', 'Gauley Bhai', 300))).toBeNull();
  });

  it('takes a live video only for a live track', async () => {
    searchVideos.mockResolvedValue([row('live', 'Gauley Bhai - Abhagi || Live at Fandom', 'Gauley Bhai', 409, { videoType: 'official' })]);
    expect((await matchToYouTube(spotify('Abhagi (Live at Fandom)', 'Gauley Bhai', 300)))?.videoId).toBe('live');
  });
});
