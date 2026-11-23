package com.music.bitchord.data

import android.content.Context
import android.content.SharedPreferences
import com.music.bitchord.data.model.ShelfItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * The playlists and albums most recently opened on this device, newest first:
 * YouTube Music's, Spotify's, downloaded ones alike. Home's Recent playlists
 * row. Kept on the device only; YouTube's own history knows songs, not lists.
 */
object RecentPlaylists {

    @Serializable
    private data class Entry(val browseId: String, val title: String, val subtitle: String, val thumbnailUrl: String?)

    private const val PREFS_NAME = "recent_playlists"
    private const val KEY = "entries"
    const val LIMIT = 20

    private lateinit var prefs: SharedPreferences
    private val json = Json { ignoreUnknownKeys = true }
    private val serializer = ListSerializer(Entry.serializer())
    private val _items = MutableStateFlow<List<ShelfItem>>(emptyList())
    val items: StateFlow<List<ShelfItem>> = _items.asStateFlow()

    fun init(context: Context) {
        prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val stored = prefs.getString(KEY, null)
            ?.let { runCatching { json.decodeFromString(serializer, it) }.getOrNull() }
            .orEmpty()
        _items.value = stored.map { it.toItem() }
    }

    /** [browseId] was just opened: to the front, once. */
    fun remember(browseId: String, title: String, subtitle: String, thumbnailUrl: String?) {
        if (!::prefs.isInitialized || title.isBlank()) return
        val previous = _items.value.firstOrNull { it.browseId == browseId }
        val entry = ShelfItem(
            title = title,
            subtitle = subtitle.ifBlank { previous?.subtitle.orEmpty() },
            // A page opened from a link carries no artwork; keep what it had.
            thumbnailUrl = thumbnailUrl ?: previous?.thumbnailUrl,
            videoId = null,
            browseId = browseId,
        )
        val next = (listOf(entry) + _items.value.filterNot { it.browseId == browseId }).take(LIMIT)
        _items.value = next
        val encoded = runCatching {
            json.encodeToString(serializer, next.map { Entry(it.browseId!!, it.title, it.subtitle, it.thumbnailUrl) })
        }.getOrNull() ?: return
        prefs.edit().putString(KEY, encoded).apply()
    }

    /** A deleted playlist leaves the row too. */
    fun forget(browseId: String) {
        if (!::prefs.isInitialized || _items.value.none { it.browseId == browseId }) return
        val next = _items.value.filterNot { it.browseId == browseId }
        _items.value = next
        val encoded = runCatching {
            json.encodeToString(serializer, next.map { Entry(it.browseId!!, it.title, it.subtitle, it.thumbnailUrl) })
        }.getOrNull() ?: return
        prefs.edit().putString(KEY, encoded).apply()
    }

    private fun Entry.toItem() = ShelfItem(title, subtitle, thumbnailUrl, videoId = null, browseId = browseId)
}
