import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { PrefetchLink } from '@/components/PrefetchLink';
import { PauseIcon, PlayIcon } from '@/components/icons/Transport';
import type { ArtistRef, Track } from '@/data/music/types';
import { usePlayer } from '@/state/player';
import { SONG_DRAG_TYPE, useSongDrag } from '@/state/songDrag';
import { Artwork } from './Artwork';
import { ExplicitBadge } from './ExplicitBadge';
import { albumHref, artistHref, formatDuration } from './links';
import { playList, playTrack, type ListContext } from './play';
import { clickSelection, NO_SELECTION, selectedItems, type Selection } from './selection';
import { TrackMenu, useTrackContextMenu } from './TrackMenu';

type Variant = 'album' | 'playlist';

const ROW_HEIGHT: Record<Variant, number> = { album: 46, playlist: 54 };
/** A playlist's compact view: no artwork, the position instead, 36px rows. */
const COMPACT_ROW_HEIGHT = 36;
/** Below this, plain rows: an album or a short playlist gains nothing from virtualizing. */
const VIRTUALIZE_FROM = 80;

interface TrackListProps {
  tracks: Track[];
  variant: Variant;
  /** Album artwork, for rows that have none of their own (album tracks). */
  fallbackArtwork?: string | null;
  /** The album's artists, credited when a track has none of its own. */
  fallbackArtists?: ArtistRef[];
  /** Called when the list nears its end, to load the next page of a long playlist. */
  onNearEnd?: () => void;
  /** Where the list comes from: playing a row queues the list from there. Without it, a row plays alone. */
  source?: ListContext['source'];
  /** The user's own playlist: each row's menu offers "Remove from Playlist". */
  onRemove?: (track: Track) => void;
  /** The user's own playlist: rows can be dragged up and down; called with the old and new position. */
  onMove?: (from: number, to: number) => void;
  /** Playlists only: compact rows, numbered, with no artwork. */
  compact?: boolean;
}

/** A row being dragged, and the gap it would drop into (0 = before the first row). */
interface Drag {
  from: number;
  slot: number | null;
}

/* Track lists (report §3 album rows, §14 playlist rows). */

const cell = 'flex h-full min-w-0 items-center';
// 396 / 274 / 274 / 141 at 1440px (report §14).
const playlistColumns = 'grid-cols-[minmax(0,36.5fr)_minmax(0,25.25fr)_minmax(0,25.25fr)_minmax(0,13fr)]';
// Artist and album: playlists only, and not below 768px.
const secondary = `${cell} pe-2.5 max-md:hidden`;
const tertiary = `${cell} pe-4 max-md:hidden`;
// A row from another catalogue with no YouTube Music song (yet) is dimmed.
const dimmed = 'group-data-unavailable/row:opacity-45';
const link = 'text-inherit hover:underline group-data-current/row:text-primary';

/**
 * A hairline on top of every row, hidden on hover and around the playing row;
 * a fill on hover, a stronger one for the playing row.
 */
const row = [
  'group/row relative grid items-center bg-transparent select-none hover:bg-tracklist-hover data-unavailable:cursor-default',
  'data-current:bg-[color-mix(in_srgb,var(--systemPrimary)_12%,transparent)]',
  'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:border-t-[0.5px] before:border-t-divider',
  'hover:before:border-t-transparent data-current:before:border-t-transparent [&:hover+&]:before:border-t-transparent [&[data-current]+&]:before:border-t-transparent',
  // Dragging to reorder: the picked-up row fades, a key-coloured line marks where it lands.
  'data-dragging:opacity-40',
  'after:pointer-events-none after:absolute after:inset-x-2 after:hidden after:h-0.5 after:rounded-full after:bg-key',
  'data-[drop=before]:after:-top-px data-[drop=before]:after:block data-[drop=after]:after:-bottom-px data-[drop=after]:after:block',
  // Picked rows (click, ⌘/Ctrl-click, Shift-click): the key colour, stronger than hover.
  'data-selected:bg-[color-mix(in_srgb,var(--keyColor)_24%,transparent)] data-selected:before:border-t-transparent [&[data-selected]+&]:before:border-t-transparent',
].join(' ');

const rowVariant: Record<Variant, string> = {
  // Title, plays (when YouTube gives them, as Spotify's album rows have), time.
  album: 'h-[46px] grid-cols-[minmax(0,1fr)_auto_auto] rounded-row max-md:grid-cols-[minmax(0,1fr)_auto]',
  playlist: `h-[54px] ${playlistColumns} rounded-[12px] data-compact:h-9 data-compact:rounded-row max-md:grid-cols-[minmax(0,1fr)_auto]`,
};

