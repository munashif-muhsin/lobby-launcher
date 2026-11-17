package com.muhsin.lobbylauncher

import android.app.AppOpsManager
import android.app.role.RoleManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.util.LruCache
import android.webkit.JavascriptInterface
import android.webkit.WebResourceResponse
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Calendar
import java.util.concurrent.Executors

/** Everything the UI can ask the phone for. Exposed to JS as `window.Lobby`. */
class Bridge(private val a: MainActivity) {

    companion object {
        const val HOST = "lobby.app"
        private const val REQ_HOME = 11
        private const val REQ_IMAGE = 12
    }

    private val pm: PackageManager = a.packageManager
    private val io = Executors.newFixedThreadPool(3)
    private val iconCache = object : LruCache<String, ByteArray>(8 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ByteArray) = value.size
    }
    private val artDir = File(a.filesDir, "art").apply { mkdirs() }
    private val metaPrefs = a.getSharedPreferences("meta", Context.MODE_PRIVATE)
    private var pendingImagePkg: String? = null

    // ------------------------------------------------------------ local web server
    fun serve(path: String): WebResourceResponse {
        return try {
            when {
                path.startsWith("/ui/") -> {
                    val asset = path.removePrefix("/").ifEmpty { "ui/index.html" }
                    resp(mime(asset), a.assets.open(asset).readBytes())
                }
                path.startsWith("/icon/") -> resp("image/png", icon(path.removePrefix("/icon/")))
                path.startsWith("/art/") -> {
                    // /art/<pkg>/<variant>
                    val parts = path.removePrefix("/art/").split("/")
                    val f = File(artDir, "${parts[0]}_${parts.getOrElse(1) { "play" }}.jpg")
                    if (f.exists()) resp("image/jpeg", f.readBytes(), cache = false) else notFound()
                }
                else -> notFound()
            }
        } catch (e: Exception) { notFound() }
    }

    private fun resp(mime: String, bytes: ByteArray, cache: Boolean = true) =
        WebResourceResponse(mime, if (mime.startsWith("text") || mime.contains("javascript")) "utf-8" else null,
            200, "OK",
            mapOf("Cache-Control" to if (cache) "max-age=86400" else "no-store", "Access-Control-Allow-Origin" to "*"),
            ByteArrayInputStream(bytes))

    private fun notFound() = WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)))

    private fun mime(p: String) = when (p.substringAfterLast('.')) {
        "html" -> "text/html"; "js" -> "application/javascript"; "css" -> "text/css"
        "woff2" -> "font/woff2"; "png" -> "image/png"; "svg" -> "image/svg+xml"; "json" -> "application/json"
        else -> "application/octet-stream"
    }

    private fun icon(pkg: String): ByteArray {
        iconCache.get(pkg)?.let { return it }
        val d: Drawable = pm.getApplicationIcon(pkg)
        val size = 192
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        d.setBounds(0, 0, size, size)
        d.draw(c)
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
        bmp.recycle()
        return out.toByteArray().also { iconCache.put(pkg, it) }
    }

    fun invalidateIcon(pkg: String?) { if (pkg != null) iconCache.remove(pkg) }

    // ------------------------------------------------------------ apps
    @JavascriptInterface
    fun getApps(): String {
        val out = JSONArray()
        val seen = HashSet<String>()
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        for (ri in pm.queryIntentActivities(intent, 0)) {
            val pkg = ri.activityInfo.packageName
            if (pkg == a.packageName || !seen.add(pkg)) continue
            val ai = ri.activityInfo.applicationInfo
            @Suppress("DEPRECATION")
            val isGame = ai.category == ApplicationInfo.CATEGORY_GAME || (ai.flags and ApplicationInfo.FLAG_IS_GAME) != 0
            val pi = try { pm.getPackageInfo(pkg, 0) } catch (e: Exception) { null }
            out.put(JSONObject().apply {
                put("pkg", pkg)
                put("name", ri.loadLabel(pm).toString())
                put("game", isGame)
                put("system", (ai.flags and ApplicationInfo.FLAG_SYSTEM) != 0)
                put("ver", pi?.versionName ?: "")
                put("installed", pi?.firstInstallTime ?: 0L)
            })
        }
        return out.toString()
    }

    @JavascriptInterface
    fun launch(pkg: String): Boolean {
        val i = pm.getLaunchIntentForPackage(pkg) ?: return false
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        a.runOnUiThread { try { a.startActivity(i) } catch (_: Exception) {} }
        return true
    }

    @JavascriptInterface
    fun openAppInfo(pkg: String) {
        a.runOnUiThread {
            a.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    @JavascriptInterface
    fun setTyping(on: Boolean) { a.typing = on }

    // ------------------------------------------------------------ default home
    @JavascriptInterface
    fun isDefaultHome(): Boolean {
        val r = pm.resolveActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), PackageManager.MATCH_DEFAULT_ONLY)
        return r?.activityInfo?.packageName == a.packageName
    }

    @JavascriptInterface
    fun requestHome() {
        a.runOnUiThread {
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    val rm = a.getSystemService(RoleManager::class.java)
                    if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME) && !rm.isRoleHeld(RoleManager.ROLE_HOME)) {
                        @Suppress("DEPRECATION")
                        a.startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_HOME), REQ_HOME)
                        return@runOnUiThread
                    }
                }
                a.startActivity(Intent(Settings.ACTION_HOME_SETTINGS))
            } catch (e: Exception) {
                a.startActivity(Intent(Settings.ACTION_SETTINGS))
            }
        }
    }

    // ------------------------------------------------------------ usage access
    @JavascriptInterface
    fun hasUsageAccess(): Boolean {
        val ops = a.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= 29)
            ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), a.packageName)
        else @Suppress("DEPRECATION") ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), a.packageName)
        return mode == AppOpsManager.MODE_ALLOWED
    }

    @JavascriptInterface
    fun openUsageSettings() {
        a.runOnUiThread {
            val direct = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:${a.packageName}"))
            try { a.startActivity(direct) } catch (e: ActivityNotFoundException) {
                a.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
            }
        }
    }

    /** { pkg: { total, last, week, days:[7 x minutes, oldest first] } } */
    @JavascriptInterface
    fun getUsage(): String {
        val out = JSONObject()
        if (!hasUsageAccess()) return out.toString()
        val usm = a.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        val totals = usm.queryAndAggregateUsageStats(now - 730L * 86_400_000L, now)

        val cal = Calendar.getInstance().apply { timeInMillis = now; set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
        val todayStart = cal.timeInMillis
        val weekStart = todayStart - 6L * 86_400_000L
        val days = HashMap<String, LongArray>()
        val open = HashMap<String, Long>()
        val ev = usm.queryEvents(weekStart, now)
        val e = UsageEvents.Event()
        fun add(pkg: String, from: Long, to: Long) {
            val arr = days.getOrPut(pkg) { LongArray(7) }
            var s = from
            while (s < to) {
                val idx = ((s - weekStart) / 86_400_000L).toInt().coerceIn(0, 6)
                val dayEnd = weekStart + (idx + 1) * 86_400_000L
                val end = minOf(to, dayEnd)
                arr[idx] += end - s
                s = end
            }
        }
        while (ev.hasNextEvent()) {
            ev.getNextEvent(e)
            when (e.eventType) {
                UsageEvents.Event.ACTIVITY_RESUMED -> if (!open.containsKey(e.packageName)) open[e.packageName] = e.timeStamp
                UsageEvents.Event.ACTIVITY_PAUSED, 23 /* ACTIVITY_STOPPED */ -> open.remove(e.packageName)?.let { add(e.packageName, it, e.timeStamp) }
            }
        }
        open.forEach { (pkg, t) -> if (pkg != a.packageName) add(pkg, t, now) }

        val pkgs = HashSet<String>(totals.keys).apply { addAll(days.keys) }
        for (pkg in pkgs) {
            val u = totals[pkg]
            val d = days[pkg]
            val week = d?.sum() ?: 0L
            out.put(pkg, JSONObject().apply {
                put("total", maxOf(u?.totalTimeInForeground ?: 0L, week))
                put("last", u?.lastTimeUsed ?: 0L)
                put("week", week)
                put("days", JSONArray().apply { (0 until 7).forEach { put((d?.get(it) ?: 0L) / 60000L) } })
            })
        }
        return out.toString()
    }

    // ------------------------------------------------------------ artwork
    @JavascriptInterface
    fun getMeta(): String {
        val o = JSONObject()
        for ((k, v) in metaPrefs.all) try { o.put(k, JSONObject(v as String)) } catch (_: Exception) {}
        return o.toString()
    }

    /** list = JSON [{pkg,name}] ; calls window.lobbyArt(pkg, meta) per item and lobbyArtDone() at the end. */
    @JavascriptInterface
    fun fetchArt(list: String, force: Boolean) {
        val arr = JSONArray(list)
        val total = arr.length()
        if (total == 0) { a.call("lobbyArtDone"); return }
        var done = 0
        for (i in 0 until total) {
            val o = arr.getJSONObject(i)
            val pkg = o.getString("pkg"); val name = o.getString("name")
            io.execute {
                val meta = try {
                    if (!force && metaPrefs.contains(pkg)) JSONObject(metaPrefs.getString(pkg, "{}")!!)
                    else ArtFetcher.fetch(pkg, name, artDir).also { metaPrefs.edit().putString(pkg, it.toString()).apply() }
                } catch (e: Exception) {
                    JSONObject().put("src", "fallback").put("variants", JSONObject())
                }
                a.call("lobbyArt", pkg, meta)
                synchronized(this) { done++; if (done == total) a.call("lobbyArtDone") }
            }
        }
    }

    @JavascriptInterface
    fun pickImage(pkg: String) {
        pendingImagePkg = pkg
        a.runOnUiThread {
            val i = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*")
            @Suppress("DEPRECATION")
            a.startActivityForResult(i, REQ_IMAGE)
        }
    }

    fun onActivityResult(req: Int, res: Int, data: Intent?) {
        when (req) {
            REQ_HOME -> a.call("lobbyHomeResult", isDefaultHome())
            REQ_IMAGE -> {
                val pkg = pendingImagePkg ?: return
                val uri = data?.data
                if (res != android.app.Activity.RESULT_OK || uri == null) { a.call("lobbyGallery", pkg, false); return }
                io.execute {
                    val ok = try {
                        val bytes = a.contentResolver.openInputStream(uri)!!.use { it.readBytes() }
                        ArtFetcher.saveScaled(bytes, File(artDir, "${pkg}_gal.jpg"))
                    } catch (e: Exception) { false }
                    if (ok) {
                        val m = try { JSONObject(metaPrefs.getString(pkg, "{}")!!) } catch (e: Exception) { JSONObject() }
                        val v = m.optJSONObject("variants") ?: JSONObject()
                        v.put("gal", true); m.put("variants", v); if (!m.has("src")) m.put("src", "fallback")
                        metaPrefs.edit().putString(pkg, m.toString()).apply()
                    }
                    a.call("lobbyGallery", pkg, ok)
                }
            }
        }
    }

    // ------------------------------------------------------------ misc
    @JavascriptInterface
    fun getBattery(): String {
        val i = a.registerReceiver(null, android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = i?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = i?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val status = i?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
        return JSONObject().put("level", if (level >= 0) level * 100 / scale else -1).put("charging", charging).toString()
    }

    @JavascriptInterface
    fun igdbEnabled(): Boolean = BuildConfig.IGDB_CLIENT_ID.isNotEmpty()

    @JavascriptInterface
    fun openSettings() { a.runOnUiThread { a.startActivity(Intent(Settings.ACTION_SETTINGS)) } }
}
