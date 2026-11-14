package com.music.bitchord.data.listentogether

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Connect's output device as the server sends it, read the way the app reads it. */
class PartyOutputDecodingTest {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = false
    }

    @Test
    fun readsTheOutputMemberAndDeviceNames() {
        val playback = json.decodeFromString(
            PartyPlayback.serializer(),
            """{"seq":16,"track":null,"queueSeq":2,"queueIndex":0,"queueLength":1,"isPlaying":false,
               "positionMs":1,"anchorMs":2,"effectivePositionMs":1,"updatedBy":"a","startedBy":"a",
               "startedByName":"S","autoplayEnabled":true,"outputMemberId":"68c68deadae6e754","updatedAtMs":3}""",
        )
        assertEquals("68c68deadae6e754", playback.outputMemberId)
        val member = json.decodeFromString(PartyMember.serializer(), """{"memberId":"m","deviceName":"Pixel 8 Pro"}""")
        assertEquals("Pixel 8 Pro", member.deviceName)
    }

    @Test
    fun nullOutputMeansEveryDevice() {
        val playback = json.decodeFromString(PartyPlayback.serializer(), """{"seq":1,"outputMemberId":null}""")
        assertNull(playback.outputMemberId)
    }
}
