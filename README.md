# Lobby — Android game launcher

Package: `com.muhsin.lobbylauncher` · landscape only · minSdk 26 · no third-party libraries (~200 KB APK)

## Layout
- `app/src/main/java/.../MainActivity.kt` — HOME activity, immersive fullscreen, controller input (GameSir X5 Lite / any Xbox-layout pad: A, B, X, Y, LB/RB, LT/RT, d-pad, sticks), lifecycle (music pauses when a game opens)
- `Bridge.kt` — what the UI can ask the phone: installed apps, launching, icons, usage stats, default-home request, usage-access settings, photo picker, battery
- `ArtFetcher.kt` — artwork + genre lookup: Play Store → IGDB → generated fallback
- `app/src/main/assets/ui/` — the interface (served locally from https://lobby.app/ — no network)
  - `mock.js` lets you open `index.html` in a desktop browser with demo data (keys: Q/E = LB/RB, arrows, Enter = A, Esc = B, Y)

## Build & install
```
./gradlew assembleRelease          # or: gradle assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```
Signing: put `lobby-release.jks` and a `keystore.properties` next to `settings.gradle.kts` (both gitignored):
```
storeFile=lobby-release.jks
storePassword=...
keyAlias=lobby
keyPassword=...
```
Keep the key safe — updates must be signed with the same key. Without it, release builds fall back to the debug key.

## IGDB (optional)
Create a Twitch developer app (dev.twitch.tv › Console › Register Your Application, client type Confidential), then:
```
cp igdb.properties.sample igdb.properties   # fill in the two values
```
`igdb.properties` is gitignored. Note: the values are compiled into the APK, so only share builds you trust.
Without keys the lookup goes Play Store → Generated.

## Debugging the UI on the phone
Open `chrome://inspect` in desktop Chrome with the phone connected over USB.
