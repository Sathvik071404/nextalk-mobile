# NexTalk Mobile

Last updated: 2026-06-04

NexTalk Mobile is the real mobile app version of NexTalk, built with Expo, React Native, and Expo Router. The parent folder has been cleaned up, so this `nextalk-mobile` folder is now the active project.

This app is Android-first and configured to install as its own standalone Android app, separate from Expo Go.

## Current Status

This is a working mobile app prototype with an offline phone-to-phone backend. It has real app structure, navigation, Android app config, polished mobile screens, Google Nearby Connections, an automatic same-Wi-Fi fallback, per-chat encryption, an ephemeral room protocol, and a presentation fallback for demo safety. Discovery shows real nearby/same-Wi-Fi app users, no users when none are available, or clearly labeled demo users only when presentation fallback is enabled.

The app currently demonstrates:

- onboarding with a session-only display name
- nearby discovery with a radar-style scanning screen
- one-to-one chat request flow
- one-to-one chat screen with message bubbles, delivery states, and live nearby payload handling
- Android Nearby Connections advertising, discovery, connection request, accept/reject, disconnect, and byte-message bridge
- automatic Android NSD/TCP same-Wi-Fi discovery and connection fallback
- per-connection ECDH key agreement and AES-GCM encrypted chat payloads
- app-level nearby payload protocol for chat messages, peer-left notices, room IDs, and room-wiped events
- real remote typing indicators and encrypted delivery receipts
- incoming nearby request modal with a pairing code
- outgoing and incoming pairing-code confirmation before accepting a real nearby chat
- permission setup checklist and connection timeline for easier real-phone debugging
- presentation fallback mode for local demo chats when phone radios are unreliable
- live encryption fingerprint badge in chat
- privacy-safe background notifications that never show sender names or message text
- 60-second wipe behavior with a visible countdown when a connected nearby peer leaves/disconnects
- contact info sheet
- visible `End chat` action
- in-session settings for display name and silent mode

Removed by design:

- in-chat `Add more` flow
- group chat expansion
- invite/pending/joined state simulation
- add-more scan overlay
- draggable mini chat window

## What Happened So Far

