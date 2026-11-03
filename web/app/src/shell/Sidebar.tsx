import { useState } from 'react';
import { ArrowUpRight, BarChart3, Command, ListMusic, Pin, Settings } from 'lucide-react';
import { MdOutlineExtension } from 'react-icons/md';
import { PrefetchLink, PrefetchNavLink } from '@/components/PrefetchLink';
import { LogoMark } from '@/components/icons/LogoMark';
import {
  AlbumsIcon,
  AllPlaylistsIcon,
  ArtistsIcon,
  HomeIcon,
  MadeForYouIcon,
  NewIcon,
  RecentlyAddedIcon,
  SearchIcon,
  SongsIcon,
  type NavIconProps,
} from '@/components/icons/NavIcons';
import { hrefFor } from '@/components/music/links';
import { usePinMenu } from '@/components/music/PinMenu';
import { config } from '@/config';
import { LIBRARY_SECTIONS, type LibrarySection } from '@/data/music/library';
import { pinnedFirst } from '@/data/music/libraryView';
import { useAddToPlaylist, useLibraryPlaylists, usePlaylistOptions, useSignedIn } from '@/data/music/queries';
import type { MusicItem } from '@/data/music/types';
import { useSpotifyPlaylists } from '@/data/spotify/queries';
import { useExtensionUpdate } from '@/extension/useExtensionUpdate';
import { useSpotifySignedIn } from '@/extension/useSpotifyAuth';
import { isMac } from '@/lib/platform';
import { usePins } from '@/state/pins';
import { acceptsDrop, bareId, SONG_DRAG_TYPE, useSongDrag } from '@/state/songDrag';
import { toastResult } from '@/state/toasts';
import { useUi } from '@/state/ui';
import { AccountButton } from './AccountButton';

/** Listening Stats' glyph, drawn at the other nav icons' size. */
function StatsIcon({ size = 28, ...props }: NavIconProps) {
  return <BarChart3 width={size} height={size} strokeWidth={1.6} {...(props as object)} />;
}

interface NavItem {
  to: string;
  label: string;
  Icon: (props: NavIconProps) => React.ReactNode;
}

const PRIMARY: NavItem[] = [
  { to: '/search', label: 'Search', Icon: SearchIcon },
  { to: '/home', label: 'Home', Icon: HomeIcon },
  { to: '/new', label: 'New', Icon: NewIcon },
];

const LIBRARY_ICONS: Record<Exclude<LibrarySection, 'playlists'>, NavItem['Icon']> = {
  recent: RecentlyAddedIcon,
  artists: ArtistsIcon,
  albums: AlbumsIcon,
  songs: SongsIcon,
  'made-for-you': MadeForYouIcon,
};

const LIBRARY: NavItem[] = [
  ...(Object.keys(LIBRARY_ICONS) as (keyof typeof LIBRARY_ICONS)[]).map((section) => ({
    to: `/library/${section}`,
    label: LIBRARY_SECTIONS[section].title,
    Icon: LIBRARY_ICONS[section],
  })),
  // Kept in this browser, not YouTube's, but it's about the library: it sits with it.
  { to: '/stats', label: 'Listening Stats', Icon: StatsIcon },
];

// A sidebar row; NavLink sets aria-current on the page's own row.
const item =
  'group flex h-9 items-center gap-2 mb-0.5 p-1 rounded-nav type-body-reduced text-primary hover:bg-quinary aria-[current=page]:bg-nav-selected';
