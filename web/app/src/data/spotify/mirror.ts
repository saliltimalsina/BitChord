import type { SpotifyPlaylist } from '@bitchord/shared/bridge';
import { addToPlaylist, createPlaylist, deletePlaylist, fetchLibrary, fetchPlaylist } from '@/data/music/api';
import { LIKED_MUSIC_PLAYLIST } from '@/data/music/library';
import type { MusicItem } from '@/data/music/types';
import { fetchSpotifyPlaylists, fetchSpotifyTracks, matchToYouTube } from './api';

/**
 * Replacing the YouTube Music account's own playlists with copies of the
 * Spotify library's. Copies are made first and the old playlists deleted only
 * once every copy is made, so a failure part-way loses nothing.
 */

export interface MirrorPlan {
  /** The YouTube Music playlists the account owns (can edit): what gets deleted. */
  toDelete: MusicItem[];
  /** Every playlist in the Spotify library, Liked Songs first: what gets copied. */
  toCopy: SpotifyPlaylist[];
}

export interface CopyResult {
  playlist: SpotifyPlaylist;
  /** The new YouTube Music playlist, or null when nothing in it was found. */
  createdId: string | null;
  copied: number;
  total: number;
  /** "Title — Artist" of the tracks YouTube Music has no version of. */
  missing: string[];
}

export type MirrorProgress =
  | { stage: 'copying'; index: number; of: number; name: string; matched: number; total: number }
  | { stage: 'deleting'; index: number; of: number; name: string };

/** Tracks looked up at once, as a Spotify playlist page does. */
const MATCH_PARALLELISM = 6;
/** Songs per request when filling a playlist. */
const ADD_CHUNK = 100;
/** Library playlists inspected at once for whether the account owns them. */
const OWNERSHIP_PARALLELISM = 4;

async function pool<T, R>(items: readonly T[], width: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await work(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
  return out;
}

/** Every playlist in the YouTube Music library, all pages of it. */
async function libraryPlaylists(): Promise<MusicItem[]> {
  const items: MusicItem[] = [];
  for (let page: Awaited<ReturnType<typeof fetchLibrary>> | null = await fetchLibrary('playlists'); page; ) {
    items.push(...page.data.grid.filter((item) => item.kind === 'playlist'));
    page = page.next ? await page.next() : null;
  }
  return items;
}

/**
 * What would be deleted and what copied. Ownership is YouTube's own answer
 * (the playlist page's editable header), so a playlist saved from someone
 * else, or one YouTube makes (Liked Music, mixes), is never in [toDelete].
 */
export async function planMirror(): Promise<MirrorPlan> {
  const [library, toCopy] = await Promise.all([libraryPlaylists(), fetchSpotifyPlaylists()]);
  const candidates = library.filter((p) => p.id.replace(/^VL/, '') !== LIKED_MUSIC_PLAYLIST);
  const owned = await pool(candidates, OWNERSHIP_PARALLELISM, async (p) => {
    try {
      return (await fetchPlaylist(p.id)).page.editable;
    } catch {
      // Unreadable: not deleted. Better a stray old playlist than a wrong delete.
      return false;
    }
  });
  return { toDelete: candidates.filter((_, i) => owned[i]), toCopy };
}

/** One Spotify playlist as a new private YouTube Music playlist of the same name. */
export async function copyPlaylist(playlist: SpotifyPlaylist, onMatched: (matched: number, total: number) => void): Promise<CopyResult> {
  const tracks = await fetchSpotifyTracks(playlist.id, () => undefined);
  let done = 0;
  const found = await pool(tracks, MATCH_PARALLELISM, async (track) => {
    const match = await matchToYouTube(track).catch(() => null);
    onMatched(++done, tracks.length);
    return match;
  });
  const videoIds = [...new Set(found.flatMap((t) => (t ? [t.videoId] : [])))];
  const missing = tracks.filter((_, i) => !found[i]).map((t) => [t.title, t.artist].filter(Boolean).join(' — '));
  if (!videoIds.length) return { playlist, createdId: null, copied: 0, total: tracks.length, missing };
  const createdId = await createPlaylist(playlist.name, videoIds.slice(0, ADD_CHUNK), 'Copied from Spotify by BitChord');
  for (let at = ADD_CHUNK; at < videoIds.length; at += ADD_CHUNK) {
    await addToPlaylist(createdId, videoIds.slice(at, at + ADD_CHUNK));
  }
  return { playlist, createdId, copied: videoIds.length, total: tracks.length, missing };
}

/**
 * Copies every playlist in [plan], then, only if every copy was made,
 * deletes the old ones. A copy that throws stops the run before anything is
 * deleted; the copies already made stay.
 */
export async function runMirror(
  plan: MirrorPlan,
  onProgress: (progress: MirrorProgress) => void,
): Promise<{ copies: CopyResult[]; deleted: number }> {
  const copies: CopyResult[] = [];
  for (const [index, playlist] of plan.toCopy.entries()) {
    onProgress({ stage: 'copying', index, of: plan.toCopy.length, name: playlist.name, matched: 0, total: 0 });
    copies.push(
      await copyPlaylist(playlist, (matched, total) =>
        onProgress({ stage: 'copying', index, of: plan.toCopy.length, name: playlist.name, matched, total }),
      ),
    );
  }
  const made = new Set(copies.flatMap((c) => (c.createdId ? [c.createdId.replace(/^VL/, '')] : [])));
  const doomed = plan.toDelete.filter((p) => !made.has(p.id.replace(/^VL/, '')));
  for (const [index, playlist] of doomed.entries()) {
    onProgress({ stage: 'deleting', index, of: doomed.length, name: playlist.title });
    await deletePlaylist(playlist.id);
  }
  return { copies, deleted: doomed.length };
}
