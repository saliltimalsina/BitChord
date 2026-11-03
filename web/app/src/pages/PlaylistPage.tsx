import { Pencil } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { DetailHeader, detailButton } from '@/components/music/DetailHeader';
import { EditPlaylistDialog } from '@/components/music/EditPlaylistDialog';
import { playList, shuffleList } from '@/components/music/play';
import { useCompactView, usePlaylistSort } from '@/components/music/playlistPrefs';
import { PlaylistToolbar } from '@/components/music/PlaylistToolbar';
import { filterTracks, sortTracks } from '@/components/music/playlistView';
import { LoadError, LoadMoreError, NeedsExtension } from '@/components/music/States';
import { TrackList } from '@/components/music/TrackList';
import { useMovePlaylistItem, usePlaylist, useRemoveFromPlaylist, useSignedIn, useYouTubeReady } from '@/data/music/queries';
import { useArtworkColor } from '@/lib/artworkColor';
import { usePageTint } from '@/lib/usePageTint';
import { useRememberRecent } from '@/state/recents';
import { PlaylistSkeleton } from '@/skeletons/PageSkeletons';
import { toast, toastResult } from '@/state/toasts';
import { detailFooter } from './pageStyles';

/** A playlist (report §14): header, then the artwork track list, loading on as you scroll. */
export default function PlaylistPage() {
  const id = decodeURIComponent(useParams().id ?? '');
  const { missing } = useYouTubeReady();
  const playlist = usePlaylist(id);
  const header = playlist.data?.pages[0]?.header ?? null;
  const signedIn = useSignedIn();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const removeTrack = useRemoveFromPlaylist();
  const moveTrack = useMovePlaylistItem();
  usePageTint(useArtworkColor(header?.thumbnail));
  useRememberRecent(
    header && {
      kind: 'playlist',
      id,
      title: header.title,
      subtitle: ['Playlist', header.artists.map((a) => a.name).join(', '), [header.subtitle, header.meta].join(' • ').split(' • ').find((part) => /\b(tracks?|songs?|episodes?)\b/i.test(part))].filter(Boolean).join(' • '),
      thumbnail: header.thumbnail,
    },
  );

  const [query, setQuery] = useState('');
  const [sort, setSort] = usePlaylistSort(id);
  const [compact, setCompact] = useCompactView();
  // Finding or sorting is over the whole playlist: load the rest of it.
  const wantsAll = query.trim() !== '' || sort !== 'custom';

  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = playlist;
  const onNearEnd = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);
  useEffect(() => {
    if (wantsAll) onNearEnd();
  }, [wantsAll, onNearEnd]);

  const all = useMemo(() => playlist.data?.pages.flatMap((page) => page.tracks) ?? [], [playlist.data]);
  const sorted = useMemo(() => sortTracks(all, sort), [all, sort]);
  const shown = useMemo(() => filterTracks(sorted, query), [sorted, query]);

  if (missing) return <NeedsExtension />;
  if (playlist.isError && !playlist.data) return <LoadError error={playlist.error} onRetry={() => void playlist.refetch()} />;
  if (!playlist.data || !header) return <PlaylistSkeleton />;

  const context = { source: { title: header.title, type: 'playlist' as const, id } };
  // Only the user's own playlists: YouTube marks them with its editable header.
  const editable = signedIn && header.editable;
  return (
    <>
      <DetailHeader
        info={header}
        canPlay={sorted.length > 0}
        onPlay={() => playList(sorted, 0, context)}
        onShuffle={() => shuffleList(sorted, context)}
        extra={
          editable && (
            <button className={detailButton.circle} aria-label="Edit playlist" title="Edit playlist" onClick={() => setEditing(true)}>
              <Pencil size={16} strokeWidth={2.2} />
            </button>
          )
        }
      />
      {all.length > 0 && (
        <PlaylistToolbar query={query} onQuery={setQuery} sort={sort} onSort={setSort} compact={compact} onCompact={setCompact} />
      )}
      <TrackList
        tracks={shown}
        variant="playlist"
        onNearEnd={wantsAll ? undefined : onNearEnd}
        source={context.source}
        compact={compact}
        onRemove={
          editable
            ? (track) => toastResult(removeTrack.mutateAsync({ playlistId: id, videoId: track.videoId }), `Removed from ${header.title}`, 'Couldn’t remove the song')
            : undefined
        }
        // Rows sorted or filtered aren't at their places in the playlist: dragging is for its own order.
        onMove={
          editable && !wantsAll
            ? (from, to) =>
                moveTrack.mutateAsync({ playlistId: id, videoId: all[from]!.videoId, from, to }).catch(() => toast('Couldn’t save the new order', { error: true }))
            : undefined
        }
      />
      {query.trim() && !shown.length && !hasNextPage && (
        <p className="py-10 text-center type-body text-secondary">No songs match “{query.trim()}”.</p>
      )}
      {editing && (
        <EditPlaylistDialog
          playlistId={id}
          info={header}
          onClose={() => setEditing(false)}
          onDeleted={() => {
            setEditing(false);
            navigate('/library/playlists');
          }}
        />
      )}
      {isFetchingNextPage && (
        <div className="flex justify-center py-5 type-callout text-secondary">{wantsAll ? 'Loading the rest of the playlist…' : 'Loading more songs…'}</div>
      )}
      {playlist.isFetchNextPageError && <LoadMoreError onRetry={() => void fetchNextPage()} />}
      <footer className={detailFooter}>
        <p>{header.meta}</p>
      </footer>
    </>
  );
}
