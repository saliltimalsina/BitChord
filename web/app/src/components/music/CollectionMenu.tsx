import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Link2, ListEnd, ListPlus, ListStart, MicVocal, Pencil, Pin, PinOff, Play, Shuffle, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { Menu, MenuItem, MenuSeparator, type MenuPoint } from '@/components/Menu';
import { playlistQuery, useSignedIn } from '@/data/music/queries';
import type { HeaderInfo, MusicItem, Track } from '@/data/music/types';
import { usePlayer } from '@/state/player';
import { MAX_PINS, usePins } from '@/state/pins';
import { toast, toastResult } from '@/state/toasts';
import { useUi } from '@/state/ui';
import { collectionLink, isCollection, loadCollection, type CollectionItem, type LoadedCollection } from './collections';
import { EditPlaylistDialog } from './EditPlaylistDialog';
import { artistHref, hrefFor } from './links';
import { playList, prepared, shuffleList, toTrack } from './play';
import { PlaylistChoices, songsLabel, TrackContextMenu } from './TrackMenu';

/** What a collection's menu can show: its kind and id, and the artists an album links to. */
export type MenuTarget = CollectionItem & Partial<Pick<MusicItem, 'artists'>>;

export type CollectionAction = 'play' | 'shuffle' | 'next' | 'queue';

/** Collections being loaded for an action, so a second click doesn't start a second load. */
const pending = new Set<string>();

/**
 * Plays, shuffles or queues a whole collection, telling the user how it went
 * in a toast: a Spotify playlist reports its matching as it goes, since a
 * long one takes a while to find on YouTube Music.
 */
export async function runCollection(item: CollectionItem, action: CollectionAction): Promise<void> {
  const key = `${item.kind}:${item.id}`;
  if (pending.has(key)) return;
  pending.add(key);
  const spotify = item.kind === 'spotify-playlist';
  toast(spotify ? `Finding ${item.title} on YouTube Music…` : `Loading ${item.title}…`);
  let shown = 0;
  let loaded: LoadedCollection;
  try {
    loaded = await loadCollection(item, (done, total) => {
      // Every few songs, not every one: each update replaces the toast.
      if (done - shown < 5 && done < total) return;
      shown = done;
      toast(`Finding ${item.title} on YouTube Music… ${done} of ${total}`);
    });
  } catch {
    toast(`Couldn’t load ${item.title}`, { error: true });
    return;
  } finally {
    pending.delete(key);
  }
  const { tracks, context, missing } = loaded;
  if (!tracks.length) {
    toast(missing ? `None of ${item.title} is on YouTube Music` : `${item.title} has no songs to play`, { error: true });
    return;
  }
  const notFound = missing ? ` · ${missing} not on YouTube Music` : '';
  const player = usePlayer.getState();
  switch (action) {
    case 'play':
      playList(tracks, 0, context);
      if (missing) toast(`Playing ${item.title}${notFound}`);
      return;
    case 'shuffle':
      shuffleList(tracks, context);
      if (missing) toast(`Shuffling ${item.title}${notFound}`);
      return;
    case 'next':
      player.playNext(prepared(tracks, context), context.source);
      toast(`Playing ${songsLabel(tracks.length)} from ${item.title} next${notFound}`);
      return;
    case 'queue':
      player.addToQueue(prepared(tracks, context), context.source);
      toast(`Added ${songsLabel(tracks.length)} from ${item.title} to the queue${notFound}`);
      return;
  }
}

/**
 * Add to Playlist for a whole collection: its songs are loaded first (a
 * Spotify playlist matched), then the usual playlist picker takes over.
 */
