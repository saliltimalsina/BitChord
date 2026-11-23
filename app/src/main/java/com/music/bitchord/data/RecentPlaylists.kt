package com.music.bitchord.data

import android.content.Context
import android.content.SharedPreferences
import com.music.bitchord.data.model.ShelfItem
import com.music.bitchord.data.model.UserPlaylist
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * Home's Recent playlists: the playlists and albums songs were last played
 * out of, newest first. Two lists, merged ([merge]):
 *
 *  - the account's Library › Recently played, the same on every signed-in
 *    device (this phone, the web app, YouTube Music itself). Plays land there
 *    because their history entry names the list (PlaybackTracker); read by
 *    [PlayedListsSync];
 *  - this device's own, which moves a list up the moment it starts playing,
 *    before YouTube has caught up, and keeps what YouTube can't know about:
 *    downloaded and Spotify playlists, lists not in the library.
 */
object RecentPlaylists {

    @Serializable
    data class Entry(
        val browseId: String,
        val title: String,
        val subtitle: String,
        val thumbnailUrl: String?,
        /** When it started playing here (ms); 0 on entries saved before it was kept, and on the account's. */
        val playedAt: Long = 0,
    )

    @Serializable
    data class Account(val items: List<Entry>, val fetchedAt: Long)

    private const val PREFS_NAME = "recent_playlists"
    // "played": the row once counted lists merely opened, under "entries".
    private const val KEY = "played"
    private const val ACCOUNT_KEY = "account"
    private const val LIKED_MUSIC = "LM"
    const val LIMIT = 20

    private lateinit var prefs: SharedPreferences
    private val json = Json { ignoreUnknownKeys = true }
    private val serializer = ListSerializer(Entry.serializer())

    private var local: List<Entry> = emptyList()
    private var account: Account? = null

    private val _items = MutableStateFlow<List<ShelfItem>>(emptyList())
    /** The merged row. */
    val items: StateFlow<List<ShelfItem>> = _items.asStateFlow()

    /** The account's playlists, for finding a Spotify playlist's YouTube copy. */
    @Volatile
    private var library: List<UserPlaylist> = emptyList()

    fun init(context: Context) {
        prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        local = prefs.getString(KEY, null)
            ?.let { runCatching { json.decodeFromString(serializer, it) }.getOrNull() }
            .orEmpty()
        account = prefs.getString(ACCOUNT_KEY, null)
            ?.let { runCatching { json.decodeFromString(Account.serializer(), it) }.getOrNull() }
        publish()
    }

    /** [browseId] just started playing here: to the front, once. */
    @Synchronized
    fun remember(browseId: String, title: String, subtitle: String, thumbnailUrl: String?) {
        if (!::prefs.isInitialized || title.isBlank()) return
        val previous = _items.value.firstOrNull { keyOf(it.browseId.orEmpty()) == keyOf(browseId) }
        val entry = Entry(
            browseId = browseId,
            title = title,
            subtitle = subtitle.ifBlank { previous?.subtitle.orEmpty() },
            // A page opened from a link carries no artwork; keep what it had.
            thumbnailUrl = thumbnailUrl ?: previous?.thumbnailUrl,
            playedAt = System.currentTimeMillis(),
        )
        local = (listOf(entry) + local.filterNot { keyOf(it.browseId) == keyOf(browseId) }).take(LIMIT)
        saveLocal()
        publish()
    }

    /** A deleted playlist leaves the row too. */
    @Synchronized
    fun forget(browseId: String) {
        if (!::prefs.isInitialized) return
        local = local.filterNot { keyOf(it.browseId) == keyOf(browseId) }
        account = account?.let { a -> a.copy(items = a.items.filterNot { keyOf(it.browseId) == keyOf(browseId) }) }
        saveLocal()
        saveAccount()
        publish()
    }

    /** The account's Recently played, read at [fetchedAt]; null when signed out. */
    @Synchronized
    fun setAccount(items: List<ShelfItem>?, fetchedAt: Long) {
        if (!::prefs.isInitialized) return
        account = items?.mapNotNull { item ->
            item.browseId?.let { Entry(it, item.title, item.subtitle, item.thumbnailUrl) }
        }?.let { Account(it, fetchedAt) }
        saveAccount()
        publish()
    }

    fun setLibraryPlaylists(playlists: List<UserPlaylist>) {
        library = playlists
    }

    /**
     * The YouTube Music copy of a Spotify playlist (the web's Spotify › Replace
     * makes them under the same name). Only an unambiguous match: one library
     * playlist of exactly that name.
     */
    fun youtubeCopyOf(title: String?): UserPlaylist? {
        val name = title?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
        return library.filter { it.title.trim().lowercase() == name }.singleOrNull()
    }

    /** One list, however it is spelled: a playlist's page is VLPL…, its list PL…. */
    fun keyOf(browseId: String): String = browseId.removePrefix("VL")

    /**
     * What the row shows: lists played here since the account was last read (it
     * may not have them yet), then the account's order, then the rest of this
     * device's, which YouTube doesn't list. Liked Music is left out: YouTube
     * keeps it first for good, so it would never move.
     */
    fun merge(local: List<Entry>, account: Account?): List<Entry> {
        if (account == null) return local.take(LIMIT)
        val fresh = local.filter { it.playedAt > account.fetchedAt }
        val fromAccount = account.items.associateBy { keyOf(it.browseId) }
        val seen = HashSet<String>()
        val out = ArrayList<Entry>()
        for (entry in fresh + account.items + local) {
            val key = keyOf(entry.browseId)
            if (key == LIKED_MUSIC || !seen.add(key)) continue
            // The account's entry, for its current title and artwork, at this device's place for it.
            val current = fromAccount[key]
            out += if (current != null && current !== entry) {
                entry.copy(
                    title = current.title,
                    subtitle = current.subtitle,
                    thumbnailUrl = current.thumbnailUrl ?: entry.thumbnailUrl,
                )
            } else {
                entry
            }
        }
        return out.take(LIMIT)
    }

    private fun publish() {
        _items.value = merge(local, account).map {
            ShelfItem(it.title, it.subtitle, it.thumbnailUrl, videoId = null, browseId = it.browseId)
        }
    }

    private fun saveLocal() {
        runCatching { json.encodeToString(serializer, local) }.getOrNull()
            ?.let { prefs.edit().putString(KEY, it).apply() }
    }

    private fun saveAccount() {
        val value = account ?: return prefs.edit().remove(ACCOUNT_KEY).apply()
        runCatching { json.encodeToString(Account.serializer(), value) }.getOrNull()
            ?.let { prefs.edit().putString(ACCOUNT_KEY, it).apply() }
    }
}
