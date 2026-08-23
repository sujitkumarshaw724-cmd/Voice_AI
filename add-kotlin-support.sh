#!/bin/bash
set -e
ROOT_GRADLE="android/build.gradle"
APP_GRADLE="android/app/build.gradle"

if ! grep -q "kotlin-gradle-plugin" "$ROOT_GRADLE"; then
  sed -i "/classpath 'com.android.tools.build:gradle/a\\        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.24'" "$ROOT_GRADLE"
fi

if ! grep -q "kotlin-android" "$APP_GRADLE"; then
  sed -i "/apply plugin: 'com.android.application'/a\\apply plugin: 'kotlin-android'" "$APP_GRADLE"
fi

if ! grep -q "kotlin-stdlib" "$APP_GRADLE"; then
  sed -i "0,/dependencies {/s//dependencies {\n    implementation \"org.jetbrains.kotlin:kotlin-stdlib:1.9.24\"/" "$APP_GRADLE"
fi

echo "Kotlin support enabled!"