// Apple's glyphs, drawn at 24px (their 24-unit box), which the user preferred to Apple's own 28px.
const icon = 'inline-grid size-6 flex-none place-items-center text-primary group-aria-[current=page]:text-key';
const navLabel = 'min-w-0 truncate';
// "Library", "Playlists" (report §1: 12px/15px 600, secondary, padding 4px 8px).
const sectionHeader = 'mt-4 px-2 py-1 type-callout-emphasized text-secondary';
const list = 'flex flex-col';

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate: () => void }) {
  return (
    <ul className={list}>
      {items.map(({ to, label, Icon }) => (
        <li key={to}>
          <PrefetchNavLink to={to} className={item} onClick={onNavigate}>
            <Icon size={24} className={icon} />
            <span className={navLabel}>{label}</span>
          </PrefetchNavLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * A playlist in the sidebar. While songs are dragged it lights up if they
 * can go into it, and dropping them there adds them all. Right-click pins it
 * to the top.
 */
function PlaylistNavItem({
  playlist,
  pinned,
  addable,
  onNavigate,
}: {
  playlist: MusicItem;
  pinned: boolean;
  addable: readonly { playlistId: string }[] | undefined;
  onNavigate: () => void;
}) {
  const pinMenu = usePinMenu(playlist);
  const drag = useSongDrag((s) => s.current);
  const add = useAddToPlaylist();
  const [over, setOver] = useState(false);
  const takes = drag !== null && acceptsDrop(playlist.id, addable);
  return (
    <li
      data-drop-target={takes || undefined}
      data-drop-over={(takes && over) || undefined}
      className="rounded-nav data-drop-target:outline-1 data-drop-target:outline-key/50 data-drop-target:-outline-offset-1 data-drop-over:bg-key/25"
      onContextMenu={pinMenu.onContextMenu}
      onDragEnter={(event) => takes && event.dataTransfer.types.includes(SONG_DRAG_TYPE) && setOver(true)}
      onDragOver={(event) => {
        if (!takes || !event.dataTransfer.types.includes(SONG_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setOver(false)}
      onDrop={(event) => {
        setOver(false);
        const raw = event.dataTransfer.getData(SONG_DRAG_TYPE);
        if (!takes || !raw) return;
        event.preventDefault();
        const videoIds = JSON.parse(raw) as string[];
        const label = drag?.label ?? `${videoIds.length} songs`;
        toastResult(
          add.mutateAsync({ playlistId: bareId(playlist.id), videoIds }),
          { message: `Added ${label} to ${playlist.title}`, action: { label: 'View', href: hrefFor(playlist) ?? '/library/playlists' } },
          `Couldn’t add to ${playlist.title}`,
        );
        useSongDrag.getState().end();
      }}
    >
      {pinMenu.menu}
      <PrefetchNavLink to={hrefFor(playlist) ?? '/library/playlists'} className={item} onClick={onNavigate}>
        <span className={icon}>
          <ListMusic size={17} strokeWidth={1.8} />
        </span>
        <span className={navLabel}>{playlist.title}</span>
        {pinned && <Pin size={12} strokeWidth={2.2} className="ms-auto flex-none rotate-45 text-key" aria-label="Pinned" />}
      </PrefetchNavLink>
    </li>
  );
}

/** Library and Playlists (report §1), once YouTube requests are made as the user. */
function LibraryNav({ onNavigate }: { onNavigate: () => void }) {
  const playlists = useLibraryPlaylists();
  const pinned = usePins((state) => state.pinned);
  // While songs are dragged: the playlists they can go into (yours), asked about the first of them.
  const dragged = useSongDrag((s) => s.current?.videoIds[0] ?? '');
  const addable = usePlaylistOptions(dragged, dragged !== '');
  return (
    <>
      <h2 className={sectionHeader}>Library</h2>
      <NavList items={LIBRARY} onNavigate={onNavigate} />
      <h2 className={sectionHeader}>Playlists</h2>
      <ul className={list}>
        <li>
          <PrefetchNavLink to="/library/playlists" className={item} onClick={onNavigate}>
            <AllPlaylistsIcon size={24} className={icon} />
            <span className={navLabel}>{LIBRARY_SECTIONS.playlists.title}</span>
          </PrefetchNavLink>
        </li>
        {pinnedFirst(playlists.data ?? [], pinned).map((playlist) => (
          <PlaylistNavItem key={playlist.id} playlist={playlist} pinned={pinned.includes(playlist.id)} addable={addable.data} onNavigate={onNavigate} />
        ))}
      </ul>
    </>
  );
}

/** Spotify's playlists, once the extension can read them as the user (prompt §7.1). */
function SpotifyNav({ onNavigate }: { onNavigate: () => void }) {
  const playlists = useSpotifyPlaylists();
  return (
    <>
      <h2 className={sectionHeader}>Spotify</h2>
      <ul className={list}>
        <li>
          <PrefetchNavLink to="/spotify" end className={item} onClick={onNavigate}>
            <AllPlaylistsIcon size={24} className={icon} />
            <span className={navLabel}>All Spotify Playlists</span>
          </PrefetchNavLink>
        </li>
        {playlists.data?.map((playlist) => (
          <li key={playlist.id}>
            <PrefetchNavLink to={`/spotify/playlist/${encodeURIComponent(playlist.id)}`} className={item} onClick={onNavigate}>
              <span className={icon}>
                <ListMusic size={17} strokeWidth={1.8} />
              </span>
              <span className={navLabel}>{playlist.name}</span>
            </PrefetchNavLink>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The left glass sidebar (report §1). */
export function Sidebar() {
  const drawerOpen = useUi((s) => s.drawerOpen);
  const setDrawerOpen = useUi((s) => s.setDrawerOpen);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const update = useExtensionUpdate();
  const signedIn = useSignedIn();
  const spotifySignedIn = useSpotifySignedIn();
  const close = () => setDrawerOpen(false);

  return (
    <>
      {/* Below 484px the sidebar is a drawer opened from the top bar's menu button. */}
      <nav
        className="absolute inset-y-0 left-0 z-(--z-web-chrome) flex w-(--web-navigation-width) flex-col glass-material max-sm:w-[min(300px,82vw)] max-sm:-translate-x-full max-sm:shadow-glass max-sm:transition-transform max-sm:duration-(--duration-panel) max-sm:ease-panel max-sm:data-[open=true]:translate-none"
        data-open={drawerOpen}
        aria-label="Main"
      >
        <div className="mt-2 ml-2 flex h-18 items-center px-5">
          <PrefetchLink to="/home" className="inline-flex items-center gap-2 rounded-[6px]" aria-label="BitChord, Home" onClick={close}>
            {/* White on dark, as Apple's own wordmark; it follows the label colour so it stays visible in light. */}
            <LogoMark size={22} className="text-primary" />
            <span className="type-[700_19px/24px] tracking-[-0.01em]">BitChord</span>
          </PrefetchLink>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-3 pl-5 [scrollbar-width:none]">
          <NavList items={PRIMARY} onNavigate={close} />
          <button
            type="button"
            className={`${item} w-full text-left`}
            onClick={() => {
              close();
              setPaletteOpen(true);
            }}
          >
            <span className={icon}>
              <Command size={17} strokeWidth={1.9} />
            </span>
            <span className={navLabel}>Quick Search</span>
            <kbd className="ml-auto rounded-[4px] border border-divider px-1 type-callout text-secondary max-sm:hidden">{isMac() ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
          {signedIn && <LibraryNav onNavigate={close} />}
          {spotifySignedIn && <SpotifyNav onNavigate={close} />}
        </div>
        <div className="flex flex-col gap-2 pt-3 pr-3 pb-5 pl-5">
          <PrefetchNavLink to="/extension" className={item} onClick={close}>
            {/* Chrome's own toolbar glyph for extensions (Material "extension"). */}
            <span className={icon}>
              <MdOutlineExtension size={18} />
            </span>
            <span className={navLabel}>BitChord Extension</span>
            {update.state === 'available' && (
              <span className="ml-auto rounded-[10px] bg-key px-[7px] py-0.5 type-subhead-emphasized text-white" title={`Version ${update.latest.version} is available`}>
                Update
              </span>
            )}
          </PrefetchNavLink>
          <AccountButton />
          <div className="flex items-center justify-between">
            <a className="inline-flex items-center gap-1 ps-1 type-callout text-primary hover:underline" href={config.androidAppUrl} target="_blank" rel="noreferrer">
              <span>Get the Android app</span>
              <ArrowUpRight size={14} strokeWidth={2} />
            </a>
            <PrefetchNavLink to="/settings" className="grid size-7 place-items-center rounded-nav text-secondary hover:bg-quinary hover:text-primary aria-[current=page]:bg-quinary aria-[current=page]:text-primary" aria-label="Settings" title="Settings" onClick={close}>
              <Settings size={17} strokeWidth={1.9} />
            </PrefetchNavLink>
          </div>
        </div>
      </nav>
      {drawerOpen && <div className="absolute inset-0 z-[calc(var(--z-web-chrome)-1)] hidden bg-scrim max-sm:block" onClick={close} aria-hidden="true" />}
    </>
  );
}
