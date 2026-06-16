# NexTalk Ephemeral Backend Plan

Last updated: 2026-06-04

NexTalk should be designed for confidentiality. The backend must not behave like a normal chat storage service.

## Product Rules

- Users choose a display name every time they open the app.
- No account is required.
- No display name is persisted by the app or backend.
- No chat history is persisted by the app or backend.
- Messages exist only while the active chat session exists.
- When one participant leaves, the remaining participant gets a 60-second grace period.
- After the 60-second grace period, the room and all messages are wiped from memory.
- If all participants leave before the grace period ends, wipe immediately.
- Do not provide chat restore, chat history, or message export as a backend feature.

## Offline Backend Shape

Because NexTalk should work without internet, the "backend" should not be a cloud server. It should be an offline transport layer running on the phones.

Recommended first version for Android:

- Android Nearby Connections API or Wi-Fi Direct native module
- local peer discovery
- local peer connection
- in-memory rooms only on participating devices
- random room IDs
- random participant IDs
- no user accounts
- no database
- no message content logs
- no analytics tied to message content or identity

Nearby Connections is the easiest product fit because it is designed for nearby peer-to-peer communication without internet and can use Bluetooth, BLE, and Wi-Fi under the hood. Wi-Fi Direct is a lower-level option with more manual connection management.

This requires native Android code. Expo Go cannot provide this because the app needs native peer-to-peer APIs. Use an Expo development build / EAS build with a custom native Android module.

Current implementation started in version `1.0.4`:

- `modules/nextalk-nearby` is a local Expo Android module.
- It uses Google Play Services Nearby Connections through `play-services-nearby:19.3.0`.
- It exposes advertising, discovery, connection request, accept/reject, disconnect, and byte-message send methods.
- `src/features/nextalk/nearby-transport.ts` wraps the native module, runtime Android permissions, events, and message payload encoding.
- `/discovery` starts local advertising/discovery when the native module is available.
- `/chat/[userId]` sends and receives direct byte-message payloads for connected nearby chats.
- Expo Go cannot run the native transport, so discovery should show an empty/unavailable state instead of fake contacts.

Current implementation continued in version `1.0.5`:

- Nearby payloads now support `message`, `peer_left`, and `room_wiped` event types.
- Live nearby chats send `peer_left` before disconnecting when the user taps `End chat`.
- The receiving chat locks the composer, shows a 60-second wipe countdown, clears in-memory messages, and returns to discovery.
- Native disconnect events also start the same local 60-second wipe path.

Current implementation continued in version `1.0.6`:

- Discovery no longer falls back to preview contacts.
- If the native transport is unavailable, permissions are missing, or discovery startup fails, the radar shows no users and explains the issue.
- The app should only show users discovered through Nearby Connections.

Current implementation continued in version `1.0.7`:

- Legacy mock user data and timer replies were removed from the app flow.
- Chat routes now require real nearby route params from discovery instead of resolving fake contact IDs.

Current implementation continued in version `1.0.8`:

- Discovery requests Android nearby runtime permissions before checking native transport availability.
- Permission denial now leaves discovery empty and gives retry/settings actions instead of silently failing.
- Android can group Bluetooth/Wi-Fi discovery prompts under `Nearby devices`; Wi-Fi state permissions remain manifest-only and do not normally show a popup.

Current implementation continued in version `1.0.9`:

- Nearby Connections now uses `P2P_CLUSTER` instead of `P2P_POINT_TO_POINT` so both phones can advertise and discover each other more reliably.
- Discovery shows a `Nearby setup` diagnostic panel with Android API level, strategy, Google Play Services, Bluetooth, Wi-Fi, Location, and native state events.
- The native module exposes a status method for phone-side testing without adb/logcat.

Current implementation continued in version `1.0.10`:

- Discovery now has explicit Auto, Host, and Join modes.
- Host mode advertises only; Join mode discovers only. This matches the simplest Nearby Connections test model and avoids simultaneous-role ambiguity during real phone testing.
- `NEARBY_WIFI_DEVICES` was aligned with Google's Nearby Connections manifest sample by removing the extra `neverForLocation` flag.

Current implementation continued in version `1.0.11`:

- Real-phone testing on Android API 36 showed Nearby startup error `8032: MISSING_PERMISSION_ACCESS_WIFI_STATE`.
- `ACCESS_WIFI_STATE` and `CHANGE_WIFI_STATE` are now declared without the Android 12L/API 31 cap so Google Play Services Nearby can start advertising/discovery on newer Android builds.

Current implementation continued in version `1.0.12`:

- Real-phone testing then showed advertising could start, but discovery failed with `8034: MISSING_PERMISSION_ACCESS_COARSE_LOCATION`.
- `ACCESS_COARSE_LOCATION` is now declared without the Android 9/API 28 cap and requested at runtime for Android Nearby startup, including Android API 36.

Current implementation continued in version `1.0.13`:

- Real-phone testing then showed discovery still failed with `8036: MISSING_PERMISSION_ACCESS_FINE_LOCATION` even after the visible Android Location permission was allowed.
- `ACCESS_FINE_LOCATION` is now declared without the Android 12L/API 31 cap and requested at runtime for Android Nearby startup, including Android API 36. On Android's precise/approximate prompt, Nearby discovery needs precise location.

Current implementation continued in version `1.1.0`:

