import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform, type Permission } from 'react-native';

import { Message } from '@/features/nextalk/data';

type EventSubscription = { remove: () => void };

export type NearbyTransportKind = 'nearby' | 'lan';

export type NearbyEndpointEvent = {
  endpointId: string;
  endpointName: string;
  serviceId?: string;
  transport?: NearbyTransportKind;
};

export type NearbyConnectionInitiatedEvent = {
  endpointId: string;
  endpointName: string;
  authenticationDigits?: string;
  isIncomingConnection?: boolean;
  transport?: NearbyTransportKind;
};

export type NearbyConnectionResultEvent = {
  endpointId: string;
  status: 'connected' | 'failed';
  statusCode?: number;
  statusMessage?: string;
  transport?: NearbyTransportKind;
};

export type NearbyPayloadEvent = {
  endpointId: string;
  payloadId: number;
  text: string;
  transport?: NearbyTransportKind;
  encrypted?: boolean;
};

export type NearbyDisconnectedEvent = {
  endpointId: string;
  transport?: NearbyTransportKind;
};

export type NearbySecureSessionStatus = {
  active: boolean;
  fingerprint: string;
};

export type NearbyTransportEventMap = {
  onEndpointFound: (event: NearbyEndpointEvent) => void;
  onEndpointLost: (event: { endpointId: string; transport?: NearbyTransportKind }) => void;
  onConnectionInitiated: (event: NearbyConnectionInitiatedEvent) => void;
  onConnectionResult: (event: NearbyConnectionResultEvent) => void;
  onDisconnected: (event: NearbyDisconnectedEvent) => void;
  onPayloadReceived: (event: NearbyPayloadEvent) => void;
  onPayloadTransferUpdate: (event: {
    endpointId: string;
    payloadId: number;
    status: number;
    bytesTransferred: number;
    totalBytes: number;
    transport?: NearbyTransportKind;
  }) => void;
  onSecureSessionChanged: (event: NearbySecureSessionStatus & { endpointId: string }) => void;
  onStateChanged: (event: { state: string; active: boolean }) => void;
  onError: (event: { operation: string; message: string }) => void;
};

type NativeNearbyModule = {
  addListener<EventName extends keyof NearbyTransportEventMap>(
    eventName: EventName,
    listener: NearbyTransportEventMap[EventName]
  ): EventSubscription;
  isAvailable: () => boolean;
  checkPermissions: () => NearbyPermissionStatus;
  getStatus: () => NearbyTransportStatus;
  getSecureSessionStatus: (endpointId: string) => NearbySecureSessionStatus;
  setSilentMode: (enabled: boolean) => void;
  startAdvertising: (displayName: string) => Promise<void>;
  stopAdvertising: () => Promise<void>;
  startDiscovery: () => Promise<void>;
  stopDiscovery: () => Promise<void>;
  startLanAdvertising: (displayName: string) => Promise<void>;
  stopLanAdvertising: () => Promise<void>;
  startLanDiscovery: () => Promise<void>;
  stopLanDiscovery: () => Promise<void>;
  requestConnection: (endpointId: string, displayName: string) => Promise<void>;
  acceptConnection: (endpointId: string) => Promise<void>;
  rejectConnection: (endpointId: string) => Promise<void>;
  sendMessage: (endpointId: string, message: string) => Promise<{ payloadId: number }>;
  sendSecureMessage: (endpointId: string, message: string) => Promise<{ payloadId: number }>;
  disconnect: (endpointId: string) => Promise<void>;
  stopAllEndpoints: () => Promise<void>;
};

export const NEARBY_WIPE_TIMEOUT_MS = 60000;

export type NearbyChatMessagePayload = {
  type: 'message';
  id: string;
  text: string;
  senderName: string;
  sentAt: string;
  roomId?: string;
};

export type NearbyTypingPayload = {
  type: 'typing';
  senderName: string;
  active: boolean;
  sentAt: string;
  roomId?: string;
};

export type NearbyReceiptPayload = {
  type: 'receipt';
  messageId: string;
  receivedAt: string;
  roomId?: string;
};

export type NearbyPeerLeftPayload = {
  type: 'peer_left';
  senderName: string;
  leftAt: string;
  roomId?: string;
};

export type NearbyRoomWipedPayload = {
  type: 'room_wiped';
  wipedAt: string;
  roomId?: string;
};

export type NearbyChatPayload =
  | NearbyChatMessagePayload
  | NearbyTypingPayload
  | NearbyReceiptPayload
  | NearbyPeerLeftPayload
  | NearbyRoomWipedPayload;

export type NearbyTransportStatus = {
  androidApiLevel?: number;
  strategy?: string;
  serviceId?: string;
  playServicesAvailable?: boolean;
  playServicesStatusCode?: number;
  bluetoothEnabled?: boolean | null;
  wifiEnabled?: boolean | null;
  locationEnabled?: boolean | null;
  discoveredEndpointCount?: number;
  lanAdvertising?: boolean;
  lanDiscovering?: boolean;
  lanEndpointCount?: number;
  lanPeerCount?: number;
  secureSessionCount?: number;
  silentMode?: boolean;
};

