# Play Store release runbook — Ireland's Tides (RWB Tides)

Everything needed to ship the app to Google Play. The CI builds a **signed AAB**; you handle the
signing key (Claude never touches keys). App id is **`com.rwbapps.rwbtides`** (permanent — must match
the Play Console package name exactly).

## 0. One-time: set the privacy-policy contact
`privacy-policy.html` has a `CONTACT_EMAIL_PLACEHOLDER`. Replace both occurrences with a real contact
email, commit, and push. Once GitHub Pages redeploys, the policy is live at:

> https://cmurph00.github.io/roaring-water-bay-tides/privacy-policy.html

That URL goes in the Play Console (Store listing → Privacy policy).

## 1. Generate the upload keystore (you do this, once — keep it forever)
```bash
keytool -genkeypair -v \
  -keystore upload-keystore.jks -alias rwbtides \
  -keyalg RSA -keysize 2048 -validity 10000
```
Choose a strong keystore password and key password (can be the same). **Back this file + passwords up
securely** — with Play App Signing this is your *upload* key; losing it means resetting the upload key
via Google support, and losing it *without* Play App Signing would mean never updating the app.

## 2. Add the four GitHub secrets
The release workflow reads these (repo → Settings → Secrets and variables → Actions), or via `gh`:
```bash
R=cmurph00/roaring-water-bay-tides
base64 -i upload-keystore.jks | gh secret set ANDROID_KEYSTORE_BASE64 -R "$R"
printf '%s' 'YOUR_KEYSTORE_PASSWORD' | gh secret set ANDROID_KEYSTORE_PASSWORD -R "$R"
printf '%s' 'rwbtides'              | gh secret set ANDROID_KEY_ALIAS       -R "$R"
printf '%s' 'YOUR_KEY_PASSWORD'     | gh secret set ANDROID_KEY_PASSWORD    -R "$R"
```

## 3. Build the signed AAB
GitHub → Actions → **“Android release AAB”** → Run workflow (or push a `v*` tag). Download the
`rwb-tides-release-aab` artifact → `app-release.aab`. (Build uses Node 22 + JDK 21; `versionCode 1`,
`versionName "1.0"` in `android/app/build.gradle` — bump both for each subsequent release.)

## 4. Create the app in Play Console
- **App name:** `Ireland's Tides` (recommended, discoverable) — changeable later.
- **Package name:** `com.rwbapps.rwbtides` — **permanent, must match the AAB.**
- App, free, not primarily for children.
- **Play App Signing:** accept/enrol (Google holds the app signing key; your keystore is the upload key).

## 5. Data Safety form (pre-written answers)
- **Does your app collect or share any user data?** → **No.**
  Rationale: the app has no analytics/ads/accounts and transmits nothing. Coarse location, when
  granted, is used **only on-device** to pick the nearest station and is never stored or sent. Under
  Play's definition (data leaving the device / collected) nothing is collected or shared.
- No data types; no data shared; not processed for third parties.
- (If Play asks about the location *permission*: it's used on-device only, ephemeral, not collected.)

## 6. Content rating
Complete the IARC questionnaire: utility/reference app, no violence/sexual/gambling/user-generated
content → will rate “Everyone / PEGI 3”.

## 7. Store listing assets (checklist)
- **App icon:** 512×512 PNG — `icons/icon-512.png` exists (verify it looks good at store size; the
  current one is a simple generated mark — consider a nicer icon before launch).
- **Feature graphic:** 1024×500 PNG — **TODO, required.** (A tide/coast motif with "Ireland's Tides".)
- **Phone screenshots:** 2–8, PNG/JPG, min 320px side. Capture on device or via the browser at phone
  width: the tide list for a spot, and the map (zoomed to islands). Light and/or dark.
- **Short description** (≤80 chars), e.g.: *Offline tide times for the Irish coast — gauges, beaches, islands.*
- **Full description** (≤4000 chars): offline-first; nearest Marine Institute gauge / EPA beach model;
  county filter; offline map with islands + low-water foreshore; **planning only, not for navigation.**
- **Privacy policy URL:** the Pages URL from step 0.
- **App category:** Weather (or Maps & Navigation... prefer Weather to avoid a "navigation" framing).

## 8. Release
Internal testing track first (add your own Google account as a tester) → verify install + coarse-
location prompt + tides render offline → then promote to Production. Countries: at least Ireland
(plus UK/anywhere you like).

## Gotchas
- `applicationId` (Play id) is `com.rwbapps.rwbtides`; the internal code `namespace` remains
  `com.cmurph00.rwbtides` (harmless — Play only uses `applicationId`). A later `npx cap sync` regen
  could align the namespace, but it is not required.
- Only `ACCESS_COARSE_LOCATION` + `INTERNET` are requested (no precise GPS) — keeps Data Safety and
  the runtime prompt minimal.
- Bump `versionCode` (integer, +1) and `versionName` every release, or Play rejects the upload.
