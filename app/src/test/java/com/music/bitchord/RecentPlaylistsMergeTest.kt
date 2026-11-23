package com.music.bitchord

import com.music.bitchord.data.RecentPlaylists
import com.music.bitchord.data.RecentPlaylists.Account
import com.music.bitchord.data.RecentPlaylists.Entry
import com.music.bitchord.data.innertube.Innertube
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RecentPlaylistsMergeTest {

    private fun entry(id: String, playedAt: Long = 0, title: String = id) = Entry(id, title, "", null, playedAt)

    @Test
    fun `without the account the row is this device's`() {
        assertEquals(listOf("a"), RecentPlaylists.merge(listOf(entry("a")), null).map { it.browseId })
    }

    @Test
    fun `lists played here since the last read lead, then the account, then the rest`() {
        val local = listOf(entry("VLPLnew", 200), entry("VLPLold", 50), entry("spotify:playlist:37i", 40))
        val account = Account(listOf(entry("VLLM"), entry("VLPLweb"), entry("VLPLold")), fetchedAt = 100)
        assertEquals(
            listOf("VLPLnew", "VLPLweb", "VLPLold", "spotify:playlist:37i"),
            RecentPlaylists.merge(local, account).map { it.browseId },
        )
    }

    @Test
    fun `VLPL and PL are one list, with the account's title`() {
        val merged = RecentPlaylists.merge(listOf(entry("PLx", 200)), Account(listOf(entry("VLPLx", title = "Renamed")), 100))
        assertEquals(1, merged.size)
        assertEquals("Renamed", merged.single().title)
    }

    @Test
    fun `history names YouTube lists only`() {
        assertEquals("PLabc", Innertube.historyListId("VLPLabc"))
        assertEquals("LM", Innertube.historyListId("VLLM"))
        assertEquals("OLAK5uy_x", Innertube.historyListId("MPREb_y", "OLAK5uy_x"))
        assertNull(Innertube.historyListId("MPREb_y"))
        assertNull(Innertube.historyListId("spotify:playlist:37i"))
        assertNull(Innertube.historyListId("local:all"))
        assertNull(Innertube.historyListId(null))
    }
}
