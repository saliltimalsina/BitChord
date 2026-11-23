package com.music.bitchord.data

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.music.bitchord.data.innertube.Innertube
import com.music.bitchord.data.innertube.PlaybackTracker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Keeps [RecentPlaylists]' account half current: the account's Library ›
 * Recently played is read when the app comes to the front, every [POLL_MS]
 * while it stays there, and shortly after each play is registered. So a list
 * played on the web app shows here within a minute, and one played here is
 * confirmed by the account a few seconds after it starts.
 */
object PlayedListsSync {

    /** While in front: often enough that a play elsewhere shows within a minute. */
    private const val POLL_MS = 45_000L
    /** After a play is registered: YouTube takes a moment to file it. */
    private const val AFTER_PLAY_MS = 4_000L

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lock = Mutex()
    private var polling: Job? = null
    private var afterPlay: Job? = null

    fun start() {
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) {
                polling?.cancel()
                polling = scope.launch {
                    while (isActive) {
                        refresh()
                        delay(POLL_MS)
                    }
                }
            }

            override fun onStop(owner: LifecycleOwner) {
                polling?.cancel()
                polling = null
            }
        })
        scope.launch {
            // drop(1): the current value is just the count so far, not a play.
            PlaybackTracker.registeredPlays.drop(1).collect {
                afterPlay?.cancel()
                afterPlay = scope.launch {
                    delay(AFTER_PLAY_MS)
                    refresh()
                }
            }
        }
    }

    /** Reads the account again. Signed out, it is dropped: the row is this device's alone. */
    suspend fun refresh() {
        if (lock.isLocked) return
        lock.withLock {
            if (Innertube.cookie == null) {
                RecentPlaylists.setAccount(null, 0)
                return
            }
            val startedAt = System.currentTimeMillis()
            // Offline, or YouTube said no: keep what the row had.
            YtMusicRepository.playedLists().onSuccess { RecentPlaylists.setAccount(it, startedAt) }
        }
    }
}
