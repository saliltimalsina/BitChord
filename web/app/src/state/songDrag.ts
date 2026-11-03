import { create } from 'zustand';

/** What a song drag carries between the page and the sidebar. */
export const SONG_DRAG_TYPE = 'application/x-bitchord-songs';

export interface SongDrag {
  videoIds: string[];
  /** "Tum Hi Ho", or "3 songs": the drag image and the toast. */
  label: string;
}

interface SongDragState {
  /** The songs being dragged right now, for the sidebar to light up the playlists that take them. */
  current: SongDrag | null;
  start: (drag: SongDrag) => void;
  end: () => void;
}

export const useSongDrag = create<SongDragState>()((set) => ({
  current: null,
  start: (current) => set({ current }),
  end: () => set({ current: null }),
}));

/** A playlist's id as Add to Playlist knows it: without the VL of its browse id. */
export function bareId(playlistId: string): string {
  return playlistId.replace(/^VL/, '');
}

/** Whether the sidebar's [playlistId] is one of the playlists the dragged songs can go into. */
export function acceptsDrop(playlistId: string, addable: readonly { playlistId: string }[] | undefined): boolean {
  return !!addable?.some((option) => bareId(option.playlistId) === bareId(playlistId));
}