function Artists({ artists }: { artists: ArtistRef[] }) {
  return (
    <>
      {artists.map((artist, i) => {
        const href = artistHref(artist.id);
        return (
          <span key={`${artist.name}-${i}`}>
            {i > 0 && ', '}
            {href ? (
              <PrefetchLink to={href} className={link}>
                {artist.name}
              </PrefetchLink>
            ) : (
              artist.name
            )}
          </span>
        );
      })}
    </>
  );
}

const time: Record<Variant, string> = {
  album: 'relative justify-end pe-3 type-body tabular-nums',
  playlist: 'relative justify-end pe-[18px] type-body tabular-nums',
};

interface RowProps {
  track: Track;
  variant: Variant;
  position: number;
  fallbackArtwork: string | null | undefined;
  onPlayRow: () => void;
  onRemove: (() => void) | undefined;
  /** Drag to reorder: present only on the user's own playlist. */
  drag?: {
    dragging: boolean;
    /** A line above or below this row where the dragged one would land. */
    drop: 'before' | 'after' | null;
    onStart: () => void;
    onOver: (after: boolean) => void;
    onDrop: () => void;
    onEnd: () => void;
  };
  compact?: boolean | undefined;
  selected: boolean;
  /** A click on the row itself (not a button or link in it): pick it. */
  onPick: (event: MouseEvent) => void;
  /** Right-click: picks the row if it isn't already, and answers the songs the menu acts on. */
  onContext: () => Track[] | null;
  /** The picked songs, when this row is one of several: its ⋯ acts on them all. */
  many: Track[] | null;
  /** The user's own playlist: Remove from Playlist for every picked song. */
  onRemoveMany: ((tracks: Track[]) => void) | undefined;
}

/** The drag image: a pill naming what's dragged, instead of a ghost of the whole row. */
function setDragLabel(transfer: DataTransfer, label: string) {
  const pill = document.createElement('div');
  pill.textContent = label;
  pill.style.cssText =
    'position:fixed;top:-100px;left:0;padding:6px 12px;border-radius:999px;background:var(--keyColor);color:#fff;font:600 13px/1.2 system-ui,sans-serif;white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis';
  document.body.append(pill);
  transfer.setDragImage(pill, 16, 14);
  setTimeout(() => pill.remove());
}

