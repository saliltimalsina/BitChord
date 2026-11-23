import { PageHeader } from '@/components/PageHeader';
import { ItemShelf } from '@/components/music/ShelfView';
import { EmptyState } from '@/components/music/States';
import { LIBRARY_SECTIONS } from '@/data/music/library';
import { useLibraryPlaylists, useSignedIn } from '@/data/music/queries';
import { spotifyPlaylistItem } from '@/data/spotify/api';
import { useSpotifyPlaylists } from '@/data/spotify/queries';
import { useSpotifySignedIn } from '@/extension/useSpotifyAuth';

/** How many cards a section row shows before View all. */
const ROW = 12;

/**
 * The library at a glance, as the phone's Library tab: one row per place
 * your playlists live (YouTube Music, Spotify), each with View all onto its
 * own page, which has search and sort.
 */
export default function LibraryHomePage() {
  const signedIn = useSignedIn();
  const spotifySignedIn = useSpotifySignedIn();
  const playlists = useLibraryPlaylists();
  const spotify = useSpotifyPlaylists();
  const own = playlists.data ?? [];
  const fromSpotify = (spotify.data ?? []).map(spotifyPlaylistItem);

  return (
    <>
      <PageHeader title="Library" />
      {signedIn && own.length > 0 && (
        <ItemShelf title={LIBRARY_SECTIONS.playlists.title.replace(/^All /, '')} to="/library/playlists" items={own.slice(0, ROW)} viewAll />
      )}
      {spotifySignedIn && fromSpotify.length > 0 && <ItemShelf title="Spotify" to="/spotify" items={fromSpotify.slice(0, ROW)} viewAll />}
      {!signedIn && !spotifySignedIn && (
        <EmptyState title="Nothing here yet" detail="Sign in to YouTube Music, or connect Spotify through the extension, to see your playlists here." />
      )}
    </>
  );
}
