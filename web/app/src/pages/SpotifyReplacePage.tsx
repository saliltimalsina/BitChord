import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { NeedsExtension, stateStyles } from '@/components/music/States';
import { useSignedIn } from '@/data/music/queries';
import { planMirror, runMirror, type CopyResult, type MirrorPlan, type MirrorProgress } from '@/data/spotify/mirror';
import { useExtension } from '@/extension/useExtension';
import { useSpotifySignedIn } from '@/extension/useSpotifyAuth';

type Step =
  | { kind: 'idle' }
  | { kind: 'planning' }
  | { kind: 'review'; plan: MirrorPlan }
  | { kind: 'running'; plan: MirrorPlan; progress: MirrorProgress | null }
  | { kind: 'done'; copies: CopyResult[]; deleted: number }
  | { kind: 'failed'; message: string; ranCopies: boolean };

const CONFIRM_WORD = 'DELETE';
const section = 'mx-(--body-gutter) mt-6 max-w-[720px]';
const heading = 'type-title-3-emphasized';
const list = 'mt-2 max-h-[280px] overflow-y-auto rounded-xl bg-quinary px-4 py-2 type-body';
const row = 'flex justify-between gap-4 py-1';
const muted = 'type-callout text-secondary';
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Settings' "Replace with Spotify": the YouTube Music account's own playlists
 * swapped for copies of every Spotify playlist. Shows exactly what goes and
 * what comes before anything happens, and asks for DELETE typed out.
 */
export default function SpotifyReplacePage() {
  const extension = useExtension();
  const signedIn = useSignedIn();
  const spotifySignedIn = useSpotifySignedIn();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [confirm, setConfirm] = useState('');

  if (extension.state === 'missing') return <NeedsExtension what="your Spotify playlists" />;
  if (!signedIn || !spotifySignedIn) {
    return (
      <>
        <PageHeader title="Replace with Spotify" />
        <div className={stateStyles.state}>
          <p className={stateStyles.title}>Sign in to both first</p>
          <p className={stateStyles.detail}>This needs YouTube Music signed in and Spotify connected through the extension.</p>
        </div>
      </>
    );
  }

  const review = async () => {
    setStep({ kind: 'planning' });
    try {
      setStep({ kind: 'review', plan: await planMirror() });
    } catch (e) {
      setStep({ kind: 'failed', message: errorText(e), ranCopies: false });
    }
  };

  const run = async (plan: MirrorPlan) => {
    setStep({ kind: 'running', plan, progress: null });
    try {
      const result = await runMirror(plan, (progress) => setStep({ kind: 'running', plan, progress }));
      setStep({ kind: 'done', ...result });
    } catch (e) {
      setStep({ kind: 'failed', message: errorText(e), ranCopies: true });
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['music', 'library'] });
    }
  };

  return (
    <>
      <PageHeader title="Replace with Spotify" />
      <p className={`${section} type-body-tall text-secondary`}>
        Makes a private YouTube Music playlist for every playlist in your Spotify library, matched song by song (the song,
        else the artist’s own video; anything YouTube Music doesn’t have is left out). Then it deletes the playlists you
        own on YouTube Music. Liked Music, YouTube’s mixes and playlists saved from other people are kept. Copies are made
        first, so nothing is deleted if a copy fails.
      </p>

      {step.kind === 'idle' && (
        <div className={section}>
          <button className={stateStyles.button} onClick={() => void review()}>
            Review what changes
          </button>
        </div>
      )}

      {step.kind === 'planning' && <p className={`${section} ${muted}`}>Reading both libraries…</p>}

      {step.kind === 'review' && (
        <>
          <div className={section}>
            <h2 className={heading}>Copy from Spotify ({step.plan.toCopy.length})</h2>
            <ul className={list}>
              {step.plan.toCopy.map((p) => (
                <li key={p.id} className={row}>
                  <span className="truncate">{p.name}</span>
                  <span className={muted}>{p.owner ?? ''}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={section}>
            <h2 className={heading}>Delete from YouTube Music ({step.plan.toDelete.length})</h2>
            {step.plan.toDelete.length ? (
              <ul className={list}>
                {step.plan.toDelete.map((p) => (
                  <li key={p.id} className={row}>
                    <span className="truncate">{p.title}</span>
                    <span className={muted}>{p.subtitle}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={muted}>None: you own no playlists there.</p>
            )}
          </div>
          <div className={`${section} flex flex-wrap items-center gap-3`}>
            <input
              className="h-8 w-40 rounded-pill border-0 bg-quinary px-3 type-body text-primary outline-none placeholder:text-tertiary focus:bg-quaternary"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={`Type ${CONFIRM_WORD}`}
              aria-label={`Type ${CONFIRM_WORD} to confirm`}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              className={`${stateStyles.button} mt-0 disabled:opacity-40`}
              disabled={confirm.trim() !== CONFIRM_WORD || !step.plan.toCopy.length}
              onClick={() => void run(step.plan)}
            >
              Copy {step.plan.toCopy.length} and delete {step.plan.toDelete.length}
            </button>
          </div>
        </>
      )}

      {step.kind === 'running' && (
        <div className={section}>
          <p className="type-body-emphasized">
            {!step.progress
              ? 'Starting…'
              : step.progress.stage === 'copying'
                ? `Copying ${step.progress.index + 1} of ${step.progress.of}: ${step.progress.name}`
                : `Deleting ${step.progress.index + 1} of ${step.progress.of}: ${step.progress.name}`}
          </p>
          {step.progress?.stage === 'copying' && step.progress.total > 0 && (
            <p className={muted}>
              Matched {step.progress.matched} of {step.progress.total} songs
            </p>
          )}
          <p className={`${muted} mt-2`}>Keep this tab open until it finishes.</p>
        </div>
      )}

      {step.kind === 'done' && (
        <div className={section}>
          <h2 className={heading}>
            Done: {step.copies.filter((c) => c.createdId).length} playlists copied, {step.deleted} deleted
          </h2>
          <ul className={list}>
            {step.copies.map((c) => (
              <li key={c.playlist.id} className="py-1">
                <div className={row}>
                  <span className="truncate">{c.playlist.name}</span>
                  <span className={muted}>{c.createdId ? `${c.copied} of ${c.total} songs` : 'nothing found, not made'}</span>
                </div>
                {c.missing.length > 0 && (
                  <details className={muted}>
                    <summary className="cursor-pointer">{c.missing.length} not on YouTube Music</summary>
                    <ul className="ms-4 list-disc">
                      {c.missing.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {step.kind === 'failed' && (
        <div className={section}>
          <p className="type-body-emphasized">Stopped: {step.message}</p>
          <p className={muted}>
            {step.ranCopies
              ? 'Nothing was deleted unless every copy had been made. Copies already made are in your library.'
              : 'Nothing was changed.'}
          </p>
          <button className={stateStyles.button} onClick={() => setStep({ kind: 'idle' })}>
            Start over
          </button>
        </div>
      )}
    </>
  );
}
