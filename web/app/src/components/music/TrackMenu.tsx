import { ChevronLeft, ChevronRight, Disc3, Link2, ListEnd, ListPlus, ListStart, MicVocal, MoreHorizontal, Plus, Radio, Search, Star, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Menu, MenuHeader, MenuItem, MenuSeparator, type MenuPlacement, type MenuPoint } from '@/components/Menu';
import {
  useAddToPlaylist,
  useCreatePlaylist,
  useLikeStatus,
  usePlaylistOptions,
  useSetLiked,
  useSignedIn,
  useTrackAlbum,
} from '@/data/music/queries';
import type { Track } from '@/data/music/types';
import { usePlayer } from '@/state/player';
import { useUi } from '@/state/ui';
import { albumHref, artistHref, songLink } from './links';
import { startRadio } from './play';
import { toast, toastResult } from '@/state/toasts';
import { filterPlaylists } from './playlistFilter';

const menuField =
  'h-8 w-full rounded-[7px] border-0 bg-quinary pe-2 type-body text-primary outline-none placeholder:text-tertiary focus:bg-quaternary';

/**
 * Add to Playlist: a field to find one of the user's playlists by name, and
 * New Playlist, which names a new private playlist holding the song.
 */
function PlaylistChoices({ videoId, onDone, onBack }: { videoId: string; onDone: () => void; onBack: () => void }) {
  const options = usePlaylistOptions(videoId, true);
  const add = useAddToPlaylist();
  const create = useCreatePlaylist();
  const [query, setQuery] = useState('');
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus({ preventScroll: true }), [naming]);
  const shown = options.data ? filterPlaylists(options.data, query) : [];

  const createNamed = () => {
    const title = name.trim();
    if (!title || create.isPending) return;
    create.mutate(
      { title, videoId },
      {
        onSuccess: (playlistId) => {
          onDone();
          toast(`Added to ${title}`, { action: { label: 'View', href: `/playlist/${encodeURIComponent(playlistId)}` } });
        },
      },
    );
  };

  if (naming) {
    return (
      <>
        <MenuItem icon={<ChevronLeft size={14} />} onSelect={() => setNaming(false)}>
          Back
        </MenuItem>
        <MenuSeparator />
        <MenuHeader>New Playlist</MenuHeader>
        <form
          className="px-1 pb-1"
          onSubmit={(e) => {
            e.preventDefault();
            createNamed();
          }}
        >
          <input
            ref={field}
            className={`${menuField} ps-2.5`}
            value={name}
            maxLength={150}
            placeholder="Playlist name"
            aria-label="New playlist name"
            onChange={(e) => setName(e.target.value)}
          />
          {create.isError && <p className="px-1.5 pt-1.5 type-callout text-destructive">Couldn’t create the playlist</p>}
          <button
            type="submit"
            className="mt-1.5 h-7 w-full rounded-[7px] bg-key type-body-emphasized text-white enabled:hover:bg-key-rollover disabled:bg-quinary disabled:text-tertiary"
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? 'Creating…' : 'Create and Add'}
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <MenuItem icon={<ChevronLeft size={14} />} onSelect={onBack}>
        Back
      </MenuItem>
      <MenuSeparator />
      <div className="relative px-1 pb-1">
        <Search size={15} className="pointer-events-none absolute start-3.5 top-2 text-secondary" aria-hidden="true" />
        <input
          ref={field}
          className={`${menuField} ps-8`}
          type="search"
          value={query}
          placeholder="Find a playlist"
          aria-label="Find a playlist"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds to the only (or first) playlist the search left.
            if (e.key === 'Enter' && query.trim() && shown[0]) {
              e.preventDefault();
              const target = shown[0];
              toastResult(
                add.mutateAsync({ playlistId: target.playlistId, videoId }),
                { message: `Added to ${target.title}`, action: { label: 'View', href: `/playlist/${encodeURIComponent(target.playlistId)}` } },
                `Couldn’t add to ${target.title}`,
              );
              onDone();
            }
          }}
        />
      </div>
      <MenuItem
        icon={<Plus size={15} />}
        onSelect={() => {
          setName(query.trim());
          setNaming(true);
        }}
      >
        New Playlist
      </MenuItem>
      <MenuSeparator />
      {options.isPending && (
        <MenuItem disabled onSelect={() => {}}>
          Loading…
        </MenuItem>
      )}
      {options.isError && (
        <MenuItem disabled onSelect={() => {}}>
          Couldn’t load your playlists
        </MenuItem>
      )}
      {options.data && shown.length === 0 && (
        <MenuItem disabled onSelect={() => {}}>
          {query.trim() ? 'No matching playlists' : 'No playlists yet'}
        </MenuItem>
      )}
      {shown.map((option) => (
        <MenuItem
          key={option.playlistId}
          onSelect={() => {
            toastResult(
              add.mutateAsync({ playlistId: option.playlistId, videoId }),
              { message: `Added to ${option.title}`, action: { label: 'View', href: `/playlist/${encodeURIComponent(option.playlistId)}` } },
              `Couldn’t add to ${option.title}`,
            );
            onDone();
          }}
        >
          {option.title}
        </MenuItem>
      ))}
    </>
  );
}

