#!/bin/bash
# Run this ONCE, after `npx cap add android`, to wire up full device automation.
set -e

APP_DIR="android/app/src/main/java/com/zoya/ai/assistant"
RES_XML_DIR="android/app/src/main/res/xml"
MANIFEST="android/app/src/main/AndroidManifest.xml"

if [ ! -d "android" ]; then
  echo "ERROR: android/ folder not found. Run 'npx cap add android' first."
  exit 1
fi

mkdir -p "$APP_DIR" "$RES_XML_DIR"

cp native-addon/ZoyaAccessibilityService.kt "$APP_DIR/"
cp native-addon/ZoyaAutomationPlugin.kt "$APP_DIR/"
cp native-addon/accessibility_service_config.xml "$RES_XML_DIR/"

# Register the plugin in MainActivity
cat > "$APP_DIR/MainActivity.java" << 'EOF'
package com.zoya.ai.assistant;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZoyaAutomationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
EOF

# Add CALL_PHONE / SEND_SMS permissions + app-visibility queries (idempotent)
if ! grep -q "CALL_PHONE" "$MANIFEST"; then
  sed -i 's#<application#<uses-permission android:name="android.permission.CALL_PHONE" />\n    <uses-permission android:name="android.permission.SEND_SMS" />\n    <queries><intent><action android:name="android.intent.action.MAIN" /></intent></queries>\n\n    <application#' "$MANIFEST"
  echo "Added CALL_PHONE / SEND_SMS permissions."
fi

# Add QUERY_ALL_PACKAGES so the app can find and launch ANY installed app by name (idempotent)
if ! grep -q "QUERY_ALL_PACKAGES" "$MANIFEST"; then
  sed -i 's#<application#<uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" />\n\n    <application#' "$MANIFEST"
  echo "Added QUERY_ALL_PACKAGES permission."
fi

# Register the accessibility service (idempotent)
if ! grep -q "ZoyaAccessibilityService" "$MANIFEST"; then
  sed -i 's#</application>#    <service android:name=".ZoyaAccessibilityService" android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE" android:exported="false"><intent-filter><action android:name="android.accessibilityservice.AccessibilityService" /></intent-filter><meta-data android:name="android.accessibilityservice" android:resource="@xml/accessibility_service_config" /></service>\n    </application>#' "$MANIFEST"
  echo "Registered ZoyaAccessibilityService."
fi

echo ""
echo "Native automation module installed!"
echo "Next: npx cap sync android"