export type NearbyPermissionStatus = {
  bluetoothAdvertise?: boolean | null;
  bluetoothConnect?: boolean | null;
  bluetoothScan?: boolean | null;
  nearbyWifiDevices?: boolean | null;
  accessCoarseLocation?: boolean | null;
  accessFineLocation?: boolean | null;
  accessWifiState?: boolean | null;
  changeWifiState?: boolean | null;
  postNotifications?: boolean | null;
};

const optionalNativeModule = requireOptionalNativeModule<NativeNearbyModule>('NexTalkNearby');
const emptySubscription: EventSubscription = { remove: () => undefined };

const getAndroidApiLevel = () => {
  if (Platform.OS !== 'android') return 0;
  return typeof Platform.Version === 'number' ? Platform.Version : Number.parseInt(String(Platform.Version), 10);
};

const getRequiredNearbyPermissions = () => {
  const apiLevel = getAndroidApiLevel();
  const permissions = new Set<string>();

  if (apiLevel >= 31) {
    permissions.add('android.permission.BLUETOOTH_ADVERTISE');
    permissions.add('android.permission.BLUETOOTH_CONNECT');
    permissions.add('android.permission.BLUETOOTH_SCAN');
  }

  if (apiLevel >= 32) {
    permissions.add('android.permission.NEARBY_WIFI_DEVICES');
  }

  if (apiLevel >= 33) {
    permissions.add('android.permission.POST_NOTIFICATIONS');
  }

  // Real Android 16/API 36 testing showed Google Play Services Nearby checks
  // both coarse and fine location before discovery, even with Nearby Wi-Fi granted.
  permissions.add(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
  permissions.add(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);

  return [...permissions];
};

export const isNearbyTransportAvailable = () => {
  if (!optionalNativeModule) return false;

  try {
    return optionalNativeModule.isAvailable();
  } catch {
    return false;
  }
};

export const requestNearbyPermissions = async () => {
  if (Platform.OS !== 'android') {
    return {
      granted: false,
      requested: [] as string[],
      denied: [] as string[],
      blocked: [] as string[],
      transportDenied: [] as string[],
      notificationDenied: false,
    };
  }

  const permissions = getRequiredNearbyPermissions();

  if (!permissions.length) {
    return {
      granted: true,
      requested: [],
      denied: [],
      blocked: [],
      transportDenied: [],
      notificationDenied: false,
    };
  }

  const results = await PermissionsAndroid.requestMultiple(permissions as Permission[]);
  const denied = Object.entries(results)
    .filter(([, result]) => result === PermissionsAndroid.RESULTS.DENIED)
    .map(([permission]) => permission);
  const blocked = Object.entries(results)
    .filter(([, result]) => result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)
    .map(([permission]) => permission);
  const notificationPermission = 'android.permission.POST_NOTIFICATIONS';
  const transportDenied = [...denied, ...blocked].filter((permission) => permission !== notificationPermission);

  return {
    granted: transportDenied.length === 0,
    requested: permissions,
    denied,
    blocked,
    transportDenied,
    notificationDenied: denied.includes(notificationPermission) || blocked.includes(notificationPermission),
  };
};

export const nearbyTransport = {
  isSupported: isNearbyTransportAvailable,

  checkPermissions() {
    return optionalNativeModule?.checkPermissions() ?? {};
  },

  getStatus() {
    return optionalNativeModule?.getStatus() ?? {};
  },

  getSecureSessionStatus(endpointId: string): NearbySecureSessionStatus {
    return optionalNativeModule?.getSecureSessionStatus(endpointId) ?? { active: false, fingerprint: '' };
  },

  setSilentMode(enabled: boolean) {
    optionalNativeModule?.setSilentMode(enabled);
  },

  addListener<EventName extends keyof NearbyTransportEventMap>(
    eventName: EventName,
    listener: NearbyTransportEventMap[EventName]
  ) {
    return optionalNativeModule?.addListener(eventName, listener) ?? emptySubscription;
  },

  startAdvertising(displayName: string) {
    return optionalNativeModule?.startAdvertising(displayName) ?? Promise.resolve();
  },

  stopAdvertising() {
    return optionalNativeModule?.stopAdvertising() ?? Promise.resolve();
  },

  startDiscovery() {
    return optionalNativeModule?.startDiscovery() ?? Promise.resolve();
  },

  stopDiscovery() {
    return optionalNativeModule?.stopDiscovery() ?? Promise.resolve();
  },

  startLanAdvertising(displayName: string) {
    return optionalNativeModule?.startLanAdvertising(displayName) ?? Promise.resolve();
  },

  stopLanAdvertising() {
    return optionalNativeModule?.stopLanAdvertising() ?? Promise.resolve();
  },

  startLanDiscovery() {
    return optionalNativeModule?.startLanDiscovery() ?? Promise.resolve();
  },

  stopLanDiscovery() {
    return optionalNativeModule?.stopLanDiscovery() ?? Promise.resolve();
  },

  requestConnection(endpointId: string, displayName: string) {
    return optionalNativeModule?.requestConnection(endpointId, displayName) ?? Promise.resolve();
  },

  acceptConnection(endpointId: string) {
    return optionalNativeModule?.acceptConnection(endpointId) ?? Promise.resolve();
  },

  rejectConnection(endpointId: string) {
    return optionalNativeModule?.rejectConnection(endpointId) ?? Promise.resolve();
  },

  sendMessage(endpointId: string, message: string) {
    return optionalNativeModule?.sendMessage(endpointId, message) ?? Promise.resolve({ payloadId: Date.now() });
  },

  sendSecureMessage(endpointId: string, message: string) {
    return optionalNativeModule?.sendSecureMessage(endpointId, message) ?? Promise.resolve({ payloadId: Date.now() });
  },

  disconnect(endpointId: string) {
    return optionalNativeModule?.disconnect(endpointId) ?? Promise.resolve();
  },

  stopAllEndpoints() {
    return optionalNativeModule?.stopAllEndpoints() ?? Promise.resolve();
  },
};

export const createNearbyRoomId = () => `room-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;

export const createEphemeralSessionKey = () => {
  const randomParts = Array.from({ length: 4 }, () => Math.random().toString(16).slice(2).padEnd(12, '0'));
  return randomParts.join('').slice(0, 48);
};

export const createSessionKeyFingerprint = (sessionKey: string) =>
  sessionKey
    .slice(0, 12)
    .match(/.{1,4}/g)
    ?.join('-')
    .toUpperCase() ?? 'LOCAL';

export const encodeNearbyMessage = (message: Message, roomId?: string) =>
  JSON.stringify({
    type: 'message',
    id: message.id,
    text: message.text,
    senderName: message.senderName,
    sentAt: message.timestamp,
    roomId,
  } satisfies NearbyChatMessagePayload);

export const encodeTypingPayload = (senderName: string, active: boolean, roomId?: string) =>
  JSON.stringify({
    type: 'typing',
    senderName: senderName.trim() || 'Nearby user',
    active,
    sentAt: new Date().toISOString(),
    roomId,
  } satisfies NearbyTypingPayload);

export const encodeReceiptPayload = (messageId: string, roomId?: string) =>
  JSON.stringify({
    type: 'receipt',
    messageId,
    receivedAt: new Date().toISOString(),
    roomId,
  } satisfies NearbyReceiptPayload);

export const encodePeerLeftPayload = (senderName: string, roomId?: string) =>
  JSON.stringify({
    type: 'peer_left',
    senderName: senderName.trim() || 'Nearby user',
    leftAt: new Date().toISOString(),
    roomId,
  } satisfies NearbyPeerLeftPayload);

export const encodeRoomWipedPayload = (roomId?: string) =>
  JSON.stringify({
    type: 'room_wiped',
    wipedAt: new Date().toISOString(),
    roomId,
  } satisfies NearbyRoomWipedPayload);

export const decodeNearbyPayload = (payload: string): NearbyChatPayload | null => {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const roomId = typeof parsed.roomId === 'string' ? parsed.roomId : undefined;

    if (parsed.type === 'message') {
      if (
        typeof parsed.id !== 'string' ||
        typeof parsed.text !== 'string' ||
        typeof parsed.senderName !== 'string' ||
        typeof parsed.sentAt !== 'string'
      ) {
        return null;
      }

      return {
        type: 'message',
        id: parsed.id,
        text: parsed.text,
        senderName: parsed.senderName,
        sentAt: parsed.sentAt,
        roomId,
      };
    }

    if (parsed.type === 'typing') {
      if (
        typeof parsed.senderName !== 'string' ||
        typeof parsed.active !== 'boolean' ||
        typeof parsed.sentAt !== 'string'
      ) {
        return null;
      }

      return {
        type: 'typing',
        senderName: parsed.senderName,
        active: parsed.active,
        sentAt: parsed.sentAt,
        roomId,
      };
    }

    if (parsed.type === 'receipt') {
      if (typeof parsed.messageId !== 'string' || typeof parsed.receivedAt !== 'string') {
        return null;
      }

      return {
        type: 'receipt',
        messageId: parsed.messageId,
        receivedAt: parsed.receivedAt,
        roomId,
      };
    }

    if (parsed.type === 'peer_left') {
      if (typeof parsed.senderName !== 'string' || typeof parsed.leftAt !== 'string') {
        return null;
      }

      return {
        type: 'peer_left',
        senderName: parsed.senderName,
        leftAt: parsed.leftAt,
        roomId,
      };
    }

    if (parsed.type === 'room_wiped') {
      if (typeof parsed.wipedAt !== 'string') {
        return null;
      }

      return {
        type: 'room_wiped',
        wipedAt: parsed.wipedAt,
        roomId,
      };
    }

    return null;
  } catch {
    return null;
  }
};

export const decodeNearbyMessage = (payload: string): NearbyChatMessagePayload | null => {
  const decodedPayload = decodeNearbyPayload(payload);
  return decodedPayload?.type === 'message' ? decodedPayload : null;
};