/** Favorite and Add to Playlist: the account's actions, signed in only. */
function AccountItems({ track, onClose, onPlaylists }: { track: Track; onClose: () => void; onPlaylists: () => void }) {
  const status = useLikeStatus(track.videoId);
  const setLiked = useSetLiked();
  const liked = status.data === 'LIKE';
  return (
    <>
      <MenuSeparator />
      <MenuItem
        icon={<Star size={15} fill={liked ? 'currentColor' : 'none'} />}
        disabled={status.isPending}
        onSelect={() => {
          toastResult(
            setLiked.mutateAsync({ videoId: track.videoId, liked: !liked }),
            liked ? 'Removed from Favorites' : 'Added to Favorites',
            'Couldn’t update Favorites',
          );
          onClose();
        }}
      >
        {liked ? 'Unfavorite' : 'Favorite'}
      </MenuItem>
      <MenuItem icon={<ListPlus size={15} />} trailing={<ChevronRight size={14} />} onSelect={onPlaylists}>
        Add to Playlist
      </MenuItem>
    </>
  );
}

/** The artists a song credits that have a page to go to. */
function linkedArtists(track: Track) {
  return track.artists.filter((artist) => artist.id);
}

/** Go to Artist, with a list to choose from when the song credits several. */
function ArtistChoices({ track, onGo, onBack }: { track: Track; onGo: (href: string) => void; onBack: () => void }) {
  return (
    <>
      <MenuItem icon={<ChevronLeft size={14} />} onSelect={onBack}>
        Back
      </MenuItem>
      <MenuSeparator />
      <MenuHeader>Go to Artist</MenuHeader>
      {linkedArtists(track).map((artist) => (
        <MenuItem key={artist.id} onSelect={() => onGo(artistHref(artist.id)!)}>
          {artist.name}
        </MenuItem>
      ))}
    </>
  );
}

/**
 * Go to Album. A song from a search result doesn't say its album, so it's
 * looked up while the menu is open: the item waits, dimmed, and goes away if
 * the song has none.
 */
function GoToAlbum({ track, onGo }: { track: Track; onGo: (href: string) => void }) {
  const known = albumHref(track.album?.id ?? null);
  const lookup = useTrackAlbum(track.videoId, !known);
  const href = known ?? albumHref(lookup.data?.id ?? null);
  if (!href && !lookup.isPending) return null;
  return (
    <MenuItem icon={<Disc3 size={15} />} disabled={!href} onSelect={() => href && onGo(href)}>
      Go to Album
    </MenuItem>
  );
}

