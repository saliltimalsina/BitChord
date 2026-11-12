import type { BrowseLink, MusicItem } from '@/data/music/types';
import type { QueueSource } from '@/playback/queue/timeline';

/** Where tapping an item goes; null for songs and videos, which play instead. */
export function hrefFor(item: Pick<MusicItem, 'kind' | 'id'>): string | null {
  switch (item.kind) {
    case 'album':
      return `/album/${encodeURIComponent(item.id)}`;
    case 'playlist':
      return `/playlist/${encodeURIComponent(item.id)}`;
    case 'spotify-playlist':
      return `/spotify/playlist/${encodeURIComponent(item.id)}`;
    case 'artist':
      return `/artist/${encodeURIComponent(item.id)}`;
    case 'podcast':
      return `/browse/${encodeURIComponent(item.id)}`;
    default:
      return null;
  }
}

export function artistHref(id: string | null): string | null {
  return id ? `/artist/${encodeURIComponent(id)}` : null;
}

export function albumHref(id: string | null): string | null {
  return id ? `/album/${encodeURIComponent(id)}` : null;
}

/**
 * The page a queue was started from, for "Playing from …"; null where there is
 * no page to go back to (search, home, a hand-built queue, a radio station).
 */
export function sourceHref(source: QueueSource | null | undefined): string | null {
  const id = source?.id;
  if (!id) return null;
  switch (source.type) {
    case 'album':
      return albumHref(id);
    case 'artist':
      return artistHref(id);
    case 'playlist':
      return id.startsWith('spotify:')
        ? `/spotify/playlist/${encodeURIComponent(id.slice('spotify:'.length))}`
        : `/playlist/${encodeURIComponent(id)}`;
    case 'library':
      return `/library/${encodeURIComponent(id)}`;
    default:
      return null;
  }
}

/** See All and mood/genre pages. Playlists open as playlists. */
export function browseHref(link: BrowseLink): string {
  if (link.browseId.startsWith('VL')) return `/playlist/${encodeURIComponent(link.browseId)}`;
  if (link.browseId.startsWith('MPREb_')) return `/album/${encodeURIComponent(link.browseId)}`;
  if (link.browseId.startsWith('UC')) return `/artist/${encodeURIComponent(link.browseId)}`;
  const query = link.params ? `?params=${encodeURIComponent(link.params)}` : '';
  return `/browse/${encodeURIComponent(link.browseId)}${query}`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** A song's link on YouTube Music, for Copy Song Link. */
export function songLink(videoId: string): string {
  return `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}
