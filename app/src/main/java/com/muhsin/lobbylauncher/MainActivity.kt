package com.muhsin.lobbylauncher

import android.annotation.SuppressLint
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.window.OnBackInvokedDispatcher
import org.json.JSONObject

/**
 * Lobby: a landscape-only game launcher.
 *
 * Architecture: a thin native shell (this activity + [Bridge]) hosts the UI, which is
 * bundled in assets/ui and served from https://lobby.app/ via request interception
 * (no network involved). The native side handles everything the web layer can't:
 * listing/launching apps, icons, usage stats, artwork lookup, controller input.
 */
class MainActivity : Activity() {

    lateinit var web: WebView
    lateinit var bridge: Bridge
    private val ui = Handler(Looper.getMainLooper())
    private var resumed = false
    private var pageReady = false
    @Volatile var typing = false

    private val pkgReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            bridge.invalidateIcon(i.data?.schemeSpecificPart)
            js("window.lobbyRefresh&&lobbyRefresh()")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Lets you inspect the UI from desktop Chrome (chrome://inspect) while developing.
        WebView.setWebContentsDebuggingEnabled(true)

        bridge = Bridge(this)
        web = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = true
            isFocusableInTouchMode = true
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                allowFileAccess = false
                allowContentAccess = false
                setSupportZoom(false)
                builtInZoomControls = false
                textZoom = 100
                useWideViewPort = true
                loadWithOverviewMode = true
            }
            addJavascriptInterface(bridge, "Lobby")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? {
                    val u = req.url
                    if (u.host != Bridge.HOST) return null
                    return bridge.serve(u.path ?: "/")
                }
                override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean =
                    req.url.host != Bridge.HOST
                override fun onPageFinished(view: WebView, url: String) { pageReady = true }
            }
        }
        setContentView(web)
        web.loadUrl("https://${Bridge.HOST}/ui/index.html")
        immersive()

        val f = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_CHANGED)
            addDataScheme("package")
        }
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(pkgReceiver, f, Context.RECEIVER_EXPORTED)
        else registerReceiver(pkgReceiver, f)
        // Live battery level + charging state for the top bar
        registerReceiver(batteryReceiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))

        // Android 13+ (and predictive back on 16): Back = "B", never close the launcher.
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {
                input("B")
            }
        }
    }

    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            val level = i.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1)
            val scale = i.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, 100)
            val status = i.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1)
            val plugged = i.getIntExtra(android.os.BatteryManager.EXTRA_PLUGGED, 0)
            val charging = plugged != 0 || status == android.os.BatteryManager.BATTERY_STATUS_CHARGING
            if (level >= 0 && pageReady) call("lobbyBattery", level * 100 / scale, charging)
        }
    }

    override fun onDestroy() {
        try { unregisterReceiver(batteryReceiver) } catch (_: Exception) {}
        try { unregisterReceiver(pkgReceiver) } catch (_: Exception) {}
        web.destroy()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { input("B") }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Home pressed while Lobby is already in front -> go back to the Games tab.
        if (intent.hasCategory(Intent.CATEGORY_HOME)) js("window.lobbyHome&&lobbyHome()")
    }

    override fun onResume() {
        super.onResume()
        resumed = true
        web.onResume()
        web.resumeTimers()
        immersive()
        js("window.lobbyResume&&lobbyResume()")
    }

    override fun onPause() {
        resumed = false
        js("window.lobbyPause&&lobbyPause()")
        // Let the JS fade the music out, then stop the page doing work in the background.
        ui.postDelayed({ if (!resumed) { web.onPause(); web.pauseTimers() } }, 400)
        super.onPause()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) immersive()
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        bridge.onActivityResult(requestCode, resultCode, data)
    }

    private fun immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
        }
    }

    // ---------------------------------------------------------------- JS helpers
    fun js(code: String) {
        if (Looper.myLooper() == Looper.getMainLooper()) web.evaluateJavascript(code, null)
        else ui.post { web.evaluateJavascript(code, null) }
    }

    fun call(fn: String, vararg args: Any?) {
        val a = args.joinToString(",") { v ->
            when (v) {
                null -> "null"
                is Number, is Boolean -> v.toString()
                is JSONObject -> v.toString()
                else -> JSONObject.quote(v.toString())
            }
        }
        js("window.$fn&&$fn($a)")
    }

    private fun input(name: String, dx: Int = 0, dy: Int = 0) = js("window.lobbyInput&&lobbyInput('$name',$dx,$dy)")

    // ---------------------------------------------------------------- controller / keys
    private fun mapKey(code: Int): String? = when (code) {
        KeyEvent.KEYCODE_BUTTON_A, KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER,
        KeyEvent.KEYCODE_NUMPAD_ENTER, KeyEvent.KEYCODE_SPACE -> "A"
        KeyEvent.KEYCODE_BUTTON_B, KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_ESCAPE -> "B"
        KeyEvent.KEYCODE_BUTTON_Y -> "Y"
        KeyEvent.KEYCODE_BUTTON_X -> "X"
        KeyEvent.KEYCODE_BUTTON_L1, KeyEvent.KEYCODE_PAGE_UP, KeyEvent.KEYCODE_Q -> "L1"
        KeyEvent.KEYCODE_BUTTON_R1, KeyEvent.KEYCODE_PAGE_DOWN, KeyEvent.KEYCODE_E -> "R1"
        KeyEvent.KEYCODE_BUTTON_START -> "START"
        KeyEvent.KEYCODE_DPAD_UP -> "UP"
        KeyEvent.KEYCODE_DPAD_DOWN -> "DOWN"
        KeyEvent.KEYCODE_DPAD_LEFT -> "LEFT"
        KeyEvent.KEYCODE_DPAD_RIGHT -> "RIGHT"
        else -> null
    }

    override fun dispatchKeyEvent(e: KeyEvent): Boolean {
        val code = e.keyCode
        if (code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN) return super.dispatchKeyEvent(e)
        // While a text field is focused, let the keyboard work (except gamepad buttons / back).
        if (typing && !KeyEvent.isGamepadButton(code) && code != KeyEvent.KEYCODE_BACK) return super.dispatchKeyEvent(e)
        val name = mapKey(code) ?: return super.dispatchKeyEvent(e)
        if (e.action == KeyEvent.ACTION_DOWN) {
            when (name) {
                "UP" -> input("move", 0, -1)
                "DOWN" -> input("move", 0, 1)
                "LEFT" -> input("move", -1, 0)
                "RIGHT" -> input("move", 1, 0)
                else -> if (e.repeatCount == 0) input(name)
            }
        }
        return true
    }

    // Analog stick + hat -> d-pad with auto-repeat
    private var stickX = 0
    private var stickY = 0
    private val repeater = object : Runnable {
        override fun run() {
            if (stickX != 0 || stickY != 0) {
                input("move", stickX, if (stickX != 0) 0 else stickY)
                ui.postDelayed(this, 110)
            }
        }
    }

    override fun onGenericMotionEvent(e: MotionEvent): Boolean {
        val joy = (e.source and InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK ||
            (e.source and InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
        if (joy && e.action == MotionEvent.ACTION_MOVE) {
            val hx = e.getAxisValue(MotionEvent.AXIS_HAT_X)
            val hy = e.getAxisValue(MotionEvent.AXIS_HAT_Y)
            val ax = e.getAxisValue(MotionEvent.AXIS_X)
            val ay = e.getAxisValue(MotionEvent.AXIS_Y)
            val x = if (hx != 0f) hx else ax
            val y = if (hy != 0f) hy else ay
            val nx = if (x > .6f) 1 else if (x < -.6f) -1 else 0
            val ny = if (y > .6f) 1 else if (y < -.6f) -1 else 0
            // shoulder triggers on some pads come through as axes
            val lt = e.getAxisValue(MotionEvent.AXIS_LTRIGGER).coerceAtLeast(e.getAxisValue(MotionEvent.AXIS_BRAKE))
            val rt = e.getAxisValue(MotionEvent.AXIS_RTRIGGER).coerceAtLeast(e.getAxisValue(MotionEvent.AXIS_GAS))
            if (nx != stickX || ny != stickY) {
                ui.removeCallbacks(repeater)
                stickX = nx; stickY = ny
                if (nx != 0 || ny != 0) {
                    input("move", nx, if (nx != 0) 0 else ny)
                    ui.postDelayed(repeater, 380)
                }
            }
            triggers(lt, rt)
            return true
        }
        return super.onGenericMotionEvent(e)
    }

    private var ltDown = false
    private var rtDown = false
    private fun triggers(lt: Float, rt: Float) {
        if (lt > .6f && !ltDown) { ltDown = true; input("L1") } else if (lt < .3f) ltDown = false
        if (rt > .6f && !rtDown) { rtDown = true; input("R1") } else if (rt < .3f) rtDown = false
    }
}
