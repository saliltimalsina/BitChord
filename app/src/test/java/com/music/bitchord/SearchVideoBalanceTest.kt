package com.music.bitchord

import com.music.bitchord.data.innertube.InnertubeParser
import com.music.bitchord.data.model.SearchResult
import com.music.bitchord.data.model.Song
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * "simrayo" as YouTube Music answered it: a song Gauley Bhai released only as
 * its music video (OMV, twice), around fan uploads (UGC: a TV performance,
 * covers, live sets) and unrelated songs that start with "sim".
 */
class SearchVideoBalanceTest {

    private val response = Json.parseToJsonElement(
        javaClass.getResource("/search/simrayo.json")!!.readText(),
    ).jsonObject

    private fun songs(rows: List<SearchResult>): List<Song> = rows.mapNotNull {
        when (it) {
            is SearchResult.Track -> it.song
            is SearchResult.TopTrack -> it.song
            is SearchResult.Browse -> null
        }
    }

    @Test
    fun `the All tab keeps the artist's own videos of a song-less release`() {
        val rows = songs(InnertubeParser.parseSearchPage(response, mixed = true, query = "simrayo").rows)
        val videos = rows.filter { it.isVideo }
        assertEquals(listOf("Simrayo", "Simrayo"), videos.map { it.title })
        assertTrue(videos.none { it.isFanUpload })
        assertTrue(rows.first().isVideo)
        assertTrue(rows.any { !it.isVideo })
    }

    @Test
    fun `fan uploads join the All tab only when the query asks for a take`() {
        val plain = songs(InnertubeParser.parseSearchPage(response, mixed = true, query = "simrayo").rows)
        assertFalse(plain.any { it.isFanUpload })
        val live = songs(InnertubeParser.parseSearchPage(response, mixed = true, query = "simrayo live").rows)
        assertTrue(live.any { it.isFanUpload })
    }

    @Test
    fun `the parser marks fan uploads and leaves official videos unmarked`() {
        val videos = songs(InnertubeParser.parseSearchPage(response, includeVideos = true).rows)
        assertTrue(videos.single { it.title.contains("Kappa TV") }.isFanUpload)
        assertTrue(videos.filter { it.title == "Simrayo" }.none { it.isFanUpload })
    }

    @Test
    fun `without the All tab's mix, search stays songs only`() {
        assertTrue(songs(InnertubeParser.parseSearchPage(response).rows).none { it.isVideo })
    }
}