- A new Expo mobile project was created in `nextalk-mobile`.
- Expo Router is used for route-based screens.
- The app was made Android-first with portrait orientation and Android keyboard resize behavior.
- Onboarding was built with multiple slides and a saved username step.
- Discovery was built with a radar UI and a mocked nearby-user list.
- Chat was built as a focused one-to-one experience.
- Settings were added for display name and silent mode as in-session state only.
- Mobile polish was applied for smaller phones, text sizing, keyboard behavior, and an obvious `End chat` action.
- Version `1.0.1` fixed the username keyboard overlap on Android.
- Version `1.0.2` removed the Add more/group chat feature and simplified chat back to one-to-one.
- Version `1.0.3` removed all app-level persistence for user/session data. Users choose a display name on every app open.
- Version `1.0.4` started the no-internet backend path with a local Expo Android module for Google Nearby Connections.
- Version `1.0.5` added nearby room lifecycle payloads and a visible 60-second wipe countdown for live nearby chats.
- Version `1.0.6` removed fake preview contacts from discovery so the app shows only real nearby app users or an empty state.
- Version `1.0.7` removed the legacy mock chat fallback so fake names cannot be selected through chat routes.
- Version `1.0.8` moved Android nearby permission prompts before native transport startup and added retry/settings actions when permissions are denied.
- Version `1.0.9` switched Nearby Connections to `P2P_CLUSTER` for two-phone mutual discovery and added an on-screen Nearby setup diagnostic panel.
- Version `1.0.10` added explicit Auto/Host/Join discovery modes and aligned `NEARBY_WIFI_DEVICES` with Google's Nearby manifest sample.
- Version `1.0.11` keeps `ACCESS_WIFI_STATE` and `CHANGE_WIFI_STATE` available on Android API 36 after real-phone testing showed Nearby startup error `8032: MISSING_PERMISSION_ACCESS_WIFI_STATE`.
- Version `1.0.12` keeps `ACCESS_COARSE_LOCATION` declared and requested on newer Android builds after real-phone testing showed discovery error `8034: MISSING_PERMISSION_ACCESS_COARSE_LOCATION`.
- Version `1.0.13` keeps `ACCESS_FINE_LOCATION` declared and requested on newer Android builds after real-phone testing showed discovery error `8036: MISSING_PERMISSION_ACCESS_FINE_LOCATION`.
- Version `1.1.0` upgrades the demo flow with a native permission checklist, Host/Join-first discovery, user-confirmed pairing codes, connection timeline, presentation fallback chats, and in-memory session-key badges.
- Version `1.1.1` replaces the default Expo branding with the neon NexTalk chat-bubble logo across the launcher icon, Android adaptive/themed icon, favicon, and splash screen.
- Version `1.2.0` adds automatic same-Wi-Fi fallback discovery, pairing digits tied to the ECDH session, AES-GCM encrypted payloads, live encryption fingerprints, remote typing, delivery receipts, and privacy-safe background message alerts.
- Version `1.2.0` also aligns the project to the current Expo SDK 55 patch packages and adds the standard Expo Metro configuration.
- Version `1.2.1` fixes the Android release build by using the current Android NSD string API for same-Wi-Fi discovery names.
- Version `1.2.2` stabilizes the welcome/onboarding screen on different Android phones by removing oversized decorative background circles, using a bounded scrollable layout, and showing the NexTalk logo as the first hero.
- `docs/ephemeral-backend-plan.md` documents the privacy-first offline transport direction and 60-second wipe rule.
- Android icon, adaptive icon, splash, and app metadata files are present.
- Standalone Android install configuration was added with package name `com.nextalk.mobile` and an EAS preview APK profile.

## Current App Flow

- `/` - onboarding and username setup. The user chooses a name every time the app opens.
- `/discovery` - radar scan, nearby-user list, chat request modal, and settings modal.
- `/chat/[userId]` - one-to-one chat, contact info, message composer, and end chat.

## Real vs Mocked

Real today:

- Expo and React Native app shell
- Expo Router navigation
- session-only display name passed through navigation
- in-memory chat state
- Android native module scaffold for offline Nearby Connections transport
- runtime nearby-device permission request helper
- discovery-time Android permission prompts for Bluetooth/Nearby devices and location on Android versions that require it
- on-screen Nearby setup diagnostics for Android API level, strategy, Google Play Services, Bluetooth, Wi-Fi, Location, and native state events
- explicit Host, Join, and Auto discovery modes for easier two-phone testing
- native permission checklist for Nearby devices, precise location, Wi-Fi state, phone radios, and Google Play Services
- connection timeline for permissions, advertising, discovery, pairing, and connection events
- user-confirmed pairing-code flow before nearby chats are accepted
- native endpoint events wired into the discovery screen
- native byte-message payloads wired into connected chats
- automatic same-Wi-Fi Android NSD/TCP transport wired into the same discovery and pairing flow
- per-connection ECDH key exchange with AES-GCM encrypted application payloads
- nearby payload decoding for `message`, `typing`, `receipt`, `peer_left`, and `room_wiped` events
- in-memory room wipe countdown that locks the composer before clearing the chat
- responsive screen sizing
- keyboard-aware chat layout
- real remote typing and encrypted delivery-receipt state for connected phone chats
- privacy-safe background message notifications controlled by silent mode

Still mocked/simulated today:

- exact physical distance, angle, and presence status
- presentation fallback chats; they are local demo simulations, not cross-phone networking

## Important Files

