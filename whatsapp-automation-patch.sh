#!/bin/bash
# Run this to add/update the WhatsApp automation module in an existing android/ project.
set -e

APP_DIR="android/app/src/main/java/com/zoya/ai/assistant"
MANIFEST="android/app/src/main/AndroidManifest.xml"

if [ ! -d "android" ]; then
  echo "ERROR: android/ folder not found. Run 'npx cap add android' first."
  exit 1
fi

cp native-addon/ZoyaAccessibilityService.kt "$APP_DIR/"
cp native-addon/ZoyaAutomationPlugin.kt "$APP_DIR/"
echo "Updated ZoyaAccessibilityService.kt and ZoyaAutomationPlugin.kt"

if ! grep -q "READ_CONTACTS" "$MANIFEST"; then
  sed -i 's#<application#<uses-permission android:name="android.permission.READ_CONTACTS" />\n\n    <application#' "$MANIFEST"
  echo "Added READ_CONTACTS permission."
else
  echo "READ_CONTACTS permission already present."
fi

echo ""
echo "WhatsApp automation module installed! Commit and push to trigger a build."
