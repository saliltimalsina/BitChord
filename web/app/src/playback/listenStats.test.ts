import { describe, expect, it } from 'vitest';
import { summarize, type Play } from './listenStats';

const DAY = 86_400_000;
const now = 1_000 * DAY;
const song = (videoId: string, artists: string[], thumbnail = `art-${videoId}`) => ({
  videoId,
  title: `Song ${videoId}`,
  artists: artists.map((name) => ({ name, id: `UC${name}` })),
  album: null,
  thumbnail,
  durationSec: 200,
  explicit: false,
});
const play = (s: ReturnType<typeof song>, daysAgo: number, ms = 180_000): Play => ({ at: now - daysAgo * DAY, ms, track: s });

const a = song('a', ['Arijit']);
const b = song('b', ['Arijit', 'Shreya']);
const c = song('c', ['Anuv']);
const plays = [play(a, 1), play(a, 2), play(a, 3), play(b, 5), play(c, 10), play(c, 100), play(c, 300), play(c, 400)];

describe('listening stats', () => {
  it('counts only the range asked for', () => {
    expect(summarize(plays, 'month', now).plays).toBe(5);
    expect(summarize(plays, 'half-year', now).plays).toBe(6);
    expect(summarize(plays, 'all', now).plays).toBe(8);
  });

  it('ranks songs by plays', () => {
    const top = summarize(plays, 'month', now).songs.map((s) => [s.track.videoId, s.plays]);
    expect(top).toEqual([['a', 3], ['b', 1], ['c', 1]]);
  });

  it("credits every artist on a song, with their most played song's artwork", () => {
    const artists = summarize(plays, 'month', now).artists.map((x) => [x.artist.name, x.plays, x.thumbnail]);
    expect(artists).toEqual([
      ['Arijit', 4, 'art-a'],
      ['Anuv', 1, 'art-c'],
      ['Shreya', 1, 'art-b'],
    ]);
  });

  it('adds up the minutes heard', () => {
    expect(summarize(plays, 'month', now).minutes).toBe(15);
  });

  it('is empty with nothing played', () => {
    expect(summarize([], 'all', now)).toEqual({ plays: 0, minutes: 0, songs: [], artists: [] });
  });
});
