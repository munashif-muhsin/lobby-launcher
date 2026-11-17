package com.muhsin.lobbylauncher

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Artwork + genre lookup, in order:
 *   1. Google Play store page (feature graphic / landscape screenshot, genre)
 *   2. IGDB (only when a Twitch client id/secret is configured in local.properties)
 *   3. fallback -> the UI generates a cover from the app icon
 * Anything the user picks or edits in the UI is stored separately and never overwritten.
 */
object ArtFetcher {
    private const val UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
    @Volatile private var igdbToken: String? = null
    @Volatile private var igdbTokenExp = 0L

    fun fetch(pkg: String, name: String, dir: File): JSONObject {
        val variants = JSONObject()
        var src = "fallback"
        var genre: String? = null

        // 1. Play Store
        try {
            val html = get("https://play.google.com/store/apps/details?id=$pkg&hl=en&gl=US")
            if (html != null) {
                genre = playGenre(html)
                val img = playImage(html)
                if (img != null && download(img, File(dir, "${pkg}_play.jpg"))) {
                    variants.put("play", true); src = "play"
                }
            }
        } catch (_: Exception) {}

        // 2. IGDB
        if (BuildConfig.IGDB_CLIENT_ID.isNotEmpty()) try {
            val g = igdbSearch(name)
            if (g != null) {
                if (genre == null) genre = g.optJSONArray("genres")?.optJSONObject(0)?.optString("name")
                val art = g.optJSONArray("artworks")?.optJSONObject(0)?.optString("image_id")
                    ?: g.optJSONArray("screenshots")?.optJSONObject(0)?.optString("image_id")
                val cover = g.optJSONObject("cover")?.optString("image_id")
                if (art != null && download("https://images.igdb.com/igdb/image/upload/t_1080p/$art.jpg", File(dir, "${pkg}_igdb.jpg"))) {
                    variants.put("igdb", true); if (src == "fallback") src = "igdb"
                }
                if (cover != null && download("https://images.igdb.com/igdb/image/upload/t_1080p/$cover.jpg", File(dir, "${pkg}_igdb2.jpg"))) {
                    variants.put("igdb2", true); if (src == "fallback") src = "igdb"
                }
            }
        } catch (_: Exception) {}

        if (File(dir, "${pkg}_gal.jpg").exists()) variants.put("gal", true)
        return JSONObject().apply {
            put("src", src)
            put("variants", variants)
            if (!genre.isNullOrBlank()) put("genre", genre)
            put("t", System.currentTimeMillis())
        }
    }

    // ---------------------------------------------------------------- Play parsing
    private fun playGenre(html: String): String? {
        Regex("<script type=\"application/ld\\+json\"[^>]*>(.*?)</script>", RegexOption.DOT_MATCHES_ALL).findAll(html).forEach { m ->
            try {
                val cat = JSONObject(m.groupValues[1]).optString("applicationCategory")
                if (cat.isNotEmpty()) return prettyCategory(cat)
            } catch (_: Exception) {}
        }
        Regex("itemprop=\"genre\"[^>]*>([^<]+)<").find(html)?.let { return it.groupValues[1].trim() }
        return null
    }

    private fun prettyCategory(c: String): String =
        c.removePrefix("GAME_").split('_').joinToString(" ") { it.lowercase().replaceFirstChar(Char::uppercase) }
            .replace("Role Playing", "RPG")

    /** Prefer the feature graphic / cover art, else the first landscape screenshot. */
    private fun playImage(html: String): String? {
        val imgs = Regex("<img[^>]*>").findAll(html).map { it.value }.toList()
        data class C(val base: String, val alt: String, val w: Int, val h: Int)
        val cands = imgs.mapNotNull { tag ->
            val src = Regex("(?:src|srcset)=\"(https://play-lh\\.googleusercontent\\.com/[^\" ]+)").find(tag)?.groupValues?.get(1) ?: return@mapNotNull null
            val alt = Regex("alt=\"([^\"]*)\"").find(tag)?.groupValues?.get(1) ?: ""
            val wh = Regex("=w(\\d+)-h(\\d+)").find(src)
            C(src.substringBefore('='), alt, wh?.groupValues?.get(1)?.toInt() ?: 0, wh?.groupValues?.get(2)?.toInt() ?: 0)
        }
        val feature = cands.firstOrNull { it.alt.contains("feature graphic", true) || it.alt.contains("cover art", true) }
        val shot = cands.firstOrNull { it.alt.contains("screenshot", true) && it.w > it.h && it.w > 0 }
        val pick = feature ?: shot ?: return null
        return pick.base + "=w1280-h720-c"
    }

    // ---------------------------------------------------------------- IGDB
    private fun igdbSearch(name: String): JSONObject? {
        val token = igdbAuth() ?: return null
        val body = "search \"${name.replace("\"", "")}\"; fields name,cover.image_id,artworks.image_id,screenshots.image_id,genres.name; limit 1;"
        val c = (URL("https://api.igdb.com/v4/games").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; doOutput = true; connectTimeout = 8000; readTimeout = 8000
            setRequestProperty("Client-ID", BuildConfig.IGDB_CLIENT_ID)
            setRequestProperty("Authorization", "Bearer $token")
        }
        c.outputStream.use { it.write(body.toByteArray()) }
        if (c.responseCode != 200) return null
        val arr = JSONArray(c.inputStream.bufferedReader().readText())
        return if (arr.length() > 0) arr.getJSONObject(0) else null
    }

    private fun igdbAuth(): String? {
        if (igdbToken != null && System.currentTimeMillis() < igdbTokenExp) return igdbToken
        val q = "client_id=${enc(BuildConfig.IGDB_CLIENT_ID)}&client_secret=${enc(BuildConfig.IGDB_CLIENT_SECRET)}&grant_type=client_credentials"
        val c = (URL("https://id.twitch.tv/oauth2/token?$q").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; connectTimeout = 8000; readTimeout = 8000
        }
        if (c.responseCode != 200) return null
        val j = JSONObject(c.inputStream.bufferedReader().readText())
        igdbToken = j.getString("access_token")
        igdbTokenExp = System.currentTimeMillis() + j.optLong("expires_in", 3600) * 1000 - 60_000
        return igdbToken
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    // ---------------------------------------------------------------- http + images
    private fun get(url: String): String? {
        val c = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 8000; readTimeout = 10000
            setRequestProperty("User-Agent", UA)
            setRequestProperty("Accept-Language", "en-US,en;q=0.9")
        }
        return if (c.responseCode == 200) c.inputStream.bufferedReader().readText() else null
    }

    private fun download(url: String, out: File): Boolean {
        val c = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 8000; readTimeout = 15000; setRequestProperty("User-Agent", UA)
        }
        if (c.responseCode != 200) return false
        return saveScaled(c.inputStream.readBytes(), out)
    }

    /** Decode, cap at 1280px wide, save as JPEG. Keeps disk + memory small. */
    fun saveScaled(bytes: ByteArray, out: File): Boolean {
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, o)
        if (o.outWidth <= 0) return false
        var sample = 1
        while (o.outWidth / (sample * 2) >= 1280) sample *= 2
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return false
        val scaled = if (bmp.width > 1280) Bitmap.createScaledBitmap(bmp, 1280, bmp.height * 1280 / bmp.width, true) else bmp
        FileOutputStream(out).use { scaled.compress(Bitmap.CompressFormat.JPEG, 86, it) }
        if (scaled !== bmp) scaled.recycle(); bmp.recycle()
        return true
    }
}
