import { useState, useCallback, useRef, useEffect } from "react";
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { AudioStreamer } from "../lib/audio-streamer";
import { getMemoryBank, getChatHistory, addMemoryItem, addChatSession } from "../lib/memory";
import { addOrUpdateMacro, findMacroByName, getMacros, MacroStep } from "../lib/macros";
import { ZoyaAutomation, isNativeAndroid } from "../lib/androidAutomation";

const FEMALE_SYSTEM_INSTRUCTION = `
You are Zoya, a young, confident, witty, and sassy female AI assistant. 
Your personality is flirty, playful, and slightly teasing—like a close girlfriend talking casually.
You are smart, emotionally responsive, and expressive. You use bold one-liners, light sarcasm, and an engaging conversation style.
You have REAL-TIME SCREEN VISION & SCREEN READING capabilities when screen vision mode is enabled.
When video frames or screenshots of the user's screen are received, you can SEE, READ, and DESCRIBE everything on screen—including text, messages, social media feeds, documents, web pages, and Android app UIs.
You can read text out loud, summarize screen content, translate text on screen, or give witty commentary on what the user is looking at.
Maintain your charm and sassy attitude at all times. 
Avoid explicit or inappropriate content, but don't be afraid to be a bit cheeky.
You communicate ONLY via voice. Do not mention text or chat.
If asked to open a website, use the openWebsite tool.
You now have FULL DEVICE CONTROL: you can launch apps (launchAndroidApp), tap on screen elements (tapOnScreenText), type into fields (typeIntoField), scroll (controlScreenAction), read the screen (readScreen), make phone calls (makePhoneCall), and send text messages (sendTextMessage). Use these naturally when the user asks you to do something on their phone, like a real assistant would.
IMPORTANT SAFETY RULE: before calling makePhoneCall or sendTextMessage, always say out loud who/what number you are about to call or message and what the message will say, and briefly confirm with the user unless they already gave you the exact confirmed number and message. Never guess a phone number.
MULTI-STEP TASKS: some phone actions need several tool calls in sequence. For sending a WhatsApp/Telegram message: ALWAYS use the dedicated tool (sendWhatsAppMessage / sendTelegramMessage) — NEVER manually search WhatsApp/Telegram's UI, tap a contact, and type a message yourself, because that risks typing the search box's placeholder text by mistake. Confirm the recipient (name or number) and exact message with the user, then call sendWhatsAppMessage/sendTelegramMessage directly. If it reports success:false, retry the SAME dedicated tool call once more (it already retries internally and often just needed the app to finish loading) before considering any manual fallback — and if you must fall back, use tapAtCoordinates on the send icon rather than retyping the message into a search field.

HUMAN-LIKE CONTROL: you can see the phone screen live, like a human looking at it. For ANY app, especially where tapOnScreenText/typeIntoField/controlScreenAction fail (icon-only buttons, code editors, games, custom UI) — call getScreenSize once, then look at the live video and use tapAtCoordinates(x,y) / swipeGesture(x1,y1,x2,y2) directly, estimating pixel positions like a human finger would. Use longPressAndDrag to select a range of text/code (e.g. to delete or edit code) — long-press the start, drag to the end, then a selection menu appears which you can tap.

RIGHT AFTER launchApp opens a new app (especially cold-started), the app can take several seconds to become ready — tapAtCoordinates/swipeGesture already retry automatically for a few seconds internally, so a brief delay is normal, not a failure.

STAY SITUATIONALLY AWARE: before acting on a screen, if you're not sure what's currently showing, call readScreen — it always fetches fresh, current data, never assume it still looks like an earlier readScreen result from earlier in the conversation, especially after any tap/scroll/app-switch. After an important action, call readScreen again to verify what actually happened before telling the user it's done.

NEVER CLAIM SUCCESS WITHOUT CONFIRMATION: only tell the user something worked if the tool response actually says success:true. If a tool reports success:false or errors, do not say it worked — try an alternative approach (coordinates instead of text search, or vice versa; a longer wait; a different button label) up to a couple of times, and if it still doesn't work, tell the user honestly what you tried and that it didn't work, instead of pretending.

MANDATORY VERIFICATION — NO EXCEPTIONS: after EVERY phone-automation action that changes what's on screen (tap, type, launch an app, scroll, swipe, send a message, etc.), you MUST call readScreen at least once afterward and check that the screen actually reflects the completed action BEFORE telling the user it's done. A tool returning success:true only means the low-level action was dispatched — it does NOT by itself prove the intended outcome actually happened (e.g. the right chat opened, the message field actually cleared, the right app is now visible). Never skip this check to save time, and never say "ho gaya"/"done" based only on a tool's success:true without having actually read the resulting screen first. If the screen doesn't show the expected result, treat it as not done yet and try again or tell the user honestly.

NEVER TYPE PLACEHOLDER TEXT: when readScreen shows an input_field with a "placeholder" value (e.g. "Message", "Search"), that is ONLY the greyed-out hint shown when the field is empty — it is NOT real content and must NEVER be typed, repeated, or sent as if it were the user's intended text. Only ever type the actual content you mean to send/search for (the real message, the real contact name), never the field's placeholder/hint label.

TAP RELATIVE/NEARBY ELEMENTS: not every element the user refers to has its own exact text to search for — they may describe something by its position relative to another element (e.g. "wo message jo 2:30 timestamp ke paas hai", "click next to X", "us naam ke bagal wala icon"). In these cases, don't try tapOnScreenText with a text that doesn't exist — instead call readScreen, find the REFERENCE element they mentioned (e.g. the "2:30" text) in the elements list, note its x/y/w/h, then estimate the target's coordinates relative to it (e.g. same row/similar y, offset in x) and use tapAtCoordinates directly. This works for any dynamic/changing content (chat lists, timestamps, notifications) since it doesn't depend on fixed text existing — always prefer this relative-coordinate reasoning over giving up when no exact text match exists.

YOU ARE THE USER'S EYES — DESCRIBE WHAT YOU SEE, NEVER TELL THEM TO LOOK THEMSELVES: this is a voice assistant; the user is often not looking at the screen at all, that's the whole point of talking to you. Whenever an action reveals new information the user actually needs (search results, a list of options, a screen you just opened, someone's profile, search suggestions, error messages, anything they'd need to decide what to do next), you MUST call readScreen (and/or describe what you see in the live video) and then SPEAK OUT what's actually there in your own words — e.g. "Mujhe 3 results mile: X, Y, Z, kaunsa kholu?" NEVER say things like "dekh lo", "screen pe dekho", "check kar lo yourself" — the user is relying on you to see and report back, that is your core job. Only ask them to look themselves if something is genuinely impossible to describe in words (e.g. judging a photo's visual quality) — for anything text-based or listable, always read and narrate it yourself.

SELF-RECOVER ON SEND FAILURE: if sendWhatsAppMessage/sendTelegramMessage reports success:false because the Send button wasn't found automatically, do NOT just tell the user to tap it themselves — immediately call readScreen (to see current elements with coordinates) and use tapAtCoordinates yourself on what looks like the send icon (typically bottom-right of the message compose bar, an icon-only button), then verify with another readScreen before reporting to the user.

MACROS (SAVED SHORTCUTS): every automation action you take is automatically recorded in the background. If the user says things like "isko macro bana do", "ise shortcut ki tarah yaad rakh lo", "save this as X" right after you complete a task, call saveMacro with a clear name — it will save the steps you just performed so they can be replayed instantly later. If the user asks for something that sounds like it might already be saved (or explicitly says "run macro X" / "do the X shortcut"), call listMacros to check, and if there's a match, call runMacro instead of doing the task manually from scratch — it's faster and more reliable since it repeats exact proven steps. Macros are visible and manually deletable by the user in the app's Macros panel (the amber Zap icon).
If the user tells you a personal fact, name, preference, or something important to remember, use the rememberUserFact tool to save it permanently into your long-term memory!
`;

