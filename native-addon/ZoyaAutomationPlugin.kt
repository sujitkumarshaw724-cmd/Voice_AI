package com.zoya.ai.assistant

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "ZoyaAutomation",
    permissions = [
        Permission(strings = [Manifest.permission.CALL_PHONE], alias = "call"),
        Permission(strings = [Manifest.permission.SEND_SMS], alias = "sms"),
        Permission(strings = [Manifest.permission.READ_CONTACTS], alias = "contacts")
    ]
)
class ZoyaAutomationPlugin : Plugin() {

    // Common app name -> package name map. Add more as needed, or pass a raw package name.
    private val appPackages = mapOf(
        "whatsapp" to "com.whatsapp",
        "instagram" to "com.instagram.android",
        "youtube" to "com.google.android.youtube",
        "chrome" to "com.android.chrome",
        "spotify" to "com.spotify.music",
        "gmail" to "com.google.android.gm",
        "maps" to "com.google.android.apps.maps",
        "settings" to "com.android.settings",
        "camera" to "com.android.camera",
        "phone" to "com.android.dialer",
        "dialer" to "com.android.dialer",
        "messages" to "com.google.android.apps.messaging",
        "facebook" to "com.facebook.katana",
        "telegram" to "org.telegram.messenger",
        "tiktok" to "com.zhiliaoapp.musically"
    )

    @PluginMethod
    fun isAccessibilityServiceEnabled(call: PluginCall) {
        val expected = "${context.packageName}/${ZoyaAccessibilityService::class.java.canonicalName}"
        val enabled = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: ""
        call.resolve(JSObject().put("enabled", enabled.contains(expected)))
    }

