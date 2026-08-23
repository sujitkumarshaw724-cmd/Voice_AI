#!/bin/bash
# Run this ONCE after `npx cap add android` to add mic/camera permissions automatically.
set -e
MANIFEST="android/app/src/main/AndroidManifest.xml"

if [ ! -f "$MANIFEST" ]; then
  echo "ERROR: $MANIFEST not found. Run 'npx cap add android' first."
  exit 1
fi

if grep -q "RECORD_AUDIO" "$MANIFEST"; then
  echo "Permissions already added, skipping."
  exit 0
fi

sed -i 's#<application#<uses-permission android:name="android.permission.RECORD_AUDIO" />\n    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />\n\n    <application#' "$MANIFEST"

echo "Done! RECORD_AUDIO, CAMERA, MODIFY_AUDIO_SETTINGS permissions added to AndroidManifest.xml"