- The native module exposes `checkPermissions()` so the app can show an explicit setup checklist instead of relying only on runtime prompt results.
- Discovery now defaults to a Host/Join-first test flow, with Auto kept as a secondary mode.
- Incoming and outgoing nearby connections require the user to confirm that the pairing code matches before `acceptConnection` is called.
- Discovery shows a connection timeline for permission, radio, advertising, discovery, pairing, and connection events.
- Settings include a presentation fallback mode that shows local demo users and opens simulated chats for college demo safety. This is not a real cross-phone LAN fallback.
- Chats show an in-memory session-key fingerprint badge. This is a UX/security-direction marker, not production-grade payload encryption.

Current implementation continued in version `1.2.0`:

- The Android native module now runs an NSD/TCP same-Wi-Fi fallback beside Google Nearby Connections. Host and Join modes use the same pairing flow for both transports, and LAN pairing digits are derived from the actual ECDH session key.
- Connected peers perform an in-memory ECDH key agreement and send application payloads with AES-GCM authenticated encryption.
- Chat shows the real native encryption-key fingerprint and keeps the composer locked until the secure session is ready.
- The payload protocol now includes remote typing and delivery-receipt events.
- The native layer can show a privacy-safe background alert for encrypted messages. The notification never contains sender names or message text, and session-only silent mode disables it.

Current implementation continued in version `1.2.1`:

- The Android same-Wi-Fi NSD service now writes its TXT display-name attribute through the current string-based Android API, fixing the release Kotlin compilation failure from the first `1.2.0` EAS build attempt.

Room state should live on the connected devices and look conceptually like this:

```ts
interface EphemeralRoom {
  roomId: string;
  participants: Map<string, EphemeralParticipant>;
  messages: EphemeralMessage[];
  wipeTimer?: NodeJS.Timeout;
  createdAt: number;
  lastActivityAt: number;
}
```

This data must only live in memory. Restarting the backend should erase every room.

## Message Flow

1. Device A starts advertising itself locally.
2. Device B discovers Device A locally.
3. Device B sends a connection request.
4. Device A accepts.
5. Both devices exchange session display names.
6. Messages are sent directly between the devices.
7. Messages stay only in app memory on each device.
8. On participant leave/disconnect, start a 60-second wipe timer.
9. If timeout finishes, delete the local room and local messages.

## Security Direction

The best privacy version is end-to-end encryption:

- The transport sends encrypted message payloads.
- No relay or peer transport layer should need plaintext message text.
- Encryption keys are generated per chat session.
- Keys are stored only in app memory.
- Keys are destroyed when the chat ends or the app closes.

The current prototype implements this direction with Android ECDH/AES-GCM session keys. It still must not persist messages, keys, or message-body logs, and the cryptographic implementation should receive a formal review before any production claim.

## Leave And Wipe Rule

When someone leaves:

```text
participant leaves
peer receives "peer_left"
remaining participant sees 60-second warning
app starts wipe timer
if no active participants remain, wipe immediately
if timer reaches 0, wipe room messages and metadata
app emits "room_wiped" locally
```

The mobile app should then clear local message state and leave the chat screen.

## What Not To Build

- No login system yet.
- No stored profiles.
- No chat table.
- No message table.
- No cloud chat backup.
- No admin message viewer.
- No long-lived room history.
- No push notification containing message text.
- No internet relay for the main confidential chat path.

## Implementation Direction

Build this in phases:

1. Native Android transport proof of concept.
   - Create a local Expo native module.
   - Expose methods like `startAdvertising`, `startDiscovery`, `connect`, `sendMessage`, and `disconnect`.
   - Status: started in `modules/nextalk-nearby`.

2. Wire discovery to the current radar UI.
   - Replace the old fake contact list with real nearby endpoints.
   - Status: real-only Nearby and same-Wi-Fi discovery, earlier permission prompts, cluster strategy, Host/Join modes, native permission checklist, pairing confirmation, and phone-side diagnostics are wired in local source; physical APK validation is still pending.

3. Wire chat to direct peer messages.
   - Replace timer replies with peer message events.
   - Status: started for connected nearby chats; fake contact/timer reply paths have been removed from the app flow.

4. Add the leave-and-wipe UX.
   - Show the 60-second warning and wipe local room state.
   - Status: wired in local source for peer-left payloads and native disconnect events; physical APK validation is still pending.

5. Add encryption.
   - Generate per-chat keys in app memory and destroy them when the room ends.
   - Status: ECDH key agreement, AES-GCM encrypted payloads, live fingerprints, and key destruction on disconnect are implemented in local Android source; physical testing and a security review are still pending.

6. Optional LAN fallback.
   - Build a native same-Wi-Fi/hotspot transport only if Nearby Connections remains unreliable for demo phones.
   - Status: automatic Android NSD discovery and TCP messaging are implemented and share the normal pairing/encryption/chat flow. Manual join codes and QR scanning are not included yet.

## Transport Options

Recommended order:

- Nearby Connections API: best first choice for Android-only offline nearby chat.
- Wi-Fi Direct: useful if you want direct control over peer-to-peer Wi-Fi, but it is more manual.
- Bluetooth/BLE: useful for discovery and small payloads, but usually weaker for chat UX.
- Local Wi-Fi LAN: works without internet if both phones are on the same hotspot/router, but it is not true direct nearby discovery.

The same confidentiality rules always apply: session-only display names, in-memory messages, and wipe-on-leave behavior.