function CollectionPlaylistChoices({ item, onDone, onBack }: { item: CollectionItem; onDone: () => void; onBack: () => void }) {
  const [state, setState] = useState<{ tracks: Track[] } | { progress: string } | { error: true }>({ progress: 'Loading songs…' });
  const { kind, id, title } = item;
  useEffect(() => {
    let live = true;
    loadCollection({ kind, id, title }, (done, total) => live && setState({ progress: `Finding songs… ${done} of ${total}` })).then(
      ({ tracks }) => live && setState({ tracks }),
      () => live && setState({ error: true }),
    );
    return () => void (live = false);
  }, [kind, id, title]);
  if ('tracks' in state && state.tracks.length) {
    return <PlaylistChoices videoIds={state.tracks.map((t) => t.videoId)} onDone={onDone} onBack={onBack} />;
  }
  return (
    <>
      <MenuItem icon={<ChevronLeft size={14} />} onSelect={onBack}>
        Back
      </MenuItem>
      <MenuSeparator />
      <MenuItem disabled onSelect={() => {}}>
        {'progress' in state ? state.progress : 'error' in state ? `Couldn’t load ${item.title}` : 'No songs to add'}
      </MenuItem>
    </>
  );
}

function CollectionMenuItems({
  item,
  onClose,
  onEdit,
}: {
  item: MenuTarget;
  onClose: () => void;
  /** Edit Details or Delete Playlist on the user's own playlist, with what its header says. */
  onEdit: (mode: 'edit' | 'delete', info: HeaderInfo) => void;
}) {
  const [view, setView] = useState<'main' | 'playlists'>('main');
  const signedIn = useSignedIn();
  const navigate = useNavigate();
  const isPlaylist = item.kind === 'playlist';
  const pinned = usePins((state) => isPlaylist && state.pinned.includes(item.id));
  // Only the user's own playlists can be edited, and only the playlist's
  // header says which those are; the page reads the same query, so this also
  // warms it.
  const owned = useInfiniteQuery({ ...playlistQuery(item.id), enabled: signedIn && isPlaylist });
  const header = owned.data?.pages[0]?.header ?? null;
  const editable = signedIn && isPlaylist && !!header?.editable;

  if (view === 'playlists') return <CollectionPlaylistChoices item={item} onDone={onClose} onBack={() => setView('main')} />;

  const run = (action: CollectionAction) => {
    onClose();
    void runCollection(item, action);
  };
  const go = (href: string) => {
    onClose();
    useUi.getState().setFullScreen(false);
    void navigate(href);
  };
  const artist = item.kind === 'album' ? item.artists?.find((a) => a.id) : undefined;
  const link = collectionLink(item);
  const isArtist = item.kind === 'artist';

  return (
    <>
      <MenuItem icon={<Play size={15} />} onSelect={() => run('play')}>
        {isArtist ? 'Play Top Songs' : 'Play'}
      </MenuItem>
      <MenuItem icon={<Shuffle size={15} />} onSelect={() => run('shuffle')}>
        Shuffle
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<ListStart size={15} />} onSelect={() => run('next')}>
        Play Next
      </MenuItem>
      <MenuItem icon={<ListEnd size={15} />} onSelect={() => run('queue')}>
        Add to Queue
      </MenuItem>
      {signedIn && (
        <MenuItem icon={<ListPlus size={15} />} trailing={<ChevronRight size={14} />} onSelect={() => setView('playlists')}>
          Add to Playlist
        </MenuItem>
      )}
      <MenuSeparator />
      {artist?.id && (
        <MenuItem icon={<MicVocal size={15} />} onSelect={() => go(artistHref(artist.id)!)}>
          Go to Artist
        </MenuItem>
      )}
      {isPlaylist && (
        <MenuItem
          icon={pinned ? <PinOff size={15} /> : <Pin size={15} />}
          onSelect={() => {
            onClose();
            if (!usePins.getState().toggle(item.id)) toast(`You can pin up to ${MAX_PINS} playlists`, { error: true });
          }}
        >
          {pinned ? 'Unpin' : 'Pin to Top'}
        </MenuItem>
      )}
      {link && (
        <MenuItem
          icon={<Link2 size={15} />}
          onSelect={() => {
            onClose();
            toastResult(navigator.clipboard.writeText(link), 'Link copied', 'Couldn’t copy the link');
          }}
        >
          Copy Link
        </MenuItem>
      )}
      {editable && header && (
        <>
          <MenuSeparator />
          <MenuItem icon={<Pencil size={15} />} onSelect={() => (onClose(), onEdit('edit', header))}>
            Edit Details…
          </MenuItem>
          <MenuItem destructive icon={<Trash2 size={15} />} onSelect={() => (onClose(), onEdit('delete', header))}>
            Delete Playlist…
          </MenuItem>
        </>
      )}
    </>
  );
}

