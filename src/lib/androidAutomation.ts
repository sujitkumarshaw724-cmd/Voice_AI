import { registerPlugin, Capacitor } from "@capacitor/core";

export interface ZoyaAutomationPlugin {
  isAccessibilityServiceEnabled(): Promise<{ enabled: boolean }>;
  openAccessibilitySettings(): Promise<void>;
  isOverlayPermissionGranted(): Promise<{ granted: boolean }>;
  requestOverlayPermission(): Promise<void>;
  launchApp(options: { appName: string }): Promise<{ success: boolean }>;
  tapByText(options: { text: string }): Promise<{ success: boolean }>;
  tapAtCoordinates(options: { x: number; y: number }): Promise<{ success: boolean }>;
  swipeGesture(options: { x1: number; y1: number; x2: number; y2: number; durationMs?: number }): Promise<{ success: boolean }>;
  longPressAndDrag(options: { x1: number; y1: number; x2: number; y2: number }): Promise<{ success: boolean }>;
  getScreenSize(): Promise<{ width: number; height: number }>;
  typeText(options: { text: string }): Promise<{ success: boolean }>;
  replaceText(options: { text: string }): Promise<{ success: boolean }>;
  scroll(options: { direction: string }): Promise<{ success: boolean }>;
  goBack(): Promise<void>;
  goHome(): Promise<void>;
  getScreenContent(): Promise<{ content: string }>;
  makeCall(options: { number: string }): Promise<{ success: boolean }>;
  sendSms(options: { number: string; message: string }): Promise<{ success: boolean }>;
  sendWhatsAppMessage(options: { number?: string; contactName?: string; message: string }): Promise<{ success: boolean; message: string }>;
  sendTelegramMessage(options: { username: string; message: string }): Promise<{ success: boolean; message: string }>;
  searchYouTube(options: { query: string }): Promise<{ success: boolean }>;
  googleSearch(options: { query: string }): Promise<{ success: boolean }>;
  openMessengerChat(options: { username: string }): Promise<{ success: boolean }>;
}

export const ZoyaAutomation = registerPlugin<ZoyaAutomationPlugin>("ZoyaAutomation");

/** True only when running as the compiled Android app (not a browser tab). */
export const isNativeAndroid = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
