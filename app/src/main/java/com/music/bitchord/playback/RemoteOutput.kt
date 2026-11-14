package com.music.bitchord.playback

/**
 * Silences this device while another one in a Listen Together session is the
 * speaker (Connect). The player keeps following the session — position, queue,
 * transport — so the notification, lock screen and app all work as a remote,
 * and the sound comes back instantly when it is moved here.
 *
 * Applied as a gain in [LoudnessProcessor], the last DSP stage, rather than on
 * `Player.volume`, which the crossfade owns and rewrites at every transition.
 */
object RemoteOutput {
    @Volatile
    var silenced: Boolean = false
}
