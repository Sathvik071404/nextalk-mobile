# NexTalk Mobile

## Project Website

The portfolio source is in `website/`; open `website/index.html` for a local preview. To publish it, select **Settings > Pages > GitHub Actions** in this repository, then run the **Deploy project website** workflow from the Actions tab. After a successful deployment, it will be available at https://sathvik071404.github.io/nextalk-mobile/.

The latest published APK is v1.2.1; current source is v1.2.3 and has not been published as an APK.

NexTalk Mobile is an Android-first offline messaging application built with Expo, React Native, and Expo Router.

The app explores direct device-to-device communication without user accounts, a cloud chat server, or persistent message storage. It supports Nearby Connections and a same-Wi-Fi fallback. Session encryption is experimental and has known authentication and transport enforcement issues; do not use NexTalk for sensitive conversations.

## Download

Download the latest Android APK from the Releases page.

Latest published APK: v1.2.1

Current source version: v1.2.3 (not yet published as an APK)

## Features

* Offline peer-to-peer messaging
* No user accounts or sign-in
* Session-only display names
* Google Nearby Connections integration
* Automatic same-Wi-Fi fallback discovery
* Experimental session encryption using ECDH and AES-GCM
* Pairing-code comparison flow (peer identity authentication remains an open issue)
* Typing indicators
* Delivery receipts
* Privacy-safe notifications
* Automatic 60-second chat wipe after peer disconnect
* Android-native transport layer
* Clean mobile-first user experience

## Technology Stack

### Frontend

* React Native
* Expo
* Expo Router
* TypeScript

### Native Android Layer

* Google Nearby Connections
* Android NSD (Network Service Discovery)
* TCP Socket Communication
* Kotlin

### Security

* ECDH key agreement and AES-GCM are present in the Android session transport
* Pairing codes are intended to help users verify the peer out of band
* Peer identity authentication and encryption enforcement have known gaps
* This prototype has not passed runtime penetration testing or a formal cryptographic audit
* No persistent message storage is intended; this is not a guarantee against every local or device-level exposure

## Security Assessment

A supplied white-box assessment reviewed 17 repository surfaces using source tracing, static checks, and dependency review. It reported five findings: one high, three medium, and one low. The Android module was not compiled or run during the assessment, no live proof of concept was executed, and the results should be treated as static-review findings with medium confidence, not as a completed runtime penetration test.

| ID | Severity | Finding reported | Status |
| --- | --- | --- | --- |
| `vuln-0004` | High | The same-Wi-Fi ECDH exchange does not authenticate peer identity; an on-path attacker can substitute keys and read or alter a chat if users do not independently compare pairing codes. | Open |
| `vuln-0002` | Medium | The LAN host trusts a client-supplied endpoint ID, allowing a connection to collide with or replace a live peer session. | Open |
| `vuln-0001` | Medium | LAN accepts are unbounded and lack read timeouts, allowing a nearby network attacker to consume resources or flood connection prompts. | Open |
| `vuln-0003` | Medium | The receiver accepts plaintext payloads during a secure session; the end-chat notification can also be sent without encryption. | Open |
| `vuln-0005` | Low | The report identifies a ReDoS advisory in transitive `decode-uri-component@0.2.2`; it did not find an attacker-controlled route to the vulnerable parsing path in this app. | Recheck against the current dependency lockfile |

### Security Update Priorities

Keep these items open in future updates until each fix is implemented and verified:

1. Authenticate peer identities in both transports, and require a meaningful, enforced out-of-band verification step before treating a session as trusted.
2. Reject duplicate or client-chosen LAN endpoint identities; use a host-issued connection identifier.
3. Bound concurrent LAN connections and set socket read timeouts.
4. Reject plaintext once a secure session is expected; encrypt control messages such as peer-left/end-chat events.
5. Bind session and message direction into AES-GCM additional authenticated data, add replay protection, and review key lifetime/zeroization.
6. Recheck the reported transitive dependency advisory against the current lockfile and update the dependency chain as appropriate.
7. Compile the native Android module, then run two-device tests including an authorized local-network interception test and a resource-exhaustion test before making stronger security claims.

The supplied assessment also reports clean checks for secrets, unsafe React Native text rendering, malformed-frame handling, and several other reviewed surfaces. A clean static check is limited to the scope and methods used; it does not establish that the app is secure.

## App Flow

### Onboarding

Users choose a temporary display name when the app launches.

### Discovery

Nearby devices are discovered through:

* Google Nearby Connections
* Same-Wi-Fi discovery fallback

### Pairing

Users verify a pairing code before establishing a chat session.

### Chat

Connected peers can exchange:

* Messages
* Typing events
* Delivery receipts

### Session Wipe

When a peer disconnects, the conversation is automatically removed after 60 seconds.

## Project Structure

```text
src/
├── app/
├── components/
├── features/

modules/
└── nextalk-nearby/
    └── android/

docs/
└── ephemeral-backend-plan.md
```

## Important Files

| File                                                | Purpose                                 |
| --------------------------------------------------- | --------------------------------------- |
| `src/app/index.tsx`                                 | Onboarding flow                         |
| `src/app/discovery.tsx`                             | Nearby discovery screen                 |
| `src/app/chat/[userId].tsx`                         | Chat screen                             |
| `src/features/nextalk/nearby-transport.ts`          | Transport layer boundary                |
| `modules/nextalk-nearby/.../NexTalkNearbyModule.kt` | Native Android transport implementation |
| `docs/ephemeral-backend-plan.md`                    | Offline architecture documentation      |

## Installation

```bash
npm install
```

Start development server:

```bash
npm start
```

Run on Android:

```bash
npm run android
```

## Quality Checks

```bash
npx tsc --noEmit
npm run lint
```

## Current Status

NexTalk Mobile is currently a working prototype.

The current source version is `1.2.3` (Android version code `20`). The latest published APK is still `v1.2.1`.

Implemented:

* Nearby device discovery
* Same-Wi-Fi fallback discovery
* Experimental encrypted session transport (known security gaps are documented above)
* Pairing-code comparison flow (not a cryptographic identity guarantee)
* Typing indicators
* Delivery receipts
* Session wipe workflow

Planned:

* Additional device testing
* Remediate the reported security findings and retest on real Android devices
* Release signing and store preparation
* Production deployment pipeline

## Privacy Principles

NexTalk is designed around a privacy-first model:

* No user accounts
* No cloud backend
* No message history storage
* No persistent identities
* Session-only communication
* Automatic chat expiration

## License

MIT License
