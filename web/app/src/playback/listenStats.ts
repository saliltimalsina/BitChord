import type { ArtistRef, Track } from '@/data/music/types';

/** One play kept for Stats: a song heard for at least COUNTS_AFTER_MS. */
export interface Play {
  /** When it started, ms since the epoch. */
  at: number;
  /** How much of it was heard, ms. */
  ms: number;
  track: Pick<Track, 'videoId' | 'title' | 'artists' | 'album' | 'thumbnail' | 'durationSec' | 'explicit'>;
}

/** A play counts once 30 s of it have been heard, as Spotify and Last.fm count. */
export const COUNTS_AFTER_MS = 30_000;

export type StatsRange = 'month' | 'half-year' | 'all';

export const STATS_RANGES: readonly { value: StatsRange; label: string }[] = [
  { value: 'month', label: 'Last 4 Weeks' },
  { value: 'half-year', label: 'Last 6 Months' },
  { value: 'all', label: 'All Time' },
];

const DAY_MS = 86_400_000;
const SINCE: Record<StatsRange, number> = { month: 28 * DAY_MS, 'half-year': 182 * DAY_MS, all: Infinity };

export interface SongStat {
  track: Play['track'];
  plays: number;
  ms: number;
}

export interface ArtistStat {
  artist: ArtistRef;
  plays: number;
  ms: number;
  /** The artwork of the artist's most played song here. */
  thumbnail: string | null;
}

export interface Stats {
  plays: number;
  minutes: number;
  songs: SongStat[];
  artists: ArtistStat[];
}

/** Most first; ties by time heard, then by name, so the order is stable. */
function ranked<T extends { plays: number; ms: number }>(list: T[], name: (item: T) => string): T[] {
  return list.sort((a, b) => b.plays - a.plays || b.ms - a.ms || name(a).localeCompare(name(b)));
}

/** What [plays] add up to over [range], counted back from [now]. */
export function summarize(plays: readonly Play[], range: StatsRange, now: number): Stats {
  const inRange = plays.filter((play) => now - play.at <= SINCE[range]);
  const songs = new Map<string, SongStat>();
  const artists = new Map<string, ArtistStat & { best: number }>();
  for (const play of inRange) {
    const song = songs.get(play.track.videoId) ?? { track: play.track, plays: 0, ms: 0 };
    song.plays += 1;
    song.ms += play.ms;
    // The newest copy of a song's details wins (a fixed title, new artwork).
    song.track = play.track;
    songs.set(play.track.videoId, song);
  }
  for (const song of songs.values()) {
    for (const artist of song.track.artists) {
      const key = artist.id ?? artist.name.toLowerCase();
      const stat = artists.get(key) ?? { artist, plays: 0, ms: 0, thumbnail: null, best: 0 };
      stat.plays += song.plays;
      stat.ms += song.ms;
      if (song.plays > stat.best) {
        stat.best = song.plays;
        stat.thumbnail = song.track.thumbnail;
      }
      artists.set(key, stat);
    }
  }
  return {
    plays: inRange.length,
    minutes: Math.round(inRange.reduce((total, play) => total + play.ms, 0) / 60_000),
    songs: ranked([...songs.values()], (s) => s.track.title),
    artists: ranked(
      [...artists.values()].map(({ best: _best, ...stat }) => stat),
      (a) => a.artist.name,
    ),
  };
}