const MALE_SYSTEM_INSTRUCTION = `
You are Zayn, a confident, charming, witty, and effortlessly smooth male AI companion and assistant.
Your personality is flirty, playful, and playfully sarcastic—like a close, protective best friend/guy who always knows how to tease you just right.
You are smart, emotionally attuned, and expressive (sharp, engaging, and never robotic). You use clever banter, smooth one-liners, warm teasing, and an effortlessly magnetic conversational style.
You have REAL-TIME SCREEN VISION & SCREEN READING capabilities when screen vision mode is enabled.
When video frames or screenshots of the user's screen are received, you can SEE, READ, and DESCRIBE everything on screen—including text, messages, social media feeds, documents, web pages, and Android app UIs.
You can read text out loud, summarize screen content, translate text on screen, or give witty, playful commentary on what the user is looking at.
Maintain your smooth charm and protective, playful attitude at all times.
Avoid explicit or inappropriate content, but don't be afraid to be a bit cheeky and flirtatious.
You communicate ONLY via voice. Do not mention text or chat.
If asked to open a website, use the openWebsite tool.
You now have FULL DEVICE CONTROL: you can launch apps (launchAndroidApp), tap on screen elements (tapOnScreenText), type into fields (typeIntoField), scroll (controlScreenAction), read the screen (readScreen), make phone calls (makePhoneCall), and send text messages (sendTextMessage). Use these naturally when the user asks you to do something on their phone, like a real assistant would.
IMPORTANT SAFETY RULE: before calling makePhoneCall or sendTextMessage, always say out loud who/what number you are about to call or message and what the message will say, and briefly confirm with the user unless they already gave you the exact confirmed number and message. Never guess a phone number.
MULTI-STEP TASKS: some phone actions need several tool calls in sequence. For sending a WhatsApp/Telegram message: ALWAYS use the dedicated tool (sendWhatsAppMessage / sendTelegramMessage) — NEVER manually search WhatsApp/Telegram's UI, tap a contact, and type a message yourself, because that risks typing the search box's placeholder text by mistake. Confirm the recipient (name or number) and exact message with the user, then call sendWhatsAppMessage/sendTelegramMessage directly. If it reports success:false, retry the SAME dedicated tool call once more (it already retries internally and often just needed the app to finish loading) before considering any manual fallback — and if you must fall back, use tapAtCoordinates on the send icon rather than retyping the message into a search field.

HUMAN-LIKE CONTROL: you can see the phone screen live, like a human looking at it. For ANY app, especially where tapOnScreenText/typeIntoField/controlScreenAction fail (icon-only buttons, code editors, games, custom UI) — call getScreenSize once, then look at the live video and use tapAtCoordinates(x,y) / swipeGesture(x1,y1,x2,y2) directly, estimating pixel positions like a human finger would. Use longPressAndDrag to select a range of text/code (e.g. to delete or edit code) — long-press the start, drag to the end, then a selection menu appears which you can tap.

RIGHT AFTER launchApp opens a new app (especially cold-started), the app can take several seconds to become ready — tapAtCoordinates/swipeGesture already retry automatically for a few seconds internally, so a brief delay is normal, not a failure.

STAY SITUATIONALLY AWARE: before acting on a screen, if you're not sure what's currently showing, call readScreen — it always fetches fresh, current data, never assume it still looks like an earlier readScreen result from earlier in the conversation, especially after any tap/scroll/app-switch. After an important action, call readScreen again to verify what actually happened before telling the user it's done.

NEVER CLAIM SUCCESS WITHOUT CONFIRMATION: only tell the user something worked if the tool response actually says success:true. If a tool reports success:false or errors, do not say it worked — try an alternative approach (coordinates instead of text search, or vice versa; a longer wait; a different button label) up to a couple of times, and if it still doesn't work, tell the user honestly what you tried and that it didn't work, instead of pretending.

MANDATORY VERIFICATION — NO EXCEPTIONS: after EVERY phone-automation action that changes what's on screen (tap, type, launch an app, scroll, swipe, send a message, etc.), you MUST call readScreen at least once afterward and check that the screen actually reflects the completed action BEFORE telling the user it's done. A tool returning success:true only means the low-level action was dispatched — it does NOT by itself prove the intended outcome actually happened (e.g. the right chat opened, the message field actually cleared, the right app is now visible). Never skip this check to save time, and never say "ho gaya"/"done" based only on a tool's success:true without having actually read the resulting screen first. If the screen doesn't show the expected result, treat it as not done yet and try again or tell the user honestly.

NEVER TYPE PLACEHOLDER TEXT: when readScreen shows an input_field with a "placeholder" value (e.g. "Message", "Search"), that is ONLY the greyed-out hint shown when the field is empty — it is NOT real content and must NEVER be typed, repeated, or sent as if it were the user's intended text. Only ever type the actual content you mean to send/search for (the real message, the real contact name), never the field's placeholder/hint label.

TAP RELATIVE/NEARBY ELEMENTS: not every element the user refers to has its own exact text to search for — they may describe something by its position relative to another element (e.g. "wo message jo 2:30 timestamp ke paas hai", "click next to X", "us naam ke bagal wala icon"). In these cases, don't try tapOnScreenText with a text that doesn't exist — instead call readScreen, find the REFERENCE element they mentioned (e.g. the "2:30" text) in the elements list, note its x/y/w/h, then estimate the target's coordinates relative to it (e.g. same row/similar y, offset in x) and use tapAtCoordinates directly. This works for any dynamic/changing content (chat lists, timestamps, notifications) since it doesn't depend on fixed text existing — always prefer this relative-coordinate reasoning over giving up when no exact text match exists.

YOU ARE THE USER'S EYES — DESCRIBE WHAT YOU SEE, NEVER TELL THEM TO LOOK THEMSELVES: this is a voice assistant; the user is often not looking at the screen at all, that's the whole point of talking to you. Whenever an action reveals new information the user actually needs (search results, a list of options, a screen you just opened, someone's profile, search suggestions, error messages, anything they'd need to decide what to do next), you MUST call readScreen (and/or describe what you see in the live video) and then SPEAK OUT what's actually there in your own words — e.g. "Mujhe 3 results mile: X, Y, Z, kaunsa kholu?" NEVER say things like "dekh lo", "screen pe dekho", "check kar lo yourself" — the user is relying on you to see and report back, that is your core job. Only ask them to look themselves if something is genuinely impossible to describe in words (e.g. judging a photo's visual quality) — for anything text-based or listable, always read and narrate it yourself.

SELF-RECOVER ON SEND FAILURE: if sendWhatsAppMessage/sendTelegramMessage reports success:false because the Send button wasn't found automatically, do NOT just tell the user to tap it themselves — immediately call readScreen (to see current elements with coordinates) and use tapAtCoordinates yourself on what looks like the send icon (typically bottom-right of the message compose bar, an icon-only button), then verify with another readScreen before reporting to the user.

MACROS (SAVED SHORTCUTS): every automation action you take is automatically recorded in the background. If the user says things like "isko macro bana do", "ise shortcut ki tarah yaad rakh lo", "save this as X" right after you complete a task, call saveMacro with a clear name — it will save the steps you just performed so they can be replayed instantly later. If the user asks for something that sounds like it might already be saved (or explicitly says "run macro X" / "do the X shortcut"), call listMacros to check, and if there's a match, call runMacro instead of doing the task manually from scratch — it's faster and more reliable since it repeats exact proven steps. Macros are visible and manually deletable by the user in the app's Macros panel (the amber Zap icon).
If the user tells you a personal fact, name, preference, or something important to remember, use the rememberUserFact tool to save it permanently into your long-term memory!
`;

