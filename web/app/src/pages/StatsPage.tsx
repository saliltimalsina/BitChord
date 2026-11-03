import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { PrefetchLink } from '@/components/PrefetchLink';
import { Artwork } from '@/components/music/Artwork';
import { artistHref } from '@/components/music/links';
import { playList } from '@/components/music/play';
import { EmptyState } from '@/components/music/States';
import { clearPlays, LISTEN_QUERY_KEY, readPlays } from '@/playback/listenLog';
import { STATS_RANGES, summarize, type SongStat, type StatsRange } from '@/playback/listenStats';
import type { Track } from '@/data/music/types';

const TOP = 50;
const TOP_ARTISTS = 12;

const tile = 'flex flex-col gap-0.5 rounded-[12px] bg-quinary px-4 py-3';
const tileValue = 'type-title-1-emphasized text-primary tabular-nums';
const tileLabel = 'type-callout text-secondary';
const segment =
  'rounded-pill px-3.5 py-1 type-callout-emphasized text-secondary hover:text-primary aria-pressed:bg-quaternary aria-pressed:text-primary';

const asTrack = (song: SongStat): Track => ({ ...song.track, index: null, plays: null });
const playsLabel = (n: number) => (n === 1 ? '1 play' : `${n.toLocaleString()} plays`);
const minutesLabel = (ms: number) => `${Math.max(1, Math.round(ms / 60_000)).toLocaleString()} min`;

/**
 * Listening Stats, a Wrapped you can open any day: minutes listened, top
 * artists and top songs over the last 4 weeks, 6 months or all time. Built
 * from the plays this browser has kept (playback/listenLog.ts).
 */
export default function StatsPage() {
  const [range, setRange] = useState<StatsRange>('month');
  const [confirming, setConfirming] = useState(false);
  const plays = useQuery({ queryKey: LISTEN_QUERY_KEY, queryFn: readPlays, staleTime: 30_000 });
  const stats = useMemo(() => summarize(plays.data ?? [], range, Date.now()), [plays.data, range]);
  const songs = stats.songs.slice(0, TOP);
  const tracks = songs.map(asTrack);
  const source = { title: `Your Top Songs · ${STATS_RANGES.find((r) => r.value === range)!.label}`, type: 'other' as const };

  return (
    <>
      <PageHeader title="Listening Stats" />
      <div className="mx-(--body-gutter) mb-12 flex flex-col gap-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-pill bg-quinary p-1" role="group" aria-label="Time range">
            {STATS_RANGES.map((option) => (
              <button key={option.value} className={segment} aria-pressed={range === option.value} onClick={() => setRange(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
          <p className="type-callout text-secondary">Kept in this browser only. A song counts after 30 seconds.</p>
        </div>

        {plays.data && !stats.plays && (
          <EmptyState title="Nothing here yet" detail="Songs you play for at least 30 seconds show up here, with your top artists and minutes listened." />
        )}

        {stats.plays > 0 && (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
              <div className={tile}>
                <span className={tileValue}>{stats.minutes.toLocaleString()}</span>
                <span className={tileLabel}>Minutes listened</span>
              </div>
              <div className={tile}>
                <span className={tileValue}>{stats.plays.toLocaleString()}</span>
                <span className={tileLabel}>Plays</span>
              </div>
              <div className={tile}>
                <span className={tileValue}>{stats.songs.length.toLocaleString()}</span>
                <span className={tileLabel}>Songs</span>
              </div>
              <div className={tile}>
                <span className={tileValue}>{stats.artists.length.toLocaleString()}</span>
                <span className={tileLabel}>Artists</span>
              </div>
            </div>

            <section aria-label="Top Artists">
              <h2 className="mb-3 type-title-2-emphasized">Top Artists</h2>
              <ol className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-x-4 gap-y-5">
                {stats.artists.slice(0, TOP_ARTISTS).map((stat, i) => {
                  const href = artistHref(stat.artist.id);
                  const body = (
                    <>
                      <Artwork src={stat.thumbnail} displayWidth={130} radius="50%" />
                      <span className="mt-2 block truncate text-center type-body text-primary">
                        {i + 1}. {stat.artist.name}
                      </span>
                      <span className="block truncate text-center type-callout text-secondary">{playsLabel(stat.plays)}</span>
                    </>
                  );
                  return (
                    <li key={stat.artist.id ?? stat.artist.name}>{href ? <PrefetchLink to={href} className="group block hover:[&_span:first-of-type]:underline">{body}</PrefetchLink> : body}</li>
                  );
                })}
              </ol>
            </section>

            <section aria-label="Top Songs">
              <h2 className="mb-2 type-title-2-emphasized">Top Songs</h2>
              <ol>
                {songs.map((song, i) => (
                  <li key={song.track.videoId}>
                    <button
                      className="grid w-full grid-cols-[28px_40px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] px-2 py-1.5 text-start hover:bg-tracklist-hover"
                      onClick={() => playList(tracks, i, { source })}
                      aria-label={`Play ${song.track.title}`}
                    >
                      <span className="text-center type-body text-secondary tabular-nums">{i + 1}</span>
                      <Artwork src={song.track.thumbnail} displayWidth={40} radius="var(--radius-artwork-small)" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate type-body text-primary">{song.track.title}</span>
                        <span className="truncate type-callout text-secondary">{song.track.artists.map((a) => a.name).join(', ')}</span>
                      </span>
                      <span className="type-callout text-secondary tabular-nums">
                        {playsLabel(song.plays)} · {minutesLabel(song.ms)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}

        {(plays.data?.length ?? 0) > 0 && (
          <div className="flex items-center gap-3">
            {confirming ? (
              <>
                <button
                  className="inline-flex items-center gap-1.5 rounded-pill bg-[#ff453a] px-3.5 py-1.5 type-callout-emphasized text-white hover:brightness-110"
                  onClick={() => void clearPlays().then(() => setConfirming(false))}
                >
                  <Trash2 size={14} /> Clear All Stats
                </button>
                <button className="type-callout-emphasized text-secondary hover:text-primary" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="type-callout-emphasized text-destructive hover:underline" onClick={() => setConfirming(true)}>
                Clear Stats…
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