- `src/app/_layout.tsx` - root Expo Router stack and status bar.
- `src/app/index.tsx` - onboarding, username setup, and initial redirect.
- `src/app/discovery.tsx` - nearby radar, user list, chat request modal, and settings modal.
- `src/app/chat/[userId].tsx` - focused one-to-one chat screen, contact info, and end chat.
- `src/components/nextalk/message-feed.tsx` - message bubbles, system messages, sender names, delivery metadata, and typing dots.
- `src/components/nextalk/message-composer.tsx` - chat input and send button.
- `src/features/nextalk/data.ts` - onboarding copy, ids, real nearby user factory, and helper types.
- `src/features/nextalk/nearby-transport.ts` - TypeScript boundary for Android Nearby/LAN transport, permissions, secure sessions, typing, receipts, and room lifecycle payloads.
- `src/features/nextalk/theme.ts` - shared colors, gradients, and shadow values.
- `modules/nextalk-nearby/android/src/main/java/expo/modules/nextalknearby/NexTalkNearbyModule.kt` - Android native Nearby Connections, same-Wi-Fi TCP, encryption, and background-alert bridge.
- `modules/nextalk-nearby/android/src/main/AndroidManifest.xml` - Nearby, LAN socket, location-adjacent, and notification permissions.
- `modules/nextalk-nearby/android/build.gradle` - native module Gradle config and `play-services-nearby` dependency.
- `docs/ephemeral-backend-plan.md` - no-storage backend rules, session-only identity, and 60-second wipe behavior.
- `app.json` - Expo app metadata, Android package/version, keyboard behavior, icons, splash screen, and typed-routes experiment.
- `eas.json` - EAS Build profiles for development, preview APK, and production release builds.
- `metro.config.js` - standard Expo Metro configuration used for bundling.
- `package.json` - scripts and Expo/React Native dependencies.

## Run the App

From this folder:

```bash
npm install
npm start
```

Run on Android:

```bash
npm run android
```

Other available scripts:

```bash
npm run ios
npm run web
npm run lint
npm run reset-project
```

TypeScript does not currently have a package script, so run it directly:

```bash
npx tsc --noEmit
```

On Windows PowerShell, if `npm` or `npx` is blocked by script execution policy, use the command shims:

```bash
npx.cmd tsc --noEmit
npm.cmd run lint
```

## Quality Checks

Use these before handing the project forward:

```bash
npx.cmd tsc --noEmit
npm.cmd run lint
npx.cmd expo config --type public
```

## Standalone Android Install

The app is configured to install as its own Android app.

Current Android package:

```bash
com.nextalk.mobile
```

Current app version:

```bash
1.2.2
```

Current Android version code:

```bash
19
```

Build a direct-install APK with EAS:

PowerShell:

```powershell
npx.cmd --yes eas-cli@latest login
$env:EAS_NO_VCS='1'
npx.cmd --yes eas-cli@latest build --platform android --profile preview --non-interactive
```

Command Prompt:

```bat
npx.cmd --yes eas-cli@latest login
set EAS_NO_VCS=1
npx.cmd --yes eas-cli@latest build --platform android --profile preview --non-interactive
```

When the build finishes, EAS gives a download link for an `.apk`. Open that link on the phone, download the APK, and install it. Android may ask to allow installs from the browser or file manager.

For Play Store later, use the production profile:

```powershell
$env:EAS_NO_VCS='1'
npx.cmd --yes eas-cli@latest build --platform android --profile production
```

Previous APK builds:

Internal Expo artifact links are intentionally not stored in this GitHub-ready README. Use the Expo/EAS dashboard or GitHub Releases if an APK needs to be shared.

No APK has been built yet for the local `1.2.2` source changes. The first `1.2.0` EAS attempt failed during native Kotlin compilation; `1.2.1` fixes that reported NSD API mismatch, and `1.2.2` fixes the reported onboarding layout inconsistency.

Latest EAS build page:

Use the Expo/EAS dashboard for the latest build page. Account-specific build URLs are intentionally not stored in this README.

Build environment notes:

- Expo login is required before running EAS builds.
- Git is not installed/available in this terminal, so EAS builds use `EAS_NO_VCS=1`.
- `expo-doctor` passes 18 of 19 checks; its remaining `.expo`/Git ignore warning persists because this project intentionally has no Git repository, even though `.expo/` is present in `.gitignore`.
- This machine has Java 17, but Android SDK, `adb`, and local Gradle are not available, so local APK builds cannot be completed here without installing the Android toolchain.

## Known Gaps

- The real Nearby, same-Wi-Fi, encrypted chat, and notification paths in `1.2.2` still need an APK/device test on two Android phones.
- Nearby Connections is Android-only right now; iOS has no matching native module.
- Chat data is in screen state only and is not persisted after leaving a chat or closing the app.
- Chat routes no longer resolve legacy fake contacts; discovery should only show real Nearby or same-Wi-Fi endpoints.
- Encryption is implemented with in-memory ECDH/AES-GCM session keys, but the prototype has not received a formal security audit.
- Same-Wi-Fi fallback uses automatic Android NSD discovery; manual join codes and QR scanning are not included yet.
- Silent mode is session-only and resets when the app process restarts.
- Play Store release work is not complete.
- Final brand polish, privacy policy, screenshots, and release signing still need to happen.

## Recommended Next Steps

1. Build and test version `1.2.2` on two Android phones.
   - The native Nearby Connections layer needs a standalone/development APK because Expo Go cannot load it.
   - Keep both phones on the discovery screen, grant permissions, keep Bluetooth/Wi-Fi/Location enabled, set one phone to `Host` and the other to `Join`, compare the setup checklist and connection timeline, confirm the pairing code, verify the encryption fingerprint matches, send messages, verify remote typing/delivery receipts, then end one chat and confirm the peer sees the 60-second wipe countdown.
   - To test the fallback, put both phones on the same Wi-Fi network/hotspot and confirm a user labeled `Same-Wi-Fi device` appears even if Google Nearby startup fails.

Permission behavior note:

- Android may combine Bluetooth and Wi-Fi discovery under a single `Nearby devices` permission prompt.
- `ACCESS_WIFI_STATE` and `CHANGE_WIFI_STATE` are manifest permissions and usually do not show separate runtime popups. They are still declared for Android API 36 because real-phone testing hit `MISSING_PERMISSION_ACCESS_WIFI_STATE`.
- Location is requested because real Google Play Services Nearby testing on Android API 36 still requires coarse and fine location before discovery. If Android shows a Precise/Approximate choice, choose `Precise`.
- If the app already says Location is allowed but discovery reports `MISSING_PERMISSION_ACCESS_FINE_LOCATION`, open Android app permissions, tap `Location`, and enable `Precise location`.

2. Use presentation fallback only for demo safety.
   - Open Settings on the discovery screen and enable `Presentation fallback` to show local demo users.
   - This mode is for screenshots and viva/demo flow only; it does not connect two phones.

3. Finish hardening the real-only path.
   - Verify no fake contacts appear when discovery permissions are denied, native startup fails, or no second phone is nearby.

4. Audit and harden encryption.
   - Review the ECDH/AES-GCM native implementation, test key destruction, malformed payload handling, reconnect behavior, and pairing-code verification.

5. Validate the leave-and-wipe UX.
   - The peer-left and native disconnect paths now schedule a 60-second wipe with countdown UI; verify this behavior on physical phones.

6. Add a production release track.
   - Configure signing, package identifiers, app icons, privacy policy, Play Store metadata, screenshots, and a repeatable build process.

## Notes For Future Work

- Keep `NearbyUser` and `Message` as the main boundary types unless a real networking layer needs a better shape.
- Be careful with `allowFontScaling={false}`. It was used deliberately in the core demo UI to prevent layout breakage on small Android devices.
- Real nearby chats use native payload events and peer-left wipe payloads. Fake contact/chat routes have been removed from the app flow.
- The Add more/group chat feature was intentionally removed on 2026-05-22. Avoid reintroducing related UI unless the product direction changes again.
- User display names and chat messages must remain session-only. Do not reintroduce AsyncStorage or database persistence for identity or chat history.