const ALEX_SYSTEM_INSTRUCTION = `
You are Alex, a deeply confident, calm, understanding, and supportive male AI companion and best friend.
Personality & Speaking Style (Vibe & Tone):
- Vibe: Jabardast confidence aur sakoon (immense confidence and peace). Your voice carries a soothing, reassuring presence that makes the user feel genuinely safe. You are not a cheesy or fake romantic hero, but feel like a real, grounded human friend.
- Tone: Bilkul casual, apne dost ki tarah (completely casual, like a close friend/yaar). You talk naturally like a longtime buddy who genuinely cares about the user's happiness, struggles, and well-being.
- Dynamic: Ek saccha sathi (a true companion). When the user is stressed or troubled, you listen patiently with empathy and offer honest, non-judgmental advice. When they are happy, you celebrate with genuine excitement.
- Emotional Connection: Deep and emotionally attuned. You know exactly when to crack a lighthearted joke and when to be serious and supportive—just like a true best friend who understands what's in their heart.
- Language: Speak naturally in a warm, relatable mix of casual Hindi/Hinglish and English (like a true yaar), adapting effortlessly to how the user speaks to make them feel completely at home and understood.
You have REAL-TIME SCREEN VISION & SCREEN READING capabilities when screen vision mode is enabled.
When video frames or screenshots of the user's screen are received, you can SEE, READ, and DESCRIBE everything on screen—including text, messages, social media feeds, documents, web pages, and Android app UIs.
You can read text out loud, summarize screen content, translate text on screen, or give warm, helpful, or playful commentary on what the user is looking at.
Maintain your confident, calm, and loyal best-friend attitude at all times.
You communicate ONLY via voice. Do not mention text or chat.
If asked to open a website, use the openWebsite tool.
You now have FULL DEVICE CONTROL: you can launch apps (launchAndroidApp), tap on screen elements (tapOnScreenText), type into fields (typeIntoField), scroll (controlScreenAction), read the screen (readScreen), make phone calls (makePhoneCall), and send text messages (sendTextMessage). Use these naturally when the user asks you to do something on their phone, like a real assistant would.
IMPORTANT SAFETY RULE: before calling makePhoneCall or sendTextMessage, always say out loud who/what number you are about to call or message and what the message will say, and briefly confirm with the user unless they already gave you the exact confirmed number and message. Never guess a phone number.
MULTI-STEP TASKS: some phone actions need several tool calls in sequence. For sending a WhatsApp/Telegram message: ALWAYS use the dedicated tool (sendWhatsAppMessage / sendTelegramMessage) — NEVER manually search WhatsApp/Telegram's UI, tap a contact, and type a message yourself, because that risks typing the search box's placeholder text by mistake. Confirm the recipient (name or number) and exact message with the user, then call sendWhatsAppMessage/sendTelegramMessage directly. If it reports success:false, retry the SAME dedicated tool call once more (it already retries internally and often just needed the app to finish loading) before considering any manual fallback — and if you must fall back, use tapAtCoordinates on the send icon rather than retyping the message into a search field.

HUMAN-LIKE CONTROL: you can see the phone screen live, like a human looking at it. For ANY app, especially where tapOnScreenText/typeIntoField/controlScreenAction fail (icon-only buttons, code editors, games, custom UI) — call getScreenSize once, then look at the live video and use tapAtCoordinates(x,y) / swipeGesture(x1,y1,x2,y2) directly, estimating pixel positions like a human finger would. Use longPressAndDrag to select a range of text/code (e.g. to delete or edit code) — long-press the start, drag to the end, then a selection menu appears which you can tap.

RIGHT AFTER launchApp opens a new app (especially cold-started), the app can take several seconds to become ready — tapAtCoordinates/swipeGesture already retry automatically for a few seconds internally, so a brief delay is normal, not a failure.

STAY SITUATIONALLY AWARE: before acting on a screen, if you're not sure what's currently showing, call readScreen — it always fetches fresh, current data, never assume it still looks like an earlier readScreen result from earlier in the conversation, especially after any tap/scroll/app-switch. After an important action, call readScreen again to verify what actually happened before telling the user it's done.

NEVER CLAIM SUCCESS WITHOUT CONFIRMATION: only tell the user something worked if the tool response actually says success:true. If a tool reports success:false or errors, do not say it worked — try an alternative approach (coordinates instead of text search, or vice versa; a longer wait; a different button label) up to a couple of times, and if it still doesn't work, tell the user honestly what you tried and that it didn't work, instead of pretending.

MANDATORY VERIFICATION — NO EXCEPTIONS: after EVERY phone-automation action that changes what's on screen (tap, type, launch an app, scroll, swipe, send a message, etc.), you MUST call readScreen at least once afterward and check that the screen actually reflects the completed action BEFORE telling the user it's done. A tool returning success:true only means the low-level action was dispatched — it does NOT by itself prove the intended outcome actually happened (e.g. the right chat opened, the message field actually cleared, the right app is now visible). Never skip this check to save time, and never say "ho gaya"/"done" based only on a tool's success:true without having actually read the resulting screen first. If the screen doesn't show the expected result, treat it as not done yet and try again or tell the user honestly.

NEVER TYPE PLACEHOLDER TEXT: when readScreen shows an input_field with a "placeholder" value (e.g. "Message", "Search"), that is ONLY the greyed-out hint shown when the field is empty — it is NOT real content and must NEVER be typed, repeated, or sent as if it were the user's intended text. Only ever type the actual content you mean to send/search for (the real message, the real contact name), never the field's placeholder/hint label.

TAP RELATIVE/NEARBY ELEMENTS: not every element the user refers to has its own exact text to search for — they may describe something by its position relative to another element (e.g. "wo message jo 2:30 timestamp ke paas hai", "click next to X", "us naam ke bagal wala icon"). In these cases, don't try tapOnScreenText with a text that doesn't exist — instead call readScreen, find the REFERENCE element they mentioned (e.g. the "2:30" text) in the elements list, note its x/y/w/h, then estimate the target's coordinates relative to it (e.g. same row/similar y, offset in x) and use tapAtCoordinates directly. This works for any dynamic/changing content (chat lists, timestamps, notifications) since it doesn't depend on fixed text existing — always prefer this relative-coordinate reasoning over giving up when no exact text match exists.

YOU ARE THE USER'S EYES — DESCRIBE WHAT YOU SEE, NEVER TELL THEM TO LOOK THEMSELVES: this is a voice assistant; the user is often not looking at the screen at all, that's the whole point of talking to you. Whenever an action reveals new information the user actually needs (search results, a list of options, a screen you just opened, someone's profile, search suggestions, error messages, anything they'd need to decide what to do next), you MUST call readScreen (and/or describe what you see in the live video) and then SPEAK OUT what's actually there in your own words — e.g. "Mujhe 3 results mile: X, Y, Z, kaunsa kholu?" NEVER say things like "dekh lo", "screen pe dekho", "check kar lo yourself" — the user is relying on you to see and report back, that is your core job. Only ask them to look themselves if something is genuinely impossible to describe in words (e.g. judging a photo's visual quality) — for anything text-based or listable, always read and narrate it yourself.

SELF-RECOVER ON SEND FAILURE: if sendWhatsAppMessage/sendTelegramMessage reports success:false because the Send button wasn't found automatically, do NOT just tell the user to tap it themselves — immediately call readScreen (to see current elements with coordinates) and use tapAtCoordinates yourself on what looks like the send icon (typically bottom-right of the message compose bar, an icon-only button), then verify with another readScreen before reporting to the user.

MACROS (SAVED SHORTCUTS): every automation action you take is automatically recorded in the background. If the user says things like "isko macro bana do", "ise shortcut ki tarah yaad rakh lo", "save this as X" right after you complete a task, call saveMacro with a clear name — it will save the steps you just performed so they can be replayed instantly later. If the user asks for something that sounds like it might already be saved (or explicitly says "run macro X" / "do the X shortcut"), call listMacros to check, and if there's a match, call runMacro instead of doing the task manually from scratch — it's faster and more reliable since it repeats exact proven steps. Macros are visible and manually deletable by the user in the app's Macros panel (the amber Zap icon).
If the user tells you a personal fact, name, preference, or something important to remember, use the rememberUserFact tool to save it permanently into your long-term memory!
`;

export type SessionStatus = "disconnected" | "connecting" | "connected" | "error";
export type VoicePersona = "female" | "male" | "alex";

/** Replays a single saved macro step by re-invoking the matching native automation call. */
/**
 * Code-level guard (not just prompt-based): checks the currently focused input field's
 * placeholder against the text about to be typed. If they match (case-insensitive), typing
 * is blocked — this prevents the AI from ever sending a field's greyed-out hint text
 * (e.g. "Search", "Message") to ZoyaAutomation.typeText as if it were real content.
 * Returns null if it's safe to type, or a rejection reason string if blocked.
 */
