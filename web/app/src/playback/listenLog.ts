import { queryClient } from '@/lib/queryClient';
import { getPlayhead, usePlayer } from '@/state/player';
import { COUNTS_AFTER_MS, type Play } from './listenStats';

/**
 * The plays Stats is built from, kept in this browser's IndexedDB and never
 * sent anywhere. A play is saved once 30 s of it have been heard; a song
 * started again from the top (a replay, Repeat One) is a new play.
 */

const DB = 'bitchord-listening';
const STORE = 'plays';
export const LISTEN_QUERY_KEY = ['listening', 'plays'] as const;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export function readPlays(): Promise<Play[]> {
  return run('readonly', (store) => store.getAll() as IDBRequest<Play[]>);
}

export async function clearPlays(): Promise<void> {
  await run('readwrite', (store) => store.clear());
  void queryClient.invalidateQueries({ queryKey: LISTEN_QUERY_KEY });
}

async function save(play: Play): Promise<void> {
  await run('readwrite', (store) => store.add(play));
  void queryClient.invalidateQueries({ queryKey: LISTEN_QUERY_KEY });
}

interface Session {
  entryId: string;
  play: Play;
  /** Where the playhead was at the last tick, to see a song start over. */
  lastSec: number;
}

const TICK_MS = 1_000;
/** A playhead that jumps back to within this of the start, from past the count, began again. */
const RESTART_SEC = 3;

/** Starts keeping plays; returns the stop function (an effect's cleanup). */
export function startListenLog(): () => void {
  let session: Session | null = null;
  let lastTick = Date.now();

  const flush = () => {
    if (session && session.play.ms >= COUNTS_AFTER_MS) void save(session.play).catch(() => undefined);
    session = null;
  };

  const tick = () => {
    const now = Date.now();
    const elapsed = Math.min(now - lastTick, TICK_MS * 3);
    lastTick = now;
    const { queue, index, status } = usePlayer.getState();
    const entry = queue[index];
    if (!entry) return flush();
    const sec = getPlayhead()?.sec ?? 0;
    const startedOver = session?.entryId === entry.entryId && session.lastSec - sec > RESTART_SEC && sec < RESTART_SEC && session.play.ms >= COUNTS_AFTER_MS;
    if (session?.entryId !== entry.entryId || startedOver) {
      flush();
      const { videoId, title, artists, album, thumbnail, durationSec, explicit } = entry.track;
      session = { entryId: entry.entryId, play: { at: now, ms: 0, track: { videoId, title, artists, album, thumbnail, durationSec, explicit } }, lastSec: sec };
    }
    if (status === 'playing') session!.play.ms += elapsed;
    session!.lastSec = sec;
  };

  const timer = window.setInterval(tick, TICK_MS);
  window.addEventListener('pagehide', flush);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('pagehide', flush);
    flush();
  };
}
