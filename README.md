# NexTalk Mobile

NexTalk Mobile is an Android-first offline messaging application built with Expo, React Native, and Expo Router.

The app enables direct device-to-device communication without requiring user accounts, cloud servers, or message storage. Communication occurs through nearby peer discovery and encrypted peer-to-peer connections, with automatic same-Wi-Fi fallback support.

## Download

Download the latest Android APK from the Releases page.

Current release: v1.2.1

## Features

* Offline peer-to-peer messaging
* No user accounts or sign-in
* Session-only display names
* Google Nearby Connections integration
* Automatic same-Wi-Fi fallback discovery
* End-to-end encrypted communication
* ECDH key exchange
* AES-GCM encrypted payloads
* Pairing-code verification before chat acceptance
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

* ECDH Key Exchange
* AES-GCM Encryption
* Session-only identities
* No persistent message storage

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

Implemented:

* Nearby device discovery
* Same-Wi-Fi fallback discovery
* Secure encrypted messaging
* Pairing verification
* Typing indicators
* Delivery receipts
* Session wipe workflow

Planned:

* Additional device testing
* Security hardening and review
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
