import type { SpotifyPlaylist, SpotifyTrack } from '@bitchord/shared/bridge';
import { best, bestOfficialAudioForVideo, type MatchCandidate } from '@/data/match/trackMatcher';
import { searchSongs, searchVideos } from '@/data/music/api';
import type { MusicItem, Track } from '@/data/music/types';
import { getBridge } from '@/extension/bridge';

/**
 * Spotify through the extension (prompt §7.1): the library, a playlist's
 * tracks, and matching each one to its YouTube Music song. Ports
 * SpotifyLibrary.kt's paging and SpotifyImporter.matchTrack.
 */

export const LIKED_ID = 'liked';

/**
 * Spotify's daylist: one playlist id for everyone, which Spotify answers with
 * the signed-in listener's own (renamed through the day, "chill indie tuesday
 * afternoon"). Empty for an account with too little listening yet.
 */
export const DAYLIST_ID = '37i9dQZF1EP6YuccBxUcC1';

/** A Spotify playlist as an item that opens BitChord's Spotify playlist page. */
export function spotifyPlaylistItem(p: { id: string; name: string; owner?: string | null; imageUrl?: string | null }): MusicItem {
  return {
    kind: 'spotify-playlist',
    id: p.id,
    title: p.name,
    subtitle: p.owner ?? 'Spotify',
    artists: [],
    album: null,
    thumbnail: p.imageUrl ?? null,
    wide: false,
    durationSec: null,
    explicit: false,
  };
}

function bridge() {
  const b = getBridge();
  if (!b) throw new Error('The BitChord extension is not installed');
  return b;
}

/** Every playlist in the library, Liked Songs first, however many pages it takes. */
export async function fetchSpotifyPlaylists(): Promise<SpotifyPlaylist[]> {
  const out: SpotifyPlaylist[] = [];
  for (let offset = 0; ; ) {
    const page = await bridge().call('spotify.playlists', { offset }, { timeoutMs: 30_000 });
    out.push(...page.items);
    offset += page.raw;
    if (page.raw === 0 || offset >= page.total) break;
  }
  return out;
}

/** Public playlists on Spotify for [query]. */
export function searchSpotifyPlaylists(query: string): Promise<SpotifyPlaylist[]> {
  return bridge().call('spotify.searchPlaylists', { query }, { timeoutMs: 20_000 });
}

export function fetchSpotifyPlaylistInfo(playlistId: string) {
  return bridge().call('spotify.playlist', { playlistId }, { timeoutMs: 30_000 });
}

/** Every track of a playlist; [onPage] gets the running list after each page, so a long one fills in. */
export async function fetchSpotifyTracks(playlistId: string, onPage: (soFar: SpotifyTrack[], total: number) => void): Promise<SpotifyTrack[]> {
  const out: SpotifyTrack[] = [];
  for (let offset = 0; ; ) {
    const page = await bridge().call('spotify.tracks', { playlistId, offset }, { timeoutMs: 30_000 });
    out.push(...page.items);
    offset += page.raw;
    onPage([...out], page.total);
    if (page.raw === 0 || offset >= page.total) break;
  }
  return out;
}

/** A Spotify row as a list row, before its YouTube Music version is known. */
export function pendingTrack(track: SpotifyTrack, unavailable: 'matching' | 'missing' = 'matching'): Track {
  return {
    videoId: `spotify:${track.id}`,
    title: track.title,
    artists: track.artist ? track.artist.split(', ').map((name) => ({ name, id: null })) : [],
    album: track.album ? { name: track.album, id: null } : null,
    durationSec: track.durationMs > 0 ? Math.round(track.durationMs / 1000) : null,
    explicit: false,
    thumbnail: track.imageUrl,
    index: null,
    plays: null,
    unavailable,
  };
}

export function candidateOf(track: Track): MatchCandidate {
  return {
    title: track.title,
    artist: track.artists.map((a) => a.name).join(', '),
    durationSec: track.durationSec,
    album: track.album?.name ?? null,
    explicit: track.explicit,
  };
}

const matched = new Map<string, Track | null>();

/**
 * The YouTube Music version of [track], or null if it has none (SpotifyImporter.matchTrack):
 *
 * 1. the catalogue song the matcher accepts (title, credit, length, album);
 * 2. failing that, the artist's own video of it: plenty of releases are on
 *    YouTube Music only as their music video. Never a fan upload,
 *    which is a cover or a live set rather than this recording;
 * 3. failing that, nothing. Taking the search's first hit instead is what
 *    filled a playlist with copies of the artist's most popular song: the
 *    first hit for a track YouTube doesn't have is whatever else they made.
 */
export async function matchToYouTube(track: SpotifyTrack): Promise<Track | null> {
  if (matched.has(track.id)) return matched.get(track.id)!;
  const query = [track.title, track.artist].filter((s) => s.trim()).join(' ');
  const target = {
    title: track.title,
    artist: track.artist,
    durationSec: track.durationMs > 0 ? Math.round(track.durationMs / 1000) : null,
    album: track.album,
  };
  const pick = (candidates: Track[], isVideo: boolean) =>
    best(
      candidates.map((c) => ({ ...candidateOf(c), track: c })),
      // A video belongs to no album, and its runtime carries the video's intro and outro.
      isVideo ? { ...target, album: null, isVideo: true } : target,
    )?.track ?? null;

  let found = pick(await searchSongs(query), false);
  if (!found) {
    const videos = (await searchVideos(query)).filter((v) => v.videoType !== 'fan');
    // A music video can run minutes past the song it carries (a cinematic
    // intro, an outro). The artist's own video under the exact title is that
    // song however long it runs.
    const video =
      pick(videos, true) ??
      bestOfficialAudioForVideo(videos.map((c) => ({ ...candidateOf(c), track: c })), { ...target, album: null })?.track ??
      null;
    found = video && { ...video, matchedVideo: true };
  }
  const result = found && { ...found, thumbnail: found.thumbnail ?? track.imageUrl };
  // Only an answered search is remembered; a thrown one is retried next time.
  matched.set(track.id, result);
  return result;
}

// ---- Canvas (SpotifyCanvas / DesktopSpotifyCanvas) ---------------------------------

const canvases = new Map<string, string | null>();

/**
 * The looping clip Spotify shows behind [track], or null. The Spotify
 * counterpart is found with the same matcher, so a cover or a remix never
 * lends its canvas to the original.
 */
export async function fetchCanvas(track: { videoId: string; title: string; artist: string; durationSec: number }): Promise<string | null> {
  if (canvases.has(track.videoId)) return canvases.get(track.videoId)!;
  const hits = await bridge().call('spotify.searchTracks', { query: `${track.title} ${track.artist}` }, { timeoutMs: 20_000 });
  const pick = best(
    hits.map((h) => ({
      title: h.title,
      artist: h.artist,
      durationSec: h.durationMs > 0 ? Math.round(h.durationMs / 1000) : null,
      album: h.album,
      id: h.id,
    })),
    { title: track.title, artist: track.artist, durationSec: track.durationSec > 0 ? Math.round(track.durationSec) : null },
  );
  const url = pick ? (await bridge().call('spotify.canvas', { trackId: pick.id }, { timeoutMs: 20_000 })).url : null;
  canvases.set(track.videoId, url);
  if (canvases.size > 200) canvases.delete(canvases.keys().next().value!);
  return url;
}
