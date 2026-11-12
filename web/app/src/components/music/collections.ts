import { albumQuery, artistQuery, playlistQuery } from '@/data/music/queries';
import type { MusicItem, Track } from '@/data/music/types';
import { fetchSpotifyTracks, LIKED_ID as SPOTIFY_LIKED_ID, matchToYouTube } from '@/data/spotify/api';
import { queryClient } from '@/lib/queryClient';
import type { ListContext } from './play';

/** What a collection menu or the palette knows about the thing it acts on. */
export type CollectionItem = Pick<MusicItem, 'kind' | 'id' | 'title'>;

export const COLLECTION_KINDS: ReadonlySet<MusicItem['kind']> = new Set(['album', 'playlist', 'artist', 'spotify-playlist']);

export function isCollection(item: Pick<MusicItem, 'kind'>): boolean {
  return COLLECTION_KINDS.has(item.kind);
}

export interface LoadedCollection {
  tracks: Track[];
  context: ListContext;
  /** Spotify songs with no YouTube Music version, left out of [tracks]. */
  missing: number;
}

/** Past this many songs a playlist stops loading: a queue that long is a mistake, not a wish. */
const MAX_TRACKS = 5000;
/** How many Spotify songs are looked up on YouTube Music at once (as the Spotify page does). */
const MATCH_PARALLELISM = 6;

/**
 * Every song of an album, playlist, artist (their top songs) or Spotify
 * playlist, ready to queue. A playlist is read to its end, not just its first
 * page; a Spotify playlist is matched to YouTube Music first, reporting
 * [onProgress] as it goes, and shares its matches with the playlist's page.
 */
export async function loadCollection(item: CollectionItem, onProgress?: (done: number, total: number) => void): Promise<LoadedCollection> {
  switch (item.kind) {
    case 'playlist': {
      const data = await queryClient.fetchInfiniteQuery(playlistQuery(item.id));
      const header = data.pages[0]?.header;
      const tracks = data.pages.flatMap((p) => p.tracks);
      for (let next = data.pages.at(-1)?.next ?? null; next && tracks.length < MAX_TRACKS; ) {
        const page = await next();
        tracks.push(...page.data);
        next = page.next;
      }
      return {
        tracks: tracks.filter((t) => !t.unavailable),
        context: { source: { title: header?.title ?? item.title, type: 'playlist', id: item.id }, fallbackArtwork: header?.thumbnail },
        missing: 0,
      };
    }
    case 'album': {
      const album = await queryClient.fetchQuery(albumQuery(item.id));
      return {
        tracks: album.tracks,
        context: { source: { title: album.title, type: 'album', id: album.id }, fallbackArtwork: album.thumbnail, fallbackArtists: album.artists },
        missing: 0,
      };
    }
    case 'artist': {
      const artist = await queryClient.fetchQuery(artistQuery(item.id));
      return {
        tracks: artist.topSongs,
        context: { source: { title: `${artist.name}: Top Songs`, type: 'artist', id: artist.id } },
        missing: 0,
      };
    }
    case 'spotify-playlist': {
      const source = await fetchSpotifyTracks(item.id, () => {});
      const found: (Track | null)[] = new Array(source.length).fill(null);
      let done = 0;
      let cursor = 0;
      const worker = async () => {
        while (cursor < source.length) {
          const at = cursor++;
          found[at] = await matchToYouTube(source[at]!).catch(() => null);
          onProgress?.(++done, source.length);
        }
      };
      await Promise.all(Array.from({ length: Math.min(MATCH_PARALLELISM, source.length) }, worker));
      const tracks = found.filter((t): t is Track => t !== null);
      return {
        tracks,
        context: { source: { title: item.title, type: 'playlist', id: `spotify:${item.id}` } },
        missing: source.length - tracks.length,
      };
    }
    default:
      throw new Error(`Not a collection: ${item.kind}`);
  }
}

/** The collection's own page on YouTube Music (or Spotify), for Copy Link. */
export function collectionLink(item: CollectionItem): string | null {
  switch (item.kind) {
    case 'playlist':
      return `https://music.youtube.com/playlist?list=${encodeURIComponent(item.id.replace(/^VL/, ''))}`;
    case 'album':
      return `https://music.youtube.com/browse/${encodeURIComponent(item.id)}`;
    case 'artist':
      return `https://music.youtube.com/channel/${encodeURIComponent(item.id)}`;
    case 'spotify-playlist':
      return item.id === SPOTIFY_LIKED_ID ? 'https://open.spotify.com/collection/tracks' : `https://open.spotify.com/playlist/${encodeURIComponent(item.id)}`;
    default:
      return null;
  }
}
