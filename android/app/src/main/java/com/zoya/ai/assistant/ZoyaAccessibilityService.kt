package com.zoya.ai.assistant

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject

private const val TAG = "ZoyaAutomation"

/**
 * Zoya's "hands and eyes" on the device.
 * Once the user enables this in Settings > Accessibility, it can read what's
 * on screen and perform taps/typing/scrolling on Zoya's behalf.
 */
class ZoyaAccessibilityService : AccessibilityService() {

    companion object {
        var instance: ZoyaAccessibilityService? = null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.d(TAG, "onServiceConnected: ZoyaAccessibilityService is CONNECTED and ready")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Reserved for future event-driven automation.
    }

    override fun onInterrupt() {
        Log.w(TAG, "onInterrupt: ZoyaAccessibilityService was INTERRUPTED by the system")
        instance = null
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.w(TAG, "onDestroy: ZoyaAccessibilityService was DESTROYED")
        instance = null
    }

    fun goBack() = try { performGlobalAction(GLOBAL_ACTION_BACK) } catch (e: Exception) { false }
    fun goHome() = try { performGlobalAction(GLOBAL_ACTION_HOME) } catch (e: Exception) { false }
    fun openRecents() = try { performGlobalAction(GLOBAL_ACTION_RECENTS) } catch (e: Exception) { false }