function Row({ track, variant, position, fallbackArtwork, onPlayRow, onRemove, drag, compact, selected, onPick, onContext, many, onRemoveMany }: RowProps) {
  const artwork = variant === 'playlist' && !compact;
  const current = usePlayer((s) => s.nowPlaying?.videoId === track.videoId);
  const playing = usePlayer((s) => s.nowPlaying?.videoId === track.videoId && (s.status === 'playing' || s.status === 'buffering'));
  const togglePlay = usePlayer((s) => s.togglePlay);
  const unavailable = track.unavailable;
  const onPlay = () => (unavailable ? undefined : current ? togglePlay() : onPlayRow());
  const context = useTrackContextMenu(unavailable ? null : track, onContext, onRemove, onRemoveMany);

  return (
    <div
      className={`${row} ${rowVariant[variant]}`}
      data-variant={variant}
      data-compact={compact || undefined}
      data-current={current || undefined}
      data-selected={selected || undefined}
      aria-selected={selected}
      data-unavailable={unavailable}
      title={unavailable === 'matching' ? 'Looking for this on YouTube Music…' : unavailable === 'missing' ? 'Not found on YouTube Music' : undefined}
      onDoubleClick={onPlay}
      // Drag a song, or the picked ones, onto a playlist in the sidebar; on
      // the user's own playlist the same drag also reorders it.
      draggable={!unavailable}
      onDragStart={(event) => {
        const songs = many ?? [track];
        const carried = { videoIds: songs.map((s) => s.videoId), label: songs.length > 1 ? `${songs.length} songs` : track.title };
        event.dataTransfer.effectAllowed = drag ? 'copyMove' : 'copy';
        event.dataTransfer.setData(SONG_DRAG_TYPE, JSON.stringify(carried.videoIds));
        event.dataTransfer.setData('text/plain', carried.label);
        setDragLabel(event.dataTransfer, carried.label);
        useSongDrag.getState().start(carried);
        drag?.onStart();
      }}
      onDragEnd={() => {
        useSongDrag.getState().end();
        drag?.onEnd();
      }}
      onClick={(event) => {
        if (!(event.target as Element).closest('button, a, input')) onPick(event);
      }}
      onContextMenu={context.onContextMenu}
      data-dragging={drag?.dragging || undefined}
      data-drop={drag?.drop ?? undefined}
      {...(drag && {
        onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const rect = e.currentTarget.getBoundingClientRect();
          drag.onOver(e.clientY > rect.top + rect.height / 2);
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          drag.onDrop();
        },
      })}
    >
      {context.menu}
      <div className={`${cell} gap-3`}>
        <div className={`relative grid w-10 shrink-0 place-items-center${variant === 'playlist' ? ' ms-[7px]' : ''}`}>
          {artwork ? (
            <>
              <Artwork src={track.thumbnail ?? fallbackArtwork ?? null} displayWidth={40} radius="var(--radius-artwork-small)" />
              {current && (
                // The playing row's marker: a still play glyph over the artwork (or where the number was).
                <span
                  className="absolute inset-0 grid place-items-center rounded-artwork-sm bg-[rgb(0_0_0/0.45)] text-white group-hover/row:invisible"
                  aria-label="Now playing"
                >
                  <PlayIcon size={18} />
                </span>
              )}
            </>
          ) : (
            <span className="type-body text-secondary group-hover/row:invisible">
              {current ? (
                <span className="grid place-items-center text-primary group-hover/row:invisible" aria-label="Now playing">
                  <PlayIcon size={14} />
                </span>
              ) : (
                (track.index ?? position)
              )}
            </span>
          )}
          <button
            className={`absolute inset-0 grid place-items-center rounded-artwork-sm opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 group-data-unavailable/row:hidden ${
              artwork ? 'bg-lockup-hover text-white' : 'text-primary'
            }`}
            aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`}
            onClick={onPlay}
            disabled={!!unavailable}
          >
            {playing ? <PauseIcon size={artwork ? 18 : 16} /> : <PlayIcon size={artwork ? 18 : 16} />}
          </button>
        </div>
        <div
          className={`flex min-w-0 flex-col ${dimmed} group-data-[unavailable=matching]/row:animate-matching motion-reduce:group-data-[unavailable=matching]/row:animate-none`}
        >
          <div className="flex min-w-0 items-center">
            <span className="truncate type-body text-primary">{track.title}</span>
            {track.explicit && <ExplicitBadge />}
          </div>
          {variant === 'album' && track.artists.length > 0 && (
            <div className="truncate type-callout">
              <Artists artists={track.artists} />
            </div>
          )}
        </div>
      </div>
      {variant === 'playlist' && (
        <>
          <div className={`${secondary} ${dimmed}`}>
            <span className="truncate type-body">
              <Artists artists={track.artists} />
            </span>
          </div>
          <div className={`${tertiary} ${dimmed}`}>
            <span className="truncate type-body">
              {track.album &&
                (albumHref(track.album.id) ? (
                  <PrefetchLink to={albumHref(track.album.id)!} className={link}>
                    {track.album.name}
                  </PrefetchLink>
                ) : (
                  track.album.name
                ))}
            </span>
          </div>
        </>
      )}
      {variant === 'album' && (
        <div className={`${cell} w-[120px] justify-end pe-6 type-body text-secondary tabular-nums max-md:hidden`}>{track.plays}</div>
      )}
      <div className={`${cell} ${time[variant]} ${dimmed}`}>
        {/* The ⋯ button (TrackMenu) takes the time's place on hover, as Apple's rows do. */}
        <span className={unavailable ? undefined : 'group-focus-within/row:invisible group-hover/row:invisible group-has-[[data-open]]/row:invisible'}>
          {unavailable === 'missing' ? 'Not found' : formatDuration(track.durationSec)}
        </span>
        {!unavailable && (
          <TrackMenu
            track={track}
            onRemove={onRemove}
            many={many}
            onRemoveMany={onRemoveMany}
            className="absolute end-2.5 hidden size-7 place-items-center rounded-full text-key group-focus-within/row:grid group-hover/row:grid hover:bg-quinary data-open:grid"
          />
        )}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className={`grid h-8 items-center ${playlistColumns} type-callout-emphasized text-secondary max-md:hidden`} aria-hidden="true">
      <div className={`${cell} gap-3 ps-[7px]`}>Song</div>
      <div className={secondary}>Artist</div>
      <div className={tertiary}>Album</div>
      <div className={`${cell} ${time.playlist}`}>Time</div>
    </div>
  );
}

/**
 * Album and playlist track lists (report §3, §14): hairline-divided rows,
 * hover fill, the number (or artwork) turning into a play button. Long lists
 * are virtualized against the page's scroll container (prompt §3).
 */
export function TrackList({ tracks, variant, fallbackArtwork, fallbackArtists, onNearEnd, source, onRemove, onMove, compact }: TrackListProps) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragProps = (i: number): RowProps['drag'] =>
    onMove && {
      dragging: drag?.from === i,
      // Gaps right next to the dragged row move nothing, so they show no line.
      drop: drag && drag.slot !== drag.from && drag.slot !== drag.from + 1 ? (drag.slot === i ? 'before' : drag.slot === i + 1 && i === tracks.length - 1 ? 'after' : null) : null,
      onStart: () => setDrag({ from: i, slot: null }),
      onOver: (after) => setDrag((d) => (d && d.slot !== i + (after ? 1 : 0) ? { ...d, slot: i + (after ? 1 : 0) } : d)),
      onDrop: () => {
        if (drag && drag.slot !== null) {
          const to = drag.slot > drag.from ? drag.slot - 1 : drag.slot;
          if (to !== drag.from) onMove(drag.from, to);
        }
        setDrag(null);
      },
      onEnd: () => setDrag(null),
    };
  const playRow = (i: number) => {
    // Rows from another catalogue that found no YouTube Music song stay out of the queue.
    if (source) {
      const playable = tracks.filter((t) => !t.unavailable);
      return playList(playable, Math.max(0, playable.indexOf(tracks[i]!)), { source, fallbackArtwork, fallbackArtists });
    }
    const track = tracks[i]!;
    playTrack(track.artists.length || !fallbackArtists ? track : { ...track, artists: fallbackArtists }, fallbackArtwork);
  };
  const container = useRef<HTMLDivElement>(null);

  // Picking songs, as in Spotify: click, ⌘/Ctrl-click, Shift-click; Esc or a click elsewhere lets go.
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const picked = selection.rows.size;
  const first = tracks[0]?.videoId;
  // A different list (sorted, filtered, another page) lets go; more pages loading under it don't.
  useEffect(() => setSelection(NO_SELECTION), [first]);
  useEffect(() => {
    if (!picked) return;
    const outside = (event: Event) => {
      const target = event.target as Element | null;
      if (!target?.closest('[role="menu"]') && !container.current?.contains(target)) setSelection(NO_SELECTION);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !(event.target as Element | null)?.closest('[role="menu"], [role="dialog"]')) setSelection(NO_SELECTION);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', onKey);
    };
  }, [picked]);
  const pick = useCallback(
    (i: number, event: MouseEvent) =>
      setSelection((s) => clickSelection(s, i, { toggle: event.metaKey || event.ctrlKey, range: event.shiftKey })),
    [],
  );
  const pickedTracks = picked > 1 ? selectedItems(tracks, selection) : null;
  const rowSelection = (i: number) => ({
    selected: selection.rows.has(i),
    onPick: (event: MouseEvent) => pick(i, event),
    onContext: () => {
      if (selection.rows.has(i) && picked > 1) return selectedItems(tracks, selection);
      setSelection(clickSelection(NO_SELECTION, i, { toggle: false, range: false }));
      return null;
    },
    many: selection.rows.has(i) ? pickedTracks : null,
    // Removing shifts the rows under the picked positions: let go first.
    onRemoveMany: onRemove && ((picked: Track[]) => (setSelection(NO_SELECTION), picked.forEach(onRemove))),
  });
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  useEffect(() => setScrollElement(document.getElementById('scrollable-page')), []);
  const virtual = tracks.length >= VIRTUALIZE_FROM;

  const virtualizer = useVirtualizer({
    count: virtual ? tracks.length : 0,
    getScrollElement: () => scrollElement,
    estimateSize: () => (compact ? COMPACT_ROW_HEIGHT : ROW_HEIGHT[variant]),
    overscan: 10,
    scrollMargin: container.current?.offsetTop ?? 0,
  });

  // The rows' height changes with the view; the measured ones are stale.
  useEffect(() => virtualizer.measure(), [compact, virtualizer]);

  const items = virtual ? virtualizer.getVirtualItems() : [];
  const last = items[items.length - 1];
  useEffect(() => {
    if (!onNearEnd) return;
    if (virtual ? last && last.index >= tracks.length - 20 : true) onNearEnd();
  }, [last?.index, tracks.length, virtual, onNearEnd]);

  return (
    <div className="mx-(--body-gutter) type-callout text-secondary" data-variant={variant} role="table" aria-label="Songs">
      {variant === 'playlist' && <Header />}
      <div ref={container}>
        {virtual ? (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {items.map((item) => (
              <div
                key={item.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
                }}
              >
                <Row
                  track={tracks[item.index]!}
                  variant={variant}
                  position={item.index + 1}
                  fallbackArtwork={fallbackArtwork}
                  onPlayRow={() => playRow(item.index)}
                  onRemove={onRemove && (() => onRemove(tracks[item.index]!))}
                  drag={dragProps(item.index)}
                  compact={compact}
                  {...rowSelection(item.index)}
                />
              </div>
            ))}
          </div>
        ) : (
          tracks.map((track, i) => (
            <Row
              key={`${track.videoId}-${i}`}
              track={track}
              variant={variant}
              position={i + 1}
              fallbackArtwork={fallbackArtwork}
              onPlayRow={() => playRow(i)}
              onRemove={onRemove && (() => onRemove(track))}
              drag={dragProps(i)}
              compact={compact}
              {...rowSelection(i)}
            />
          ))
        )}
      </div>
    </div>
  );
}
