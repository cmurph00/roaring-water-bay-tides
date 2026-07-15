# Building the Android APK

The app is wrapped with [Capacitor](https://capacitorjs.com/) and built into an Android
APK by a GitHub Actions workflow (`.github/workflows/android.yml`) — there is no local
Android build step, since this repo's dev machines don't carry the Android SDK.

## Trigger a build

Either:

- **GitHub CLI**: `gh workflow run android.yml`
- **Actions tab**: open the repo on GitHub → Actions → "Android debug APK" → Run workflow

The workflow also runs automatically whenever a tag matching `v*` is pushed.

## Download the build

Once the workflow run finishes:

- **GitHub CLI**: `gh run download --name rwb-tides-debug-apk` (run from the repo, after
  the run completes — or pass `--run <run-id>` for a specific run)
- **Actions tab**: open the finished run → Artifacts → `rwb-tides-debug-apk`

## Installing on a device

This is a **debug, unsigned, sideload APK** — not a Play Store release build. To install
it on an Android device or emulator, you'll need to enable "Install unknown apps" (or
"Install from unknown sources") for whichever app you use to open the APK (e.g. Files,
Chrome, or a file transfer app), then open the downloaded `app-debug.apk`.

## What the workflow does

1. Checks out the repo and installs npm dependencies (`npm ci`)
2. Runs `npm run build:www` to assemble the offline web app into `www/` (Capacitor's
   `webDir` — a copy of `index.html`, `src/`, `data/`, `manifest.webmanifest`, `sw.js`,
   and `icons/`; the GitHub Pages site itself is untouched by this process)
3. Sets up JDK 17 (Temurin) and the Android SDK
4. Runs `npx cap sync android` to copy `www/` into the native Android project and sync
   Capacitor plugins
5. Runs `./gradlew assembleDebug` inside `android/` to produce the debug APK
6. Uploads `android/app/build/outputs/apk/debug/app-debug.apk` as the `rwb-tides-debug-apk`
   artifact