    /**
     * Starts an activity using the AccessibilityService's OWN context rather than the calling
     * app's context. Android 10+ blocks apps from starting new activities while they themselves
     * are in the background (e.g. Zoya trying to open YouTube while WhatsApp already has focus)
     * — this silently fails with a normal app context. A bound AccessibilityService is treated
     * as a persistent, privileged system-interacting component and is generally exempt from
     * this restriction, so routing the launch through it lets background app-switching work.
     */
    fun launchIntentElevated(intent: Intent): Boolean {
        return try {
            startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }

    /** Finds the first element whose visible text/description contains [query] and taps it.
     *  Retries once after a short delay in case the screen is still settling. */
    fun tapByText(query: String): Boolean {
        val cleanQuery = query.trim().lowercase()
        try {
            val root = rootInActiveWindow
            val target = root?.let { findNodeByText(it, cleanQuery, 0) }
            if (target != null) return performTapOnNode(target)
        } catch (e: Exception) {
            // fall through to retry
        }

        // Retry once: the screen may still be loading/animating right after a tap/launch.
        return try {
            Thread.sleep(450)
            val root = rootInActiveWindow ?: return false
            val target = findNodeByText(root, cleanQuery, 0) ?: return false
            performTapOnNode(target)
        } catch (e: Exception) {
            false
        }
    }

    private fun findNodeByText(node: AccessibilityNodeInfo, query: String, depth: Int): AccessibilityNodeInfo? {
        if (depth > 60) return null
        val text = node.text?.toString()?.trim()?.lowercase() ?: ""
        val desc = node.contentDescription?.toString()?.trim()?.lowercase() ?: ""
        val hint = try { node.hintText?.toString()?.trim()?.lowercase() ?: "" } catch (e: Exception) { "" }
        if (text.contains(query) || desc.contains(query) || hint.contains(query) ||
            query.contains(text.takeIf { it.length > 2 } ?: "\u0000") ||
            query.contains(desc.takeIf { it.length > 2 } ?: "\u0000")) {
            return if (node.isClickable) node else (findClickableParent(node) ?: node)
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            findNodeByText(child, query, depth + 1)?.let { return it }
        }
        return null
    }

    private fun findClickableParent(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        return try {
            var current = node.parent
            var depth = 0
            while (current != null && depth < 6) {
                if (current.isClickable) return current
                current = current.parent
                depth++
            }
            null
        } catch (e: Exception) {
            null
        }
    }

    private fun performTapOnNode(node: AccessibilityNodeInfo): Boolean {
        val delays = longArrayOf(0, 500, 1200, 2200)
        for (delay in delays) {
            if (delay > 0) {
                try { Thread.sleep(delay) } catch (e: Exception) { return false }
            }
            try {
                val clicked = if (node.actionList.any { it.id == AccessibilityNodeInfo.ACTION_CLICK }) {
                    node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                } else {
                    val rect = Rect()
                    node.getBoundsInScreen(rect)
                    tapAtCoordinates(rect.centerX().toFloat(), rect.centerY().toFloat())
                }
                if (clicked) return true
            } catch (e: Exception) {
                // keep retrying
            }
        }
        return false
    }

    /**
     * Taps WhatsApp's Send button. Tries the stable resource-id first (works across
     * WhatsApp versions/languages), falls back to a text search if that fails.
     */
    fun tapWhatsAppSendButton(): Boolean {
        val root = rootInActiveWindow ?: return false
        val byId = root.findAccessibilityNodeInfosByViewId("com.whatsapp:id/send")
        val tapped = try {
            if (byId.isNotEmpty()) {
                performTapOnNode(byId[0])
            } else {
                tapByText("send")
            }
        } catch (e: Exception) {
            false
        }
        if (!tapped) return false

        // Verify the compose box actually cleared — a tap can be "accepted" by the OS
        // without the app actually registering it, so double-check the real effect.
        try {
            Thread.sleep(600)
            val freshRoot = rootInActiveWindow
            val entry = freshRoot?.findAccessibilityNodeInfosByViewId("com.whatsapp:id/entry")
            if (entry != null && entry.isNotEmpty()) {
                val stillHasText = !entry[0].text.isNullOrEmpty()
                if (stillHasText) return false // send didn't actually register, box still has the message
            }
        } catch (e: Exception) {
            // If we can't verify, trust the tap result rather than blocking on it.
        }
        return true
    }

    /**
     * Taps Telegram's Send button. Tries a couple of known resource-id candidates (these can
     * change across Telegram versions, unlike WhatsApp's), then falls back to a text search.
     */
    fun tapTelegramSendButton(): Boolean {
        return try {
            val root = rootInActiveWindow ?: return false
            val candidateIds = listOf(
                "org.telegram.messenger:id/chat_send_button",
                "org.telegram.messenger:id/send_button"
            )
            for (id in candidateIds) {
                val nodes = root.findAccessibilityNodeInfosByViewId(id)
                if (nodes.isNotEmpty()) {
                    return performTapOnNode(nodes[0])
                }
            }
            tapByText("send")
        } catch (e: Exception) {
            false
        }
    }

    /** Taps at raw x/y screen coordinates. Retries several times over a few seconds because
     *  Android silently drops gestures sent to a window that's still "not responsive"
     *  (e.g. right after a cold app launch) — dispatchGesture's return value doesn't reveal
     *  this, so a single attempt right after switching apps often silently does nothing. */
    fun tapAtCoordinates(x: Float, y: Float): Boolean {
        val delays = longArrayOf(0, 500, 1200, 2200, 3500)
        for (delay in delays) {
            if (delay > 0) {
                try { Thread.sleep(delay) } catch (e: Exception) { return false }
            }
            try {
                val path = Path().apply { moveTo(x, y) }
                val gesture = GestureDescription.Builder()
                    .addStroke(GestureDescription.StrokeDescription(path, 0, 80))
                    .build()
                if (dispatchGesture(gesture, null, null)) {
                    Log.d(TAG, "tapAtCoordinates: dispatched tap at ($x, $y) after ${delay}ms")
                    return true
                }
            } catch (e: Exception) {
                Log.e(TAG, "tapAtCoordinates: exception: ${e.message}")
            }
        }
        Log.w(TAG, "tapAtCoordinates: all retries failed for ($x, $y)")
        return false
    }

    /** Universal swipe/drag — works on ANY app regardless of accessibility node support
     *  (custom-rendered UIs, code editors, games), because it's a raw touch gesture. */
    fun swipeGesture(x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Long): Boolean {
        val delays = longArrayOf(0, 500, 1200, 2200)
        for (delay in delays) {
            if (delay > 0) {
                try { Thread.sleep(delay) } catch (e: Exception) { return false }
            }
            try {
                val path = Path().apply { moveTo(x1, y1); lineTo(x2, y2) }
                val gesture = GestureDescription.Builder()
                    .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
                    .build()
                if (dispatchGesture(gesture, null, null)) return true
            } catch (e: Exception) {
                Log.e(TAG, "swipeGesture: exception: ${e.message}")
            }
        }
        return false
    }

    /** Long-presses at (x1,y1) then drags to (x2,y2) — for selecting a range of text/code. */
    fun longPressAndDrag(x1: Float, y1: Float, x2: Float, y2: Float): Boolean {
        return try {
            val path = Path().apply { moveTo(x1, y1); lineTo(x1, y1); lineTo(x2, y2) }
            val gesture = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0, 950))
                .build()
            dispatchGesture(gesture, null, null)
        } catch (e: Exception) {
            false
        }
    }

    /** Screen pixel dimensions, so tap/swipe coordinates can be reasoned about proportionally. */
    fun getScreenSize(): Pair<Int, Int> {
        return try {
            val metrics = resources.displayMetrics
            Pair(metrics.widthPixels, metrics.heightPixels)
        } catch (e: Exception) {
            Pair(1080, 1920)
        }
    }

    /** Polls (instead of guessing a fixed delay) until the given app's window becomes active. */
    fun waitForPackageWindow(packageName: String, timeoutMs: Long): Boolean {
        val start = System.currentTimeMillis()
        while (System.currentTimeMillis() - start < timeoutMs) {
            try {
                if (rootInActiveWindow?.packageName?.toString() == packageName) return true
            } catch (e: Exception) {
                // keep polling
            }
            Thread.sleep(150)
        }
        return false
    }

    /** Types [text] into the currently focused editable field, APPENDING it to whatever is
     *  already there (ACTION_SET_TEXT replaces the whole field by default, which was silently
     *  destroying previously-typed text when building up multi-line content). */
    fun typeText(text: String): Boolean {
        return try {
            val root = rootInActiveWindow ?: return false
            val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return false
            val existing = focused.text?.toString() ?: ""
            val args = Bundle()
            args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, existing + text)
            focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        } catch (e: Exception) {
            false
        }
    }

    /** Replaces the ENTIRE content of the focused field — use to clear/correct, not append. */
    fun replaceText(text: String): Boolean {
        return try {
            val root = rootInActiveWindow ?: return false
            val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return false
            val args = Bundle()
            args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        } catch (e: Exception) {
            false
        }
    }

    /** Scrolls the first scrollable container found; falls back to a raw swipe gesture
     *  (works even in custom-rendered apps that don't expose a proper scrollable node). */
    fun scroll(direction: String): Boolean {
        try {
            val root = rootInActiveWindow
            val scrollable = root?.let { findScrollable(it, 0) }
            if (scrollable != null) {
                val action = if (direction == "up" || direction == "backward")
                    AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
                else
                    AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
                if (scrollable.performAction(action)) return true
            }
        } catch (e: Exception) {
            // fall through to gesture-based scroll
        }
        return try {
            val (w, h) = getScreenSize()
            val centerX = w / 2f
            val startY: Float; val endY: Float
            if (direction == "up" || direction == "backward") {
                startY = h * 0.35f; endY = h * 0.7f
            } else {
                startY = h * 0.7f; endY = h * 0.35f
            }
            swipeGesture(centerX, startY, centerX, endY, 300)
        } catch (e: Exception) {
            false
        }
    }

    private fun findScrollable(node: AccessibilityNodeInfo, depth: Int): AccessibilityNodeInfo? {
        if (depth > 60) return null
        if (node.isScrollable) return node
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            findScrollable(child, depth + 1)?.let { return it }
        }
        return null
    }

    /** Returns a JSON summary of the screen so Zoya can "read" it without a screenshot.
     *  Clearly separates real content/labels from empty input fields (whose placeholder
     *  text is NOT something to type/repeat — it just shows what's visible when empty). */
    fun dumpScreenText(): String {
        return try {
            val root = rootInActiveWindow ?: return "{\"currentApp\":null,\"elements\":[]}"
            val items = JSONArray()
            collectText(root, items, 0)
            val wrapper = JSONObject()
            wrapper.put("currentApp", root.packageName?.toString() ?: "unknown")
            wrapper.put("elements", items)
            wrapper.toString()
        } catch (e: Exception) {
            "{\"currentApp\":null,\"elements\":[]}"
        }
    }

    private fun collectText(node: AccessibilityNodeInfo, items: JSONArray, depth: Int) {
        if (depth > 40 || items.length() > 300) return
        val text = node.text?.toString()?.trim()
        val desc = node.contentDescription?.toString()?.trim()
        val hint = try { node.hintText?.toString()?.trim() } catch (e: Exception) { null }
        val rect = Rect()
        node.getBoundsInScreen(rect)

        if (node.isEditable) {
            // Report editable fields explicitly, even when empty — currentText is what's
            // ACTUALLY typed (may be blank), placeholder is only shown when empty and must
            // NEVER be typed/repeated as if it were real content.
            items.put(JSONObject().apply {
                put("type", "input_field")
                put("currentText", text ?: "")
                put("placeholder", hint ?: desc ?: "")
                put("focused", node.isFocused)
                put("x", rect.centerX())
                put("y", rect.centerY())
                put("w", rect.width())
                put("h", rect.height())
            })
        } else {
            val label = if (!text.isNullOrEmpty()) text else desc
            if (!label.isNullOrEmpty()) {
                items.put(JSONObject().apply {
                    put("type", "label")
                    put("text", label)
                    put("clickable", node.isClickable)
                    put("x", rect.centerX())
                    put("y", rect.centerY())
                    put("w", rect.width())
                    put("h", rect.height())
                })
            }
        }

        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { collectText(it, items, depth + 1) }
        }
    }
}