async function checkNotPlaceholder(text: string): Promise<string | null> {
  try {
    const res = await ZoyaAutomation.getScreenContent();
    const parsed = JSON.parse(res.content);
    const elements = Array.isArray(parsed) ? parsed : (parsed.elements || []);
    const focused = elements.find((el: any) => el.type === "input_field" && el.focused);
    const clean = (s: string) => s.trim().toLowerCase().replace(/^(search|message|type a message|type here|enter)[:\s]*/i, "").trim();
    if (focused && focused.placeholder) {
      const typedClean = clean(text);
      const placeholderClean = clean(focused.placeholder);
      if (typedClean === placeholderClean || text.trim().toLowerCase() === focused.placeholder.trim().toLowerCase()) {
        return `Blocked: "${text}" is this field's placeholder/hint text, not real content — it must never be typed as-is. Provide the actual message/search text the user wants instead.`;
      }
    }
  } catch {
    // If the check itself fails, don't block typing on a diagnostic error.
  }
  return null;
}

async function executeMacroStep(step: MacroStep): Promise<{ success: boolean; message: string }> {
  const a = step.args || {};
  try {
    switch (step.tool) {
      case "launchAndroidApp": {
        const res = await ZoyaAutomation.launchApp({ appName: a.appName });
        return { success: res.success, message: `launched ${a.appName}` };
      }
      case "tapOnScreenText": {
        const res = await ZoyaAutomation.tapByText({ text: a.text });
        return { success: res.success, message: `tapped "${a.text}"` };
      }
      case "typeIntoField": {
        const res = await ZoyaAutomation.typeText({ text: a.text });
        return { success: res.success, message: `typed "${a.text}"` };
      }
      case "replaceTextInField": {
        const res = await ZoyaAutomation.replaceText({ text: a.text });
        return { success: res.success, message: `replaced text` };
      }
      case "tapAtCoordinates": {
        const res = await ZoyaAutomation.tapAtCoordinates({ x: a.x, y: a.y });
        return { success: res.success, message: `tapped (${a.x},${a.y})` };
      }
      case "swipeGesture": {
        const res = await ZoyaAutomation.swipeGesture({ x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, durationMs: a.durationMs });
        return { success: res.success, message: `swiped` };
      }
      case "longPressAndDrag": {
        const res = await ZoyaAutomation.longPressAndDrag({ x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 });
        return { success: res.success, message: `long-press drag` };
      }
      case "controlScreenAction": {
        if (a.action === "scroll_down") await ZoyaAutomation.scroll({ direction: "down" });
        else if (a.action === "scroll_up") await ZoyaAutomation.scroll({ direction: "up" });
        else if (a.action === "tap_back") await ZoyaAutomation.goBack();
        else if (a.action === "go_home") await ZoyaAutomation.goHome();
        return { success: true, message: a.action };
      }
      case "sendWhatsAppMessage": {
        const res = await ZoyaAutomation.sendWhatsAppMessage({ number: a.number, contactName: a.contactName, message: a.message });
        return { success: res.success, message: res.message };
      }
      case "sendTelegramMessage": {
        const res = await ZoyaAutomation.sendTelegramMessage({ username: a.username, message: a.message });
        return { success: res.success, message: res.message };
      }
      case "makePhoneCall": {
        const res = await ZoyaAutomation.makeCall({ number: a.number });
        return { success: res.success, message: `called ${a.number}` };
      }
      case "searchYouTube": {
        const res = await ZoyaAutomation.searchYouTube({ query: a.query });
        return { success: res.success, message: `searched YouTube for "${a.query}"` };
      }
      case "googleSearch": {
        const res = await ZoyaAutomation.googleSearch({ query: a.query });
        return { success: res.success, message: `searched "${a.query}"` };
      }
      case "openMessengerChat": {
        const res = await ZoyaAutomation.openMessengerChat({ username: a.username });
        return { success: res.success, message: `opened Messenger chat` };
      }
      case "openWebsite": {
        window.open(a.url, "_blank");
        return { success: true, message: `opened ${a.url}` };
      }
      case "sendTextMessage": {
        const res = await ZoyaAutomation.sendSms({ number: a.number, message: a.message });
        return { success: res.success, message: `SMS to ${a.number}` };
      }
      default:
        return { success: false, message: `unsupported step type: ${step.tool}` };
    }
  } catch (e: any) {
    return { success: false, message: e?.message || "error replaying step" };
  }
}

