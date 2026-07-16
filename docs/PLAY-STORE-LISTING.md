# Play Store listing — Ireland's Tides (RWB Tides)

Ready-to-paste content for the Play Console “Main store listing”, “App content”, and release pages.
Companion to `PLAY-RELEASE.md` (the build/keystore runbook).

## App details
- **App name:** `Ireland's Tides`
- **Package name:** `com.rwbapps.rwbtides` (permanent)
- **Default language:** English (Ireland) — en-IE (or en-GB)
- **App or game:** App
- **Free or paid:** Free
- **Category:** Weather  *(prefer Weather over Maps & Navigation — the app is planning-only, not a nav aid)*
- **Tags:** tides, weather, marine, beach, Ireland
- **Contact email:** roaringwaterbayapps@gmail.com
- **Website (optional):** https://cmurph00.github.io/roaring-water-bay-tides/
- **Privacy policy URL:** https://cmurph00.github.io/roaring-water-bay-tides/privacy-policy.html

## Short description  (max 80 chars)
```
Offline tide times for the Irish coast — gauges, beaches and islands.
```

## Full description  (max 4000 chars)
```
Ireland's Tides gives you tide predictions for the whole Irish coast — completely offline once installed. No account, no ads, no tracking.

• Nationwide coverage from real sources: Marine Institute tide gauges, EPA beach-model points, and harmonic stations. The app picks the nearest, and validated hand-checks keep the tricky spots (Baltimore, Crookhaven and more) on their most accurate source.
• Multi-day high and low tide tables, shown in each station's own local time.
• Filter by county, search any coastal town or beach, or tap "Use my location".
• An offline map of the whole coast with its islands (Sherkin, Cape Clear, Hare, Long and more), named towns, and a low-water / foreshore layer that shows how far the sea goes out at low tide.
• Light and dark themes. Works with no signal — ideal for the beach, a headland, or a boat mooring.

Data comes from open sources: Marine Institute, EPA and Tailte Éireann / Ordnance Survey Ireland (CC-BY 4.0), GeoNames (CC-BY), NOAA and TICON-4, and Natural Earth.

Planning use only — not for navigation. Tide heights and times are predictions and can be affected by weather; this app is not a nautical chart and must not be relied on for navigation or safety of life at sea.
```

## What's new  (release notes, v1.0)
```
First release. Offline tide predictions for the Irish coast: nearest tide gauge / EPA beach model, multi-day high & low tables in local time, county filter, an offline map with islands, towns and low-water foreshore, and light/dark themes.
```

## App content declarations
- **Privacy policy:** the URL above.
- **Data safety:** *Does your app collect or share any user data?* → **No.** No data types collected; none shared; not processed for third parties. (Coarse location, when granted, is used only on-device to pick the nearest station — never stored or transmitted.)
- **Ads:** No ads.
- **Content rating (IARC questionnaire):** category Reference/Utility; answer No to all violence / sexual / language / controlled-substance / gambling / user-generated-content questions → expected rating **Everyone / PEGI 3**.
- **Target audience:** 13+ (not designed for or directed at children); no children's content.
- **Government app / financial / health:** No.
- **Data collection = none**, so no account deletion URL required.

## Graphic assets
| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512 PNG, 32-bit | `icons/icon-512.png` exists (basic mark — consider a nicer one) |
| Feature graphic | 1024×500 PNG/JPG, no alpha | **TODO — required** |
| Phone screenshots | 2–8, PNG/JPG, 16:9 or 9:16, min 320px side | **TODO** — capture: (1) tide table for a spot, (2) map zoomed to islands, (3) county filter / search. Light and/or dark. |
| Tablet screenshots | optional | skip for v1 |

## Store settings / rollout
- **Countries:** Ireland at minimum (add UK + rest of world freely — the app is Ireland-only in content but harmless elsewhere).
- **Track:** Internal testing first (add your own Google account as tester) → verify offline install + coarse-location prompt + tides render → promote to Production.
