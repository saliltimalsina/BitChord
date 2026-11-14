package com.music.bitchord.playback

import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import com.music.bitchord.data.listentogether.ListenTogether
import com.music.bitchord.playback.cast.CastSink
import com.music.bitchord.playback.cast.RemoteSpeaker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Another device in this phone's Listen Together session as the speaker —
 * Spotify Connect, in the same model as Cast and the watch: this phone's player
 * keeps the queue and is held paused (silent, holding no audio, taking nothing
 * off whatever else is playing), while the session owns the clock. The session
 * player reports this in place of the paused local player, so the app, the
 * notification and the lock screen all show the laptop's song moving along,
 * and their play, pause and seek reach the laptop.
 *
 * Track changes are not handled here: a skip or a tap on a song moves this
 * phone's queue, and [PartySync] publishes that like any other change.
 */
class PartySpeaker(scope: CoroutineScope) : RemoteSpeaker {

    override var sink: CastSink? = null

    private val party get() = ListenTogether.state.value
    private var wasActive = false

    init {
        scope.launch {
            ListenTogether.state
                .map { Triple(it.outputElsewhere, it.playback.seq, it.playback.track?.videoId) }
                .distinctUntilChanged()
                .collect { (active) ->
                    if (active != wasActive) {
                        wasActive = active
                        sink?.onRemoteRouteChanged()
                    }
                    sink?.onRemotePlaybackChanged()
                }
        }
    }

    override val active: Boolean get() = party.outputElsewhere
    override val playWhenReady: Boolean get() = active && party.playback.isPlaying
    override val isPlaying: Boolean get() = playWhenReady
    override val playbackState: Int
        get() = if (party.playback.track != null) Player.STATE_READY else Player.STATE_IDLE
    override val positionMs: Long
        get() = ListenTogether.partyPositionMs() ?: party.playback.positionMs
    override val durationMs: Long get() = party.playback.track?.durationMs ?: C.TIME_UNSET
    override val deviceVolume: Int = 100

    override fun play() = ListenTogether.play()
    override fun pause() = ListenTogether.pause(positionMs)
    override fun seekTo(positionMs: Long) = ListenTogether.seek(positionMs.coerceAtLeast(0L))

    /** The speaker's volume is its own; this phone has nothing to set. */
    override fun setVolume(fraction: Float) = Unit

    override fun onLocalTransition(item: MediaItem?, reason: Int) = Unit
    override fun onLocalQueueChanged() = Unit
    override fun onLocalRepeatChanged(repeatMode: Int) = Unit

    /** Nothing on a remote may make sound: whatever started the local player is put back. */
    override fun onLocalStartedPlaying(player: Player) {
        if (active) player.pause()
    }
}