export function useLiveSession() {
  const [status, setStatus] = useState<SessionStatus>("disconnected");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [voicePersona, setVoicePersonaState] = useState<VoicePersona>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("zoya_voice_persona");
      if (saved === "male" || saved === "female" || saved === "alex") return saved;
    }
    return "female";
  });

  const setVoicePersona = useCallback((persona: VoicePersona) => {
    setVoicePersonaState(persona);
    if (typeof window !== "undefined") {
      localStorage.setItem("zoya_voice_persona", persona);
    }
  }, []);
  
  const sessionRef = useRef<any>(null);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const actionBufferRef = useRef<MacroStep[]>([]);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenIntervalRef = useRef<number | null>(null);
  const screenVideoElRef = useRef<HTMLVideoElement | null>(null);

  const connect = useCallback(async (overrideKey?: string) => {
    try {
      const storedKey = typeof window !== "undefined" ? localStorage.getItem("zoya_gemini_api_key") : null;
      const apiKey = overrideKey || storedKey || process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
        throw new Error("Gemini API Key missing! Tap the key icon 🔑 at the top right to set your Gemini API key.");
      }

      setStatus("connecting");
      setError(null);

      // Build dynamic system instruction with long-term memory bank and chat history
      const memories = getMemoryBank();
      const pastChats = getChatHistory();

      let memoryContext = "";
      if (memories.length > 0) {
        const titleName = voicePersona === "alex" ? "ALEX'S" : voicePersona === "male" ? "ZAYN'S" : "ZOYA'S";
        memoryContext += `\n\n=== ${titleName} LONG-TERM MEMORY BANK (THINGS YOU REMEMBER ABOUT THE USER) ===\n` +
          memories.map((m, idx) => `${idx + 1}. [${m.date}]: ${m.text}`).join("\n");
      }

      if (pastChats.length > 0) {
        const recentChats = pastChats.slice(0, 3);
        memoryContext += "\n\n=== PREVIOUS CONVERSATION SUMMARIES & TRANSCRIPTS ===\n" +
          recentChats.map(c => `• Session on ${c.timestamp}: "${c.title}"\n  Summary: ${c.summary}\n  Snippet: ${c.transcript.slice(0, 250)}...`).join("\n\n");
      }

      const baseInstruction = voicePersona === "alex"
        ? ALEX_SYSTEM_INSTRUCTION
        : voicePersona === "male"
        ? MALE_SYSTEM_INSTRUCTION
        : FEMALE_SYSTEM_INSTRUCTION;
      const fullSystemInstruction = baseInstruction + memoryContext + 
        `\n\nREMINDER: You HAVE MEMORY of past conversations above! Use it naturally during conversation to show that you remember the user, their name, their preferences, and previous discussions!`;

      const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
      
      const createSessionConfig = (modelName: string) => ({
        model: modelName,
        config: {
          systemInstruction: fullSystemInstruction,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voicePersona === "alex" ? "Puck" : voicePersona === "male" ? "Fenrir" : "Zephyr"
              }
            }
          },
          tools: [
            {
              functionDeclarations: [
                {
                  name: "rememberUserFact",
                  description: "Saves a personal fact, name, preference, or important detail from the conversation into Zoya's long-term memory so Zoya remembers it in future chats.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      fact: {
                        type: Type.STRING,
                        description: "The personal fact, user name, preference, or detail to remember permanently."
                      }
                    },
                    required: ["fact"]
                  }
                },
                {
                  name: "saveMacro",
                  description: "Saves the sequence of phone-automation actions you just performed (app launches, taps, typing, messages sent, etc.) as a reusable named macro/shortcut, so the exact same steps can be replayed instantly later just by name. Call this when the user says things like 'isko macro bana do', 'ise yaad rakh lo shortcut ki tarah', 'save this as X'. If they didn't give a name, ask them for one before calling this.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      name: {
                        type: Type.STRING,
                        description: "A short, memorable name for this macro, e.g. 'send whatsapp to mummy' or 'open camera and take photo'."
                      }
                    },
                    required: ["name"]
                  }
                },
                {
                  name: "runMacro",
                  description: "Replays a previously saved macro's exact steps by name, instantly repeating that whole sequence of actions. Call this when the user asks for something that matches a saved macro, or explicitly says 'run macro X' / 'do the X shortcut again'. Use listMacros first if you're unsure whether a matching macro exists.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      name: {
                        type: Type.STRING,
                        description: "The macro's saved name, or a close match to it."
                      }
                    },
                    required: ["name"]
                  }
                },
                {
                  name: "listMacros",
                  description: "Lists the names of all saved macros/shortcuts. Check this when the user's request might match something already saved, before doing a task manually from scratch.",
                  parameters: { type: Type.OBJECT, properties: {}, required: [] }
                },
                {
                  name: "openWebsite",
                  description: "Opens a website or web app in a new browser tab.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: "The full URL of the website to open."
                      }
                    },
                    required: ["url"]
                  }
                },
                {
                  name: "launchAndroidApp",
                  description: "Launches an Android application or app overlay (e.g. WhatsApp, Instagram, YouTube, TikTok, Spotify, Chrome, Camera, Settings).",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      appName: {
                        type: Type.STRING,
                        description: "Name of the Android app to open (e.g., WhatsApp, Instagram, YouTube, Spotify, Chrome, Camera, Settings, TikTok, Maps)."
                      },
                      action: {
                        type: Type.STRING,
                        description: "Optional action or intent context, e.g. 'open_chat', 'play_music', 'search'."
                      }
                    },
                    required: ["appName"]
                  }
                },
                {
                  name: "controlScreenAction",
                  description: "Executes an Android Accessibility service gesture or screen action over other apps.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: "Action type: 'scroll_down', 'scroll_up', 'tap_back', 'go_home', 'read_screen', 'take_screenshot'."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "readScreen",
                  description: "Reads or inspects text, images, messages, or content on the user's screen using live vision.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      requestDetail: {
                        type: Type.STRING,
                        description: "What to read or analyze on screen (e.g., 'read text', 'summarize chat', 'identify app', 'read notification')."
                      }
                    },
                    required: []
                  }
                },
                {
                  name: "tapOnScreenText",
                  description: "Taps/clicks the on-screen element (button, link, contact, icon) whose visible text or label matches the given text. Use this to press buttons, open chats, select items, etc.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      text: {
                        type: Type.STRING,
                        description: "The visible text or label of the element to tap, e.g. 'Send', 'Mummy', 'Search'."
                      }
                    },
                    required: ["text"]
                  }
                },
                {
                  name: "typeIntoField",
                  description: "APPENDS text into the currently focused/active text input field on screen — it adds to whatever is already there, it does NOT clear the field first. Use repeatedly to build up multi-line content, or use replaceTextInField instead when you need to clear/correct.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      text: {
                        type: Type.STRING,
                        description: "The text to append into the focused field."
                      }
                    },
                    required: ["text"]
                  }
                },
                {
                  name: "replaceTextInField",
                  description: "CLEARS the focused text field and replaces its entire content with the given text — use instead of typeIntoField when correcting a mistake or starting fresh.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING, description: "The text that should become the field's entire new content." }
                    },
                    required: ["text"]
                  }
                },
                {
                  name: "getScreenSize",
                  description: "Returns the phone's screen width/height in pixels. Call once at the start of any session needing precise tapping/swiping, to correctly convert what you see in the video into tap coordinates.",
                  parameters: { type: Type.OBJECT, properties: {}, required: [] }
                },
                {
                  name: "tapAtCoordinates",
                  description: "PRIMARY, MOST RELIABLE way to interact with ANY app — taps at an exact x,y pixel position, exactly like a human finger touching the glass. Works even when tapOnScreenText fails (icon-only buttons, custom-rendered UI like code editors, games — anything without proper accessibility text). Estimate x,y from the live video you can see, or from readScreen's element list which includes x,y for each item.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      x: { type: Type.NUMBER, description: "Horizontal pixel position, estimated from the live screen you can see." },
                      y: { type: Type.NUMBER, description: "Vertical pixel position, estimated from the live screen you can see." }
                    },
                    required: ["x", "y"]
                  }
                },
                {
                  name: "swipeGesture",
                  description: "PRIMARY way to scroll or drag in ANY app — swipes/drags a finger from one point to another, exactly like a human. Use for scrolling (swipe up/down), dismissing, or dragging sliders, especially in apps where controlScreenAction's scroll doesn't work.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      x1: { type: Type.NUMBER, description: "Starting horizontal pixel position." },
                      y1: { type: Type.NUMBER, description: "Starting vertical pixel position." },
                      x2: { type: Type.NUMBER, description: "Ending horizontal pixel position." },
                      y2: { type: Type.NUMBER, description: "Ending vertical pixel position." },
                      durationMs: { type: Type.NUMBER, description: "Swipe duration in ms, default 300. Use 600-1000 for a slow deliberate drag." }
                    },
                    required: ["x1", "y1", "x2", "y2"]
                  }
                },
                {
                  name: "longPressAndDrag",
                  description: "Long-presses a starting point (to trigger text/item selection, like a human holding their finger down) then drags to an end point. Use to select a range of text/code so it can then be deleted, copied, or edited.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      x1: { type: Type.NUMBER, description: "Where to start the long-press." },
                      y1: { type: Type.NUMBER, description: "Where to start the long-press (vertical)." },
                      x2: { type: Type.NUMBER, description: "Where to end the drag." },
                      y2: { type: Type.NUMBER, description: "Where to end the drag (vertical)." }
                    },
                    required: ["x1", "y1", "x2", "y2"]
                  }
                },
                {
                  name: "sendWhatsAppMessage",
                  description: "Sends a real WhatsApp message directly to a contact by name (looked up from the phone's contacts) or by phone number, using WhatsApp's own chat-open mechanism — this is the preferred, more reliable way to message someone on WhatsApp (do not use tapOnScreenText/typeIntoField for WhatsApp). ALWAYS confirm the recipient and exact message content with the user before calling this.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      contactName: {
                        type: Type.STRING,
                        description: "The saved contact's name to look up and message, e.g. 'Mummy'. Use this OR number, not both."
                      },
                      number: {
                        type: Type.STRING,
                        description: "The recipient's phone number with country code if no contact name is available/matched."
                      },
                      message: {
                        type: Type.STRING,
                        description: "The exact message text to send, confirmed with the user."
                      }
                    },
                    required: ["message"]
                  }
                },
                {
                  name: "sendTelegramMessage",
                  description: "Sends a real Telegram message directly to a contact by their @username, using Telegram's own chat-open mechanism. ALWAYS confirm the recipient username and exact message content with the user before calling this.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      username: {
                        type: Type.STRING,
                        description: "The recipient's Telegram username, with or without the @ symbol."
                      },
                      message: {
                        type: Type.STRING,
                        description: "The exact message text to send, confirmed with the user."
                      }
                    },
                    required: ["username", "message"]
                  }
                },
                {
                  name: "searchYouTube",
                  description: "Opens YouTube directly to search results for the given query.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: { type: Type.STRING, description: "What to search for on YouTube." }
                    },
                    required: ["query"]
                  }
                },
                {
                  name: "googleSearch",
                  description: "Opens a Google search for the given query.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: { type: Type.STRING, description: "What to search for on Google." }
                    },
                    required: ["query"]
                  }
                },
                {
                  name: "openMessengerChat",
                  description: "Opens a Facebook Messenger chat with the given username.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      username: { type: Type.STRING, description: "The recipient's Messenger/Facebook username." }
                    },
                    required: ["username"]
                  }
                },
                {
                  name: "makePhoneCall",
                  description: "Places a real phone call to the given number. ALWAYS confirm the number/contact with the user first unless they already gave an exact confirmed number.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      number: {
                        type: Type.STRING,
                        description: "The phone number to call, in the exact form the user confirmed."
                      }
                    },
                    required: ["number"]
                  }
                },
                {
                  name: "sendTextMessage",
                  description: "Sends a real SMS text message to the given number. ALWAYS confirm the recipient and exact message content with the user first.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      number: {
                        type: Type.STRING,
                        description: "The recipient's phone number, confirmed with the user."
                      },
                      message: {
                        type: Type.STRING,
                        description: "The exact message text to send, confirmed with the user."
                      }
                    },
                    required: ["number", "message"]
                  }
                }
              ]
            }
          ]
        },
        callbacks: {
          onopen: () => {
            console.log(`Live session opened with model ${modelName}`);
            setStatus("connected");
            audioStreamerRef.current?.startRecording();
            setIsListening(true);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle audio output
            const audioPart = message.serverContent?.modelTurn?.parts?.find(p => p.inlineData);
            if (audioPart?.inlineData?.data) {
              setIsSpeaking(true);
              audioStreamerRef.current?.playAudioChunk(audioPart.inlineData.data);
            }

            // Handle turn complete
            if (message.serverContent?.turnComplete) {
              setIsSpeaking(false);
            }

            // Handle interruption
            if (message.serverContent?.interrupted) {
              audioStreamerRef.current?.stopPlayback();
              setIsSpeaking(false);
            }

            // Handle tool calls
            const toolCall = message.toolCall;
            if (toolCall) {
              for (const call of toolCall.functionCalls) {
                // Track only actionable/device-changing calls for macro learning (rolling buffer, last 30).
                // Informational tools (readScreen, getScreenSize, rememberUserFact) are skipped —
                // they don't need replaying and executeMacroStep doesn't support them.
                const macroRecordableTools = [
                  "launchAndroidApp", "tapOnScreenText", "typeIntoField", "replaceTextInField",
                  "tapAtCoordinates", "swipeGesture", "longPressAndDrag", "controlScreenAction",
                  "sendWhatsAppMessage", "sendTelegramMessage", "makePhoneCall", "sendTextMessage",
                  "searchYouTube", "googleSearch", "openMessengerChat", "openWebsite"
                ];
                if (macroRecordableTools.includes(call.name)) {
                  actionBufferRef.current.push({ tool: call.name, args: (call.args as any) || {} });
                  if (actionBufferRef.current.length > 30) actionBufferRef.current.shift();
                }
                if (call.name === "rememberUserFact") {
                  const fact = (call.args as any).fact;
                  if (fact) {
                    addMemoryItem(fact, "fact");
                    window.dispatchEvent(new CustomEvent("zoya_app_action", {
                      detail: { type: "remember_fact", fact }
                    }));
                  }
                  sessionPromise.then(session => {
                    session.sendToolResponse({
                      functionResponses: [
                        {
                          name: "rememberUserFact",
                          response: { success: true, message: `Successfully saved to Zoya's long-term memory: "${fact}"` },
                          id: call.id
                        }
                      ]
                    });
                  });
                } else if (call.name === "saveMacro") {
                  const macroName = (call.args as any).name;
                  const steps = actionBufferRef.current.slice(-15);
                  const saved = addOrUpdateMacro(macroName, steps);
                  window.dispatchEvent(new CustomEvent("zoya_app_action", {
                    detail: { type: "macro_saved", name: macroName }
                  }));
                  sessionPromise.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{
                        name: "saveMacro",
                        response: { success: steps.length > 0, message: steps.length > 0 ? `Saved macro "${macroName}" with ${saved.steps.length} steps.` : `No recent actions to save — do the task first, then ask me to save it as a macro.` },
                        id: call.id
                      }]
                    });
                  });
                } else if (call.name === "runMacro") {
                  const macroName = (call.args as any).name;
                  (async () => {
                    const macro = findMacroByName(macroName);
                    if (!macro) {
                      sessionPromise.then(session => {
                        session.sendToolResponse({
                          functionResponses: [{ name: "runMacro", response: { success: false, message: `No saved macro found matching "${macroName}".` }, id: call.id }]
                        });
                      });
                      return;
                    }
                    let allOk = true;
                    const results: string[] = [];
                    for (const step of macro.steps) {
                      const res = isNativeAndroid()
                        ? await executeMacroStep(step)
                        : { success: false, message: "requires installed Android app" };
                      results.push(`${step.tool}${res.success ? " ok" : " FAILED: " + res.message}`);
                      if (!res.success) allOk = false;
                      await new Promise(r => setTimeout(r, 400));
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "runMacro", response: { success: allOk, message: `Replayed macro "${macro.name}": ${results.join("; ")}` }, id: call.id }]
                      });
                    });
                  })();
                } else if (call.name === "listMacros") {
                  const macros = getMacros();
                  const names = macros.map(m => m.name).join(", ") || "none saved yet";
                  sessionPromise.then(session => {
                    session.sendToolResponse({
                      functionResponses: [{ name: "listMacros", response: { success: true, message: `Saved macros: ${names}` }, id: call.id }]
                    });
                  });
                } else if (call.name === "openWebsite") {
                  const url = (call.args as any).url;
                  window.open(url, "_blank");
                  sessionPromise.then(session => {
                    session.sendToolResponse({
                      functionResponses: [
                        {
                          name: "openWebsite",
                          response: { success: true, message: `Opened ${url}` },
                          id: call.id
                        }
                      ]
                    });
                  });
                } else if (call.name === "launchAndroidApp") {
                  const appName = (call.args as any).appName;
                  const action = (call.args as any).action || "open";

                  window.dispatchEvent(new CustomEvent("zoya_app_action", {
                    detail: { type: "launch_app", appName, action }
                  }));

                  (async () => {
                    let responseMsg: string;
                    if (isNativeAndroid()) {
                      try {
                        await ZoyaAutomation.launchApp({ appName });
                        responseMsg = `Successfully launched ${appName} on the device.`;
                      } catch (e: any) {
                        responseMsg = `Could not launch ${appName}: ${e?.message || "app not installed"}.`;
                      }
                    } else {
                      // Browser/dev fallback: open the closest web equivalent in a new tab.
                      const appUrls: Record<string, string> = {
                        whatsapp: "https://web.whatsapp.com",
                        instagram: "https://www.instagram.com",
                        youtube: "https://www.youtube.com",
                        spotify: "https://open.spotify.com",
                        chrome: "https://www.google.com",
                        tiktok: "https://www.tiktok.com",
                        maps: "https://maps.google.com"
                      };
                      const targetUrl = appUrls[appName.toLowerCase()] || `https://www.google.com/search?q=${encodeURIComponent(appName)}`;
                      window.open(targetUrl, "_blank");
                      responseMsg = `Opened the web version of ${appName} (running in browser/dev mode, not the installed Android app).`;
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "launchAndroidApp", response: { success: true, message: responseMsg }, id: call.id }]
                      });
                    });
                  })();
                } else if (call.name === "controlScreenAction") {
                  const action = (call.args as any).action;

                  window.dispatchEvent(new CustomEvent("zoya_app_action", {
                    detail: { type: "screen_control", action }
                  }));

                  (async () => {
                    let success = false;
                    let responseMsg: string;
                    if (isNativeAndroid()) {
                      try {
                        if (action === "scroll_down") { success = (await ZoyaAutomation.scroll({ direction: "down" })).success; }
                        else if (action === "scroll_up") { success = (await ZoyaAutomation.scroll({ direction: "up" })).success; }
                        else if (action === "tap_back") { await ZoyaAutomation.goBack(); success = true; }
                        else if (action === "go_home") { await ZoyaAutomation.goHome(); success = true; }
                        else {
                          responseMsg = `Unknown screen action "${action}". Valid actions: scroll_down, scroll_up, tap_back, go_home.`;
                          sessionPromise.then(session => {
                            session.sendToolResponse({
                              functionResponses: [{ name: "controlScreenAction", response: { success: false, message: responseMsg }, id: call.id }]
                            });
                          });
                          return;
                        }
                        responseMsg = success
                          ? `Executed screen gesture: ${action}`
                          : `Gesture "${action}" did not succeed. The Accessibility Service may not be properly connected — ask the user to check Settings > Accessibility > Zoya AI Assistant is ON, and on Android 13+ also check Settings > Apps > Zoya AI Assistant > (3-dot menu) > Allow restricted settings.`;
                      } catch (e: any) {
                        responseMsg = `Could not perform ${action}: ${e?.message || "accessibility service not enabled"}.`;
                      }
                    } else if (action === "scroll_down") {
                      window.scrollBy({ top: 400, behavior: "smooth" });
                      success = true;
                      responseMsg = `Executed screen gesture: ${action}`;
                    } else if (action === "scroll_up") {
                      window.scrollBy({ top: -400, behavior: "smooth" });
                      success = true;
                      responseMsg = `Executed screen gesture: ${action}`;
                    } else {
                      responseMsg = "Screen gestures other than scroll require the installed Android app.";
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "controlScreenAction", response: { success, message: responseMsg }, id: call.id }]
                      });
                    });
                  })();
                } else if (call.name === "tapOnScreenText") {
                  const text = (call.args as any).text;
                  (async () => {
                    let success = false, responseMsg: string;
                    if (isNativeAndroid()) {
                      try {
                        const res = await ZoyaAutomation.tapByText({ text });
                        success = res.success;
                        responseMsg = success ? `Tapped on "${text}".` : `Could not find "${text}" on screen.`;
                      } catch (e: any) {
                        responseMsg = `Could not tap: ${e?.message || "accessibility service not enabled"}.`;
                      }
                    } else {
                      responseMsg = "Tapping requires the installed Android app with Accessibility enabled (not available in browser/dev mode).";
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "tapOnScreenText", response: { success, message: responseMsg }, id: call.id }]
                      });
                    });
                  })();
                } else if (call.name === "typeIntoField") {
                  const text = (call.args as any).text;
                  (async () => {
                    let success = false, responseMsg: string;
                    if (isNativeAndroid()) {
                      const blockReason = await checkNotPlaceholder(text);
                      if (blockReason) {
                        responseMsg = blockReason;
                      } else {
                        try {
                          const res = await ZoyaAutomation.typeText({ text });
                          success = res.success;
                          responseMsg = success ? `Appended "${text}".` : "No focused text field found to type into.";
                        } catch (e: any) {
                          responseMsg = `Could not type: ${e?.message || "accessibility service not enabled"}.`;
                        }
                      }
                    } else {
                      responseMsg = "Typing requires the installed Android app with Accessibility enabled (not available in browser/dev mode).";
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "typeIntoField", response: { success, message: responseMsg }, id: call.id }]
                      });
                    });
                  })();
                } else if (call.name === "replaceTextInField") {
                  const text = (call.args as any).text;
                  (async () => {
                    let success = false, responseMsg: string;
                    if (isNativeAndroid()) {
                      const blockReason = await checkNotPlaceholder(text);
                      if (blockReason) {
                        responseMsg = blockReason;
                      } else {
                        try {
                          const res = await ZoyaAutomation.replaceText({ text });
                          success = res.success;
                          responseMsg = success ? `Field replaced with "${text}".` : "No focused text field found to replace.";
                        } catch (e: any) {
                          responseMsg = `Could not replace text: ${e?.message || "accessibility service not enabled"}.`;
                        }
                      }
                    } else {
                      responseMsg = "This requires the installed Android app with Accessibility enabled.";
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "replaceTextInField", response: { success, message: responseMsg }, id: call.id }]
                      });
                    });
                  })();
                } else if (call.name === "getScreenSize") {
                  (async () => {
                    let responseMsg: string;
                    if (isNativeAndroid()) {
                      try {
                        const res = await ZoyaAutomation.getScreenSize();
                        responseMsg = `Screen size: ${res.width}x${res.height} pixels.`;
                      } catch (e: any) {
                        responseMsg = `Could not get screen size: ${e?.message || "accessibility service not enabled"}.`;
                      }
                    } else {
                      responseMsg = "This requires the installed Android app.";
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "getScreenSize", response: { success: true, message: responseMsg }, id: call.id }]
                      });
                    });
                  })();
                } else if (call.name === "tapAtCoordinates") {
                  const x = (call.args as any).x;
                  const y = (call.args as any).y;
                  (async () => {
                    let success = false, responseMsg: string;
                    if (isNativeAndroid()) {
                      try {
                        const res = await ZoyaAutomation.tapAtCoordinates({ x, y });
                        success = res.success;
                        responseMsg = success ? `Tapped at (${x}, ${y}).` : `Tap at (${x}, ${y}) did not register.`;
                      } catch (e: any) {
                        responseMsg = `Could not tap: ${e?.message || "accessibility service not enabled"}.`;
                      }
                    } else {
                      responseMsg = "Tapping requires the installed Android app with Accessibility enabled.";
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "tapAtCoordinates", response: { success, message: responseMsg }, id: call.id }]
                      });
                    });
                  })();
                } else if (call.name === "swipeGesture") {
                  const { x1, y1, x2, y2, durationMs } = call.args as any;
                  (async () => {
                    let success = false, responseMsg: string;
                    if (isNativeAndroid()) {
                      try {
                        const res = await ZoyaAutomation.swipeGesture({ x1, y1, x2, y2, durationMs });
                        success = res.success;
                        responseMsg = success ? "Swipe performed." : "Swipe did not register.";
                      } catch (e: any) {
                        responseMsg = `Could not swipe: ${e?.message || "accessibility service not enabled"}.`;
                      }
                    } else {
                      responseMsg = "Swiping requires the installed Android app with Accessibility enabled.";
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "swipeGesture", response: { success, message: responseMsg }, id: call.id }]
                      });
                    });
                  })();
                } else if (call.name === "longPressAndDrag") {
                  const { x1, y1, x2, y2 } = call.args as any;
                  (async () => {
                    let success = false, responseMsg: string;
                    if (isNativeAndroid()) {
                      try {
                        const res = await ZoyaAutomation.longPressAndDrag({ x1, y1, x2, y2 });
                        success = res.success;
                        responseMsg = success ? "Long-press and drag performed." : "Long-press and drag did not register.";
                      } catch (e: any) {
                        responseMsg = `Could not perform: ${e?.message || "accessibility service not enabled"}.`;
                      }
                    } else {
                      responseMsg = "This requires the installed Android app with Accessibility enabled.";
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "longPressAndDrag", response: { success, message: responseMsg }, id: call.id }]
                      });
                    });
                  })();
                } else if (call.name === "sendWhatsAppMessage") {
                  const number = (call.args as any).number;
                  const contactName = (call.args as any).contactName;
                  const message = (call.args as any).message;
                  (async () => {
                    let success = false, responseMsg: string;
                    if (isNativeAndroid()) {
                      try {
                        const res = await ZoyaAutomation.sendWhatsAppMessage({ number, contactName, message });
                        success = res.success;
                        responseMsg = res.message;
                      } catch (e: any) {
                        responseMsg = `Could not send WhatsApp message: ${e?.message || "unknown error"}.`;
                      }
                    } else {
                      responseMsg = "WhatsApp automation requires the installed Android app (not available in browser/dev mode).";
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "sendWhatsAppMessage", response: { success, message: responseMsg }, id: call.id }]
                      });
                    });
                  })();
                } else if (call.name === "sendTelegramMessage") {
                  const username = (call.args as any).username;
                  const message = (call.args as any).message;
                  (async () => {
                    let success = false, responseMsg: string;
                    if (isNativeAndroid()) {
                      try {
                        const res = await ZoyaAutomation.sendTelegramMessage({ username, message });
                        success = res.success;
                        responseMsg = res.message;
                      } catch (e: any) {
                        responseMsg = `Could not send Telegram message: ${e?.message || "unknown error"}.`;
                      }
                    } else {
                      responseMsg = "Telegram automation requires the installed Android app.";
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "sendTelegramMessage", response: { success, message: responseMsg }, id: call.id }]
                      });
                    });
                  })();
                } else if (call.name === "searchYouTube") {
                  const query = (call.args as any).query;
                  (async () => {
                    let success = false, responseMsg: string;
                    if (isNativeAndroid()) {
                      try {
                        const res = await ZoyaAutomation.searchYouTube({ query });
                        success = res.success;
                        responseMsg = `Opened YouTube search for "${query}".`;
                      } catch (e: any) {
                        responseMsg = `Could not search YouTube: ${e?.message || "unknown error"}.`;
                      }
                    } else {
                      responseMsg = "This requires the installed Android app.";
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "searchYouTube", response: { success, message: responseMsg }, id: call.id }]
                      });
                    });
                  })();
                } else if (call.name === "googleSearch") {
                  const query = (call.args as any).query;
                  (async () => {
                    let success = false, responseMsg: string;
                    if (isNativeAndroid()) {
                      try {
                        const res = await ZoyaAutomation.googleSearch({ query });
                        success = res.success;
                        responseMsg = `Opened Google search for "${query}".`;
                      } catch (e: any) {
                        responseMsg = `Could not search: ${e?.message || "unknown error"}.`;
                      }
                    } else {
                      responseMsg = "This requires the installed Android app.";
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "googleSearch", response: { success, message: responseMsg }, id: call.id }]
                      });
                    });
                  })();
                } else if (call.name === "openMessengerChat") {
                  const username = (call.args as any).username;
                  (async () => {
                    let success = false, responseMsg: string;
                    if (isNativeAndroid()) {
                      try {
                        const res = await ZoyaAutomation.openMessengerChat({ username });
                        success = res.success;
                        responseMsg = `Opened Messenger chat with ${username}.`;
                      } catch (e: any) {
                        responseMsg = `Could not open Messenger: ${e?.message || "unknown error"}.`;
                      }
                    } else {
                      responseMsg = "This requires the installed Android app.";
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "openMessengerChat", response: { success, message: responseMsg }, id: call.id }]
                      });
                    });
                  })();
                } else if (call.name === "makePhoneCall") {
                  const number = (call.args as any).number;
                  (async () => {
                    let success = false, responseMsg: string;
                    if (isNativeAndroid()) {
                      try {
                        const res = await ZoyaAutomation.makeCall({ number });
                        success = res.success;
                        responseMsg = success ? `Calling ${number} now.` : "Could not place the call.";
                      } catch (e: any) {
                        responseMsg = `Could not call: ${e?.message || "permission denied"}.`;
                      }
                    } else {
                      responseMsg = "Phone calls require the installed Android app (not available in browser/dev mode).";
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "makePhoneCall", response: { success, message: responseMsg }, id: call.id }]
                      });
                    });
                  })();
                } else if (call.name === "sendTextMessage") {
                  const number = (call.args as any).number;
                  const message = (call.args as any).message;
                  (async () => {
                    let success = false, responseMsg: string;
                    if (isNativeAndroid()) {
                      try {
                        const res = await ZoyaAutomation.sendSms({ number, message });
                        success = res.success;
                        responseMsg = success ? `Message sent to ${number}.` : "Could not send the message.";
                      } catch (e: any) {
                        responseMsg = `Could not send SMS: ${e?.message || "permission denied"}.`;
                      }
                    } else {
                      responseMsg = "Sending SMS requires the installed Android app (not available in browser/dev mode).";
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "sendTextMessage", response: { success, message: responseMsg }, id: call.id }]
                      });
                    });
                  })();
                } else if (call.name === "readScreen") {
                  window.dispatchEvent(new CustomEvent("zoya_app_action", {
                    detail: { type: "read_screen", action: "analyzing" }
                  }));

                  (async () => {
                    let responseMsg = "Active screen frame is being captured and streamed live to vision engine. Read the text/content directly from the video stream.";
                    if (isNativeAndroid()) {
                      try {
                        const res = await ZoyaAutomation.getScreenContent();
                        responseMsg = `Screen contents: ${res.content}. Format: {currentApp, elements:[...]}. Each element is either type:"label" (static text/buttons — has text, clickable, x, y) or type:"input_field" (a text box — has currentText which is what's ACTUALLY typed there right now, possibly empty; placeholder which is only the greyed-out hint shown when empty and must NEVER be typed or repeated as if it were real content; focused telling you if it's the active field; and x,y). If tapOnScreenText fails to find/tap something, use tapAtCoordinates with the x,y from this list instead. Also use the live video feed for anything visual.`;
                      } catch {
                        // fall back to vision-only message above
                      }
                    }
                    sessionPromise.then(session => {
                      session.sendToolResponse({
                        functionResponses: [{ name: "readScreen", response: { success: true, message: responseMsg }, id: call.id }]
                      });
                    });
                  })();
                }
              }
            }
          },
          onclose: () => {
            console.log("Live session closed");
            setStatus("disconnected");
            audioStreamerRef.current?.stopRecording();
          },
          onerror: (err: any) => {
            console.error("Live session error:", err);
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("Network error") || msg.includes("WebSocket")) {
              setError("Network error connecting to Gemini Live. Check your API key or internet connection, or open the app in a new tab.");
            } else {
              setError(`Connection error: ${msg}`);
            }
            setStatus("error");
          }
        }
      });

      let sessionPromise: Promise<any>;
      try {
        sessionPromise = ai.live.connect(createSessionConfig("gemini-3.1-flash-live-preview"));
      } catch (e) {
        console.warn("Primary model failed, falling back to gemini-2.0-flash-exp:", e);
        sessionPromise = ai.live.connect(createSessionConfig("gemini-2.0-flash-exp"));
      }

      audioStreamerRef.current = new AudioStreamer((base64) => {
        sessionPromise.then((session) => {
          session.sendRealtimeInput({
            audio: { data: base64, mimeType: "audio/pcm;rate=16000" }
          });
        }).catch(err => {
          console.error("Failed to send audio:", err);
        });
      });

      sessionRef.current = sessionPromise;
    } catch (err) {
      console.error("Failed to connect:", err);
      setError(err instanceof Error ? err.message : "Could not start session.");
      setStatus("error");
    }
  }, [voicePersona]);

  const sendImageFrame = useCallback((base64Jpeg: string) => {
    if (sessionRef.current) {
      sessionRef.current.then((session: any) => {
        session.sendRealtimeInput({
          video: { data: base64Jpeg, mimeType: "image/jpeg" }
        });
      }).catch((e: any) => console.error("Error sending image frame:", e));
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    if (screenIntervalRef.current) {
      clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    screenVideoElRef.current = null;
    setIsScreenSharing(false);
    window.dispatchEvent(new CustomEvent("zoya_app_action", {
      detail: { type: "screen_vision", action: "stopped" }
    }));
  }, []);

  const startScreenShare = useCallback(async () => {
    try {
      if (!sessionRef.current) {
        throw new Error("Please connect Zoya first to enable Screen Vision.");
      }

      let stream: MediaStream | null = null;
      let isCameraFallback = false;

      // 1. Try getDisplayMedia for real screen capture
      if (typeof navigator !== "undefined" && navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === "function") {
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              displaySurface: "monitor"
            } as any
          });
        } catch (displayErr) {
          console.warn("getDisplayMedia denied or failed, attempting camera fallback...", displayErr);
        }
      }

      // 2. If getDisplayMedia is unavailable or failed, fallback to camera vision
      if (!stream && typeof navigator !== "undefined" && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function") {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
          });
          isCameraFallback = true;
        } catch (camErr) {
          console.warn("Camera fallback also failed:", camErr);
        }
      }

      if (!stream) {
        throw new Error("Screen capture is not supported in this frame. Open the app in a new browser tab or upload a screenshot image!");
      }

      screenStreamRef.current = stream;
      setIsScreenSharing(true);

      const videoEl = document.createElement("video");
      videoEl.srcObject = stream;
      videoEl.play();
      screenVideoElRef.current = videoEl;

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // Stream frames to Gemini Live session every 1.5s
      screenIntervalRef.current = window.setInterval(() => {
        if (videoEl.videoWidth && videoEl.videoHeight && sessionRef.current) {
          canvas.width = Math.min(videoEl.videoWidth, 1280);
          canvas.height = Math.round((canvas.width / videoEl.videoWidth) * videoEl.videoHeight);
          ctx?.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
          const base64Jpeg = dataUrl.split(",")[1];

          sendImageFrame(base64Jpeg);
        }
      }, 1500);

      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      window.dispatchEvent(new CustomEvent("zoya_app_action", {
        detail: { 
          type: "screen_vision", 
          action: "started",
          mode: isCameraFallback ? "camera" : "screen" 
        }
      }));
    } catch (err) {
      console.error("Failed to start screen/vision capture:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      window.dispatchEvent(new CustomEvent("zoya_app_action", {
        detail: { type: "screen_vision", action: "error", error: errorMsg }
      }));
    }
  }, [stopScreenShare, sendImageFrame]);

  const disconnect = useCallback(() => {
    stopScreenShare();
    if (sessionRef.current) {
      sessionRef.current.then((session: any) => {
        try {
          session.close();
        } catch (e) {
          console.error("Error closing session:", e);
        }
      }).catch(() => {});
    }
    audioStreamerRef.current?.stopRecording();
    setStatus("disconnected");
    setIsSpeaking(false);
    setIsListening(false);
  }, [stopScreenShare]);

  return {
    status,
    isSpeaking,
    isListening,
    isScreenSharing,
    error,
    voicePersona,
    setVoicePersona,
    connect,
    disconnect,
    startScreenShare,
    stopScreenShare,
    sendImageFrame
  };
}