function TrackMenuItems({ track, onClose, onRemove }: { track: Track; onClose: () => void; onRemove?: (() => void) | undefined }) {
  const [view, setView] = useState<'main' | 'playlists' | 'artists'>('main');
  const signedIn = useSignedIn();
  const navigate = useNavigate();
  if (view === 'playlists') {
    return <PlaylistChoices videoId={track.videoId} onDone={onClose} onBack={() => setView('main')} />;
  }
  // Leaving the full-screen player too, or the page would open behind it.
  const go = (href: string) => {
    onClose();
    useUi.getState().setFullScreen(false);
    void navigate(href);
  };
  if (view === 'artists') return <ArtistChoices track={track} onGo={go} onBack={() => setView('main')} />;
  const { playNext, addToQueue } = usePlayer.getState();
  const artists = linkedArtists(track);
  return (
    <>
      <MenuItem icon={<ListStart size={15} />} onSelect={() => (onClose(), playNext([track]), toast('Playing next'))}>
        Play Next
      </MenuItem>
      <MenuItem icon={<ListEnd size={15} />} onSelect={() => (onClose(), addToQueue([track]), toast('Added to queue'))}>
        Add to Queue
      </MenuItem>
      {signedIn && <AccountItems track={track} onClose={onClose} onPlaylists={() => setView('playlists')} />}
      <MenuSeparator />
      <MenuItem
        icon={<Radio size={15} />}
        onSelect={() => {
          onClose();
          toastResult(startRadio(track), `Playing ${track.title} Radio`, 'Couldn’t start the radio');
        }}
      >
        Start Radio
      </MenuItem>
      {artists.length === 1 && (
        <MenuItem icon={<MicVocal size={15} />} onSelect={() => go(artistHref(artists[0]!.id)!)}>
          Go to Artist
        </MenuItem>
      )}
      {artists.length > 1 && (
        <MenuItem icon={<MicVocal size={15} />} trailing={<ChevronRight size={14} />} onSelect={() => setView('artists')}>
          Go to Artist
        </MenuItem>
      )}
      <GoToAlbum track={track} onGo={go} />
      <MenuSeparator />
      <MenuItem
        icon={<Link2 size={15} />}
        onSelect={() => {
          onClose();
          toastResult(navigator.clipboard.writeText(songLink(track.videoId)), 'Link copied', 'Couldn’t copy the link');
        }}
      >
        Copy Song Link
      </MenuItem>
      {onRemove && (
        <>
          <MenuSeparator />
          <MenuItem destructive icon={<Trash2 size={15} />} onSelect={() => (onClose(), onRemove())}>
            Remove from Playlist
          </MenuItem>
        </>
      )}
    </>
  );
}

/**
 * Right-click on a song (a row, a card): the ⋯ menu, opened where the click
 * was. Spread [onContextMenu] on the element and render [menu] beside it.
 */
export function useTrackContextMenu(
  track: Track | null,
  /** The user's own playlist: Remove from Playlist, as in the ⋯ menu. */
  onRemove?: (() => void) | undefined,
): { onContextMenu: ((event: MouseEvent) => void) | undefined; menu: ReactNode } {
  const [at, setAt] = useState<MenuPoint | null>(null);
  const close = useCallback(() => setAt(null), []);
  return {
    onContextMenu: track
      ? (event) => {
          event.preventDefault();
          setAt({ x: event.clientX, y: event.clientY });
        }
      : undefined,
    menu:
      track && at ? (
        // The menu is portaled, but React still bubbles its events to the row
        // it was opened from: a double-click in it mustn't play the row.
        <div
          className="contents"
          onDoubleClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => (event.preventDefault(), event.stopPropagation())}
        >
          <Menu anchor={at} onClose={close} label={track.title}>
            <TrackMenuItems track={track} onClose={close} onRemove={onRemove} />
          </Menu>
        </div>
      ) : null,
  };
}

/**
 * The ⋯ button at the end of a track row (report §14): Play Next, Add to
 * Queue, Start Radio, Go to Artist and Album and Copy Song Link for everyone;
 * Favorite and Add to Playlist signed in.
 */
export function TrackMenu({
  track,
  className,
  placement,
  onOpenChange,
  onRemove,
}: {
  track: Track;
  /** On a row of the user's own playlist: offers "Remove from Playlist". */
  onRemove?: (() => void) | undefined;
  className?: string;
  /** Where the menu opens from the button; the player's sit at the bottom of the window. */
  placement?: MenuPlacement;
  /** Told when the menu opens and closes; most mounts don't need to know. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  useEffect(() => {
    onOpenChange?.(anchor !== null);
  }, [anchor, onOpenChange]);
  return (
    <>
      <button
        className={className}
        aria-label={`More options for ${track.title}`}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        data-open={anchor !== null || undefined}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(anchor ? null : event.currentTarget);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <MoreHorizontal size={18} strokeWidth={2} />
      </button>
      {anchor && (
        <Menu anchor={anchor} placement={placement} onClose={close} label={track.title}>
          <TrackMenuItems track={track} onClose={close} onRemove={onRemove} />
        </Menu>
      )}
    </>
  );
}