const stop = (event: SyntheticEvent) => event.stopPropagation();

/**
 * A portaled menu still bubbles its React events to whatever it was opened
 * from: a link, a palette row that plays on click, a dialog that moves its
 * selection on the arrow keys. This keeps them in the menu.
 */
export function MenuIsolation({ children }: { children: ReactNode }) {
  return (
    <div
      className="contents"
      onClick={stop}
      onDoubleClick={stop}
      onMouseDown={stop}
      onKeyDown={stop}
      onContextMenu={(event) => (event.preventDefault(), event.stopPropagation())}
    >
      {children}
    </div>
  );
}

/** A collection's menu at a point, and the edit dialog it can open. */
export function CollectionContextMenu({ item, at, onClose }: { item: MenuTarget; at: MenuPoint | null; onClose: () => void }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState<{ mode: 'edit' | 'delete'; info: HeaderInfo } | null>(null);
  return (
    <MenuIsolation>
      {at && (
        <Menu anchor={at} onClose={onClose} label={item.title}>
          <CollectionMenuItems item={item} onClose={onClose} onEdit={(mode, info) => setEditing({ mode, info })} />
        </Menu>
      )}
      {editing && (
        <EditPlaylistDialog
          playlistId={item.id}
          info={editing.info}
          startWithDelete={editing.mode === 'delete'}
          onClose={() => setEditing(null)}
          onDeleted={() => {
            setEditing(null);
            // Deleted from its own page: that page is gone too.
            if (decodeURIComponent(window.location.pathname) === decodeURIComponent(hrefFor(item) ?? '')) void navigate('/library/playlists');
          }}
        />
      )}
    </MenuIsolation>
  );
}

/**
 * Right-click on anything in the catalogue: a song's menu for songs and
 * videos, a collection's for albums, playlists, artists and Spotify
 * playlists, nothing for the rest. Spread [onContextMenu] on the element and
 * render [menu] beside it.
 */
export function useItemContextMenu(
  item: (MenuTarget & Partial<MusicItem>) | null,
): { onContextMenu: ((event: MouseEvent) => void) | undefined; menu: ReactNode } {
  const [at, setAt] = useState<MenuPoint | null>(null);
  const close = useCallback(() => setAt(null), []);
  const song = item && (item.kind === 'song' || item.kind === 'video');
  const usable = item && (song || isCollection(item));
  return {
    onContextMenu: usable
      ? (event) => {
          event.preventDefault();
          event.stopPropagation();
          setAt({ x: event.clientX, y: event.clientY });
        }
      : undefined,
    menu: !usable ? null : song ? (
      at && (
        <MenuIsolation>
          <TrackContextMenu track={toTrack(asMusicItem(item))} at={at} onClose={close} />
        </MenuIsolation>
      )
    ) : (
      <CollectionContextMenu item={item} at={at} onClose={close} />
    ),
  };
}

/** A palette or library item, filled out to the shape a song's menu wants. */
function asMusicItem(item: MenuTarget & Partial<MusicItem>): MusicItem {
  return {
    subtitle: '',
    artists: [],
    album: null,
    thumbnail: null,
    wide: false,
    durationSec: null,
    explicit: false,
    ...item,
  };
}