    @PluginMethod
    fun openAccessibilitySettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivityElevated(intent)
        call.resolve()
    }

    @PluginMethod
    fun launchApp(call: PluginCall) {
        val name = call.getString("appName")?.trim() ?: return call.reject("appName required")
        val nameLower = name.lowercase()
        val pm = context.packageManager

        var targetPackage: String? = appPackages[nameLower]
        if (targetPackage == null && pm.getLaunchIntentForPackage(name) != null) {
            targetPackage = name
        }
        if (targetPackage == null) {
            try {
                val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
                val match = apps.firstOrNull { appInfo ->
                    val label = pm.getApplicationLabel(appInfo).toString().lowercase()
                    label == nameLower || label.contains(nameLower) || nameLower.contains(label)
                } ?: apps.firstOrNull { appInfo ->
                    pm.getApplicationLabel(appInfo).toString().lowercase()
                        .split(" ").any { word -> word.startsWith(nameLower) || nameLower.startsWith(word) }
                }
                targetPackage = match?.packageName
            } catch (e: Exception) {
                // fall through to rejection below
            }
        }

        if (targetPackage == null) {
            return call.reject("Could not find an installed app matching \"$name\".")
        }

        val launchIntent = pm.getLaunchIntentForPackage(targetPackage)
            ?: return call.reject("Found \"$name\" but it has no launchable screen.")
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            startActivityElevated(launchIntent)
        } catch (e: Exception) {
            return call.reject("Could not launch \"$name\": ${e.message}")
        }

        // Resolve immediately (no blocking wait/verification/auto-return) so the next voice
        // command isn't delayed — this is what let sequential app-opening commands (WhatsApp
        // then YouTube, etc.) work reliably.
        call.resolve(JSObject().put("success", true).put("message", "$name opened."))
    }

    @PluginMethod
    fun tapByText(call: PluginCall) {
        val text = call.getString("text") ?: return call.reject("text required")
        val service = ZoyaAccessibilityService.instance
            ?: return call.reject("Accessibility service not enabled. Ask the user to enable it in Settings.")
        call.resolve(JSObject().put("success", service.tapByText(text)))
    }

    @PluginMethod
    fun tapAtCoordinates(call: PluginCall) {
        val x = call.getFloat("x") ?: return call.reject("x required")
        val y = call.getFloat("y") ?: return call.reject("y required")
        val service = ZoyaAccessibilityService.instance
            ?: return call.reject("Accessibility service not enabled.")
        call.resolve(JSObject().put("success", service.tapAtCoordinates(x, y)))
    }

    @PluginMethod
    fun swipeGesture(call: PluginCall) {
        val x1 = call.getFloat("x1") ?: return call.reject("x1 required")
        val y1 = call.getFloat("y1") ?: return call.reject("y1 required")
        val x2 = call.getFloat("x2") ?: return call.reject("x2 required")
        val y2 = call.getFloat("y2") ?: return call.reject("y2 required")
        val duration = (call.getInt("durationMs") ?: 300).toLong()
        val service = ZoyaAccessibilityService.instance
            ?: return call.reject("Accessibility service not enabled.")
        call.resolve(JSObject().put("success", service.swipeGesture(x1, y1, x2, y2, duration)))
    }

    @PluginMethod
    fun longPressAndDrag(call: PluginCall) {
        val x1 = call.getFloat("x1") ?: return call.reject("x1 required")
        val y1 = call.getFloat("y1") ?: return call.reject("y1 required")
        val x2 = call.getFloat("x2") ?: return call.reject("x2 required")
        val y2 = call.getFloat("y2") ?: return call.reject("y2 required")
        val service = ZoyaAccessibilityService.instance
            ?: return call.reject("Accessibility service not enabled.")
        call.resolve(JSObject().put("success", service.longPressAndDrag(x1, y1, x2, y2)))
    }

    @PluginMethod
    fun getScreenSize(call: PluginCall) {
        val service = ZoyaAccessibilityService.instance
            ?: return call.reject("Accessibility service not enabled.")
        val (w, h) = service.getScreenSize()
        call.resolve(JSObject().put("width", w).put("height", h))
    }

    @PluginMethod
    fun typeText(call: PluginCall) {
        val text = call.getString("text") ?: return call.reject("text required")
        val service = ZoyaAccessibilityService.instance
            ?: return call.reject("Accessibility service not enabled.")
        call.resolve(JSObject().put("success", service.typeText(text)))
    }

    @PluginMethod
    fun replaceText(call: PluginCall) {
        val text = call.getString("text") ?: return call.reject("text required")
        val service = ZoyaAccessibilityService.instance
            ?: return call.reject("Accessibility service not enabled.")
        call.resolve(JSObject().put("success", service.replaceText(text)))
    }

    @PluginMethod
    fun scroll(call: PluginCall) {
        val direction = call.getString("direction") ?: "down"
        val service = ZoyaAccessibilityService.instance
            ?: return call.reject("Accessibility service not enabled.")
        call.resolve(JSObject().put("success", service.scroll(direction)))
    }

    @PluginMethod
    fun goBack(call: PluginCall) {
        ZoyaAccessibilityService.instance?.goBack()
        call.resolve()
    }

    @PluginMethod
    fun goHome(call: PluginCall) {
        ZoyaAccessibilityService.instance?.goHome()
        call.resolve()
    }

    @PluginMethod
    fun getScreenContent(call: PluginCall) {
        val service = ZoyaAccessibilityService.instance
            ?: return call.reject("Accessibility service not enabled.")
        call.resolve(JSObject().put("content", service.dumpScreenText()))
    }

    @PluginMethod
    fun makeCall(call: PluginCall) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE)
            != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("call", call, "callPermsCallback")
            return
        }
        performCall(call)
    }

    @PermissionCallback
    private fun callPermsCallback(call: PluginCall) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE)
            == PackageManager.PERMISSION_GRANTED) {
            performCall(call)
        } else {
            call.reject("CALL_PHONE permission denied by user")
        }
    }

    private fun performCall(call: PluginCall) {
        val number = call.getString("number") ?: return call.reject("number required")
        val intent = Intent(Intent.ACTION_CALL)
        intent.data = Uri.parse("tel:$number")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivityElevated(intent)
        call.resolve(JSObject().put("success", true))
    }

    @PluginMethod
    fun sendSms(call: PluginCall) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS)
            != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("sms", call, "smsPermsCallback")
            return
        }
        performSms(call)
    }

    @PermissionCallback
    private fun smsPermsCallback(call: PluginCall) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS)
            == PackageManager.PERMISSION_GRANTED) {
            performSms(call)
        } else {
            call.reject("SEND_SMS permission denied by user")
        }
    }

    private fun performSms(call: PluginCall) {
        val number = call.getString("number") ?: return call.reject("number required")
        val message = call.getString("message") ?: return call.reject("message required")
        SmsManager.getDefault().sendTextMessage(number, null, message, null, null)
        call.resolve(JSObject().put("success", true))
    }

    // ---------------- WhatsApp automation ----------------

    @PluginMethod
    fun sendWhatsAppMessage(call: PluginCall) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS)
            != PackageManager.PERMISSION_GRANTED
            && call.getString("number") == null) {
            // Only need contacts permission if resolving by name
            requestPermissionForAlias("contacts", call, "whatsappContactsCallback")
            return
        }
        doSendWhatsAppMessage(call)
    }

    @PermissionCallback
    private fun whatsappContactsCallback(call: PluginCall) {
        doSendWhatsAppMessage(call)
    }

    private fun doSendWhatsAppMessage(call: PluginCall) {
        val message = call.getString("message") ?: return call.reject("message required")
        var number = call.getString("number")
        val contactName = call.getString("contactName")

        if (number.isNullOrBlank() && !contactName.isNullOrBlank()) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS)
                == PackageManager.PERMISSION_GRANTED) {
                number = resolveContactNumber(contactName)
            }
            if (number.isNullOrBlank()) {
                return call.reject("Could not find a saved contact matching \"$contactName\". Ask the user for the phone number instead.")
            }
        }
        if (number.isNullOrBlank()) {
            return call.reject("number or contactName required")
        }

        val cleanNumber = number.replace(Regex("[^0-9]"), "")
        val encodedMessage = Uri.encode(message)
        val uri = Uri.parse("https://wa.me/$cleanNumber?text=$encodedMessage")
        val intent = Intent(Intent.ACTION_VIEW, uri)
        intent.setPackage("com.whatsapp")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            startActivityElevated(intent)
        } catch (e: Exception) {
            return call.reject("Could not open WhatsApp. Is it installed?")
        }

        // Runs on the plugin's background thread — safe to block/poll here.
        Thread {
            val service = ZoyaAccessibilityService.instance
            if (service == null) {
                call.resolve(JSObject()
                    .put("success", false)
                    .put("message", "Opened WhatsApp with the message pre-filled, but Accessibility Service isn't active so I couldn't tap Send automatically. Ask the user to tap Send themselves."))
                return@Thread
            }
            val ready = service.waitForPackageWindow("com.whatsapp", 15000)
            if (!ready) {
                call.resolve(JSObject()
                    .put("success", false)
                    .put("message", "WhatsApp did not open in time. Ask the user to check their connection or try again."))
                return@Thread
            }
            val sent = service.tapWhatsAppSendButton()
            call.resolve(JSObject()
                .put("success", sent)
                .put("message", if (sent) "WhatsApp message sent." else "Message is pre-filled in WhatsApp but the Send button could not be found automatically by label/id. Call readScreen and tapAtCoordinates on the send icon (usually bottom-right of the compose bar) yourself."))
        }.start()
    }

    /**
     * Starts [intent] preferring the AccessibilityService's elevated context, which is exempt
     * from Android's restriction on backgrounded apps starting new activities — falls back to
     * the plugin's normal context if the service isn't available. Use this for ALL app-opening
     * intents so they keep working even when Zoya itself isn't currently in the foreground.
     */
    private fun startActivityElevated(intent: Intent) {
        val launched = ZoyaAccessibilityService.instance?.launchIntentElevated(intent) ?: false
        if (!launched) {
            context.startActivity(intent)
        }
    }

    private fun resolveContactNumber(name: String): String? {
        val resolver = context.contentResolver
        val uri = android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI
        val projection = arrayOf(
            android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER,
            android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME
        )
        val selection = "${android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?"
        val selectionArgs = arrayOf("%$name%")
        resolver.query(uri, projection, selection, selectionArgs, null)?.use { cursor ->
            val numberIndex = cursor.getColumnIndex(android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER)
            if (cursor.moveToFirst() && numberIndex >= 0) {
                return cursor.getString(numberIndex)
            }
        }
        return null
    }

    // ---------------- Telegram automation ----------------

    @PluginMethod
    fun sendTelegramMessage(call: PluginCall) {
        val username = call.getString("username")
        val message = call.getString("message") ?: return call.reject("message required")
        if (username.isNullOrBlank()) {
            return call.reject("username required (the person's Telegram @handle, without @)")
        }
        val cleanUsername = username.removePrefix("@")
        val encodedMessage = Uri.encode(message)
        val uri = Uri.parse("https://t.me/$cleanUsername?text=$encodedMessage")
        val intent = Intent(Intent.ACTION_VIEW, uri)
        intent.setPackage("org.telegram.messenger")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            startActivityElevated(intent)
        } catch (e: Exception) {
            return call.reject("Could not open Telegram. Is it installed?")
        }

        Thread {
            val service = ZoyaAccessibilityService.instance
            if (service == null) {
                call.resolve(JSObject()
                    .put("success", false)
                    .put("message", "Opened Telegram with the message pre-filled, but Accessibility Service isn't active so I couldn't tap Send automatically. Ask the user to tap Send."))
                return@Thread
            }
            val ready = service.waitForPackageWindow("org.telegram.messenger", 15000)
            if (!ready) {
                call.resolve(JSObject()
                    .put("success", false)
                    .put("message", "Telegram did not open in time. Ask the user to try again."))
                return@Thread
            }
            val sent = service.tapTelegramSendButton()
            call.resolve(JSObject()
                .put("success", sent)
                .put("message", if (sent) "Telegram message sent." else "Message is pre-filled in Telegram but the Send button could not be found automatically by label/id. Call readScreen and tapAtCoordinates on the send icon (usually bottom-right of the compose bar) yourself."))
        }.start()
    }

    // ---------------- YouTube automation ----------------

    @PluginMethod
    fun searchYouTube(call: PluginCall) {
        val query = call.getString("query") ?: return call.reject("query required")
        val uri = Uri.parse("https://www.youtube.com/results?search_query=${Uri.encode(query)}")
        val intent = Intent(Intent.ACTION_VIEW, uri)
        intent.setPackage("com.google.android.youtube")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            startActivityElevated(intent)
        } catch (e: Exception) {
            // YouTube app not installed / intent failed — fall back to browser
            val fallback = Intent(Intent.ACTION_VIEW, uri)
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivityElevated(fallback)
        }
        call.resolve(JSObject().put("success", true))
    }

    // ---------------- Google Search automation ----------------

    @PluginMethod
    fun googleSearch(call: PluginCall) {
        val query = call.getString("query") ?: return call.reject("query required")
        val uri = Uri.parse("https://www.google.com/search?q=${Uri.encode(query)}")
        val intent = Intent(Intent.ACTION_VIEW, uri)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            startActivityElevated(intent)
            call.resolve(JSObject().put("success", true))
        } catch (e: Exception) {
            call.reject("Could not open search: ${e.message}")
        }
    }

    // ---------------- Facebook Messenger automation ----------------

    @PluginMethod
    fun openMessengerChat(call: PluginCall) {
        val username = call.getString("username") ?: return call.reject("username required (the person's Messenger username)")
        val uri = Uri.parse("https://m.me/$username")
        val intent = Intent(Intent.ACTION_VIEW, uri)
        intent.setPackage("com.facebook.orca")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            startActivityElevated(intent)
        } catch (e: Exception) {
            val fallback = Intent(Intent.ACTION_VIEW, uri)
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivityElevated(fallback)
        }
        call.resolve(JSObject().put("success", true))
    }
}
