import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NearbyUser, createDemoNearbyUsers, createNearbyUser } from '@/features/nextalk/data';
import {
  NearbyConnectionInitiatedEvent,
  NearbyPermissionStatus,
  NearbyTransportStatus,
  nearbyTransport,
  requestNearbyPermissions,
} from '@/features/nextalk/nearby-transport';
import { nexTalkColors, nexTalkGradients, nexTalkShadow } from '@/features/nextalk/theme';

type ScanMode = 'auto' | 'host' | 'join';

const scanModes: { label: string; value: ScanMode }[] = [
  { label: 'Host', value: 'host' },
  { label: 'Join', value: 'join' },
  { label: 'Auto', value: 'auto' },
];

type PairingRequest = NearbyConnectionInitiatedEvent & {
  direction: 'incoming' | 'outgoing';
};

type SetupCheck = {
  key: string;
  label: string;
  ok: boolean | null;
  detail: string;
};

const isGranted = (value?: boolean | null) => value === true;

const buildSetupChecklist = (
  permissionStatus: NearbyPermissionStatus,
  status: NearbyTransportStatus
) => {
  const apiLevel = status.androidApiLevel ?? 0;
  const needsModernBluetooth = apiLevel >= 31;
  const needsNearbyWifi = apiLevel >= 32;

  return [
    {
      key: 'nearby',
      label: 'Nearby devices',
      ok:
        (!needsModernBluetooth ||
          (isGranted(permissionStatus.bluetoothAdvertise) &&
            isGranted(permissionStatus.bluetoothConnect) &&
            isGranted(permissionStatus.bluetoothScan))) &&
        (!needsNearbyWifi || isGranted(permissionStatus.nearbyWifiDevices)),
      detail: 'Bluetooth and Nearby Wi-Fi runtime access',
    },
    {
      key: 'location',
      label: 'Precise location',
      ok: isGranted(permissionStatus.accessCoarseLocation) && isGranted(permissionStatus.accessFineLocation),
      detail: 'Required by Google Nearby discovery',
    },
    {
      key: 'wifi-state',
      label: 'Wi-Fi state',
      ok: isGranted(permissionStatus.accessWifiState) && isGranted(permissionStatus.changeWifiState),
      detail: 'Install-time Wi-Fi permissions',
    },
    {
      key: 'radios',
      label: 'Bluetooth, Wi-Fi, Location on',
      ok: status.bluetoothEnabled !== false && status.wifiEnabled !== false && status.locationEnabled !== false,
      detail: 'Phone radios and location service',
    },
    {
      key: 'play-services',
      label: 'Google Play Services',
      ok: status.playServicesAvailable === true,
      detail: `Status ${status.playServicesStatusCode ?? 'unknown'}`,
    },
    {
      key: 'lan-fallback',
      label: 'Same-Wi-Fi fallback',
      ok: status.wifiEnabled !== false,
      detail: 'Automatic Android local-network discovery',
    },
    {
      key: 'notifications',
      label: 'Private message alerts',
      ok: apiLevel < 33 || isGranted(permissionStatus.postNotifications),
      detail: 'Shows no sender name or message text',
    },
  ];
};

export default function DiscoveryScreen() {
  const { username: usernameParam } = useLocalSearchParams<{ username?: string }>();
  const { width } = useWindowDimensions();
  const [username, setUsername] = useState('User');
  const [tempUsername, setTempUsername] = useState('');
  const [silentMode, setSilentModeState] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<NearbyUser | null>(null);
  const [pairingRequest, setPairingRequest] = useState<PairingRequest | null>(null);
  const [transportNotice, setTransportNotice] = useState<string | null>(null);
  const [permissionIssue, setPermissionIssue] = useState(false);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [setupChecklist, setSetupChecklist] = useState<SetupCheck[]>([]);
  const [scanAttempt, setScanAttempt] = useState(0);
  const [scanMode, setScanMode] = useState<ScanMode>('join');
  const [presentationMode, setPresentationMode] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const pendingEndpointRef = useRef<string | null>(null);
  const pendingChatUserRef = useRef<NearbyUser | null>(null);
  const incomingChatUserRef = useRef<NearbyUser | null>(null);
  const isCompact = width < 390;
  const horizontalPadding = isCompact ? 18 : 24;
  const radarSize = Math.min(width - horizontalPadding * 2, isCompact ? 280 : 320);
  const radarUserSize = isCompact ? 32 : 36;
  const titleSize = isCompact ? 24 : 28;
  const sessionUsername = typeof usernameParam === 'string' ? usernameParam.trim() : '';

  useEffect(() => {
    nearbyTransport.setSilentMode(silentMode);
  }, [silentMode]);

  useEffect(() => {
    let active = true;
    let scanTimer: ReturnType<typeof setTimeout> | undefined;
    const subscriptions: { remove: () => void }[] = [];

    if (!sessionUsername) {
      router.replace('/');
      return () => {
        active = false;
      };
    }

    setUsername(sessionUsername);
    setTempUsername(sessionUsername);
    setScanning(true);
    setTransportNotice(null);
    setPermissionIssue(false);
    setDiagnostics([]);
    setSetupChecklist([]);
    setNearbyUsers([]);

    if (presentationMode) {
      setScanning(false);
      setTransportNotice('Presentation fallback is active. These demo users do not use the radio backend.');
      setDiagnostics([
        'Presentation mode active',
        'Demo users loaded',
        'Real Nearby transport paused',
      ]);
      setSetupChecklist([
        {
          key: 'presentation',
          label: 'Presentation fallback',
          ok: true,
          detail: 'Local demo chat, no phone-to-phone transport',
        },
        {
          key: 'real-transport',
          label: 'Real nearby backend',
          ok: null,
          detail: 'Turn off presentation mode for live Host/Join testing',
        },
      ]);
      setNearbyUsers(createDemoNearbyUsers(sessionUsername));

      return () => {
        active = false;
      };
    }

    const addDiagnostic = (message: string) => {
      if (!active) return;
      setDiagnostics((current) => [...current.filter((entry) => entry !== message), message].slice(-8));
    };

    const describeStatus = (status: NearbyTransportStatus) => {
      const statusParts = [
        `API ${status.androidApiLevel ?? '?'}`,
        `mode ${scanMode} / strategy ${status.strategy ?? '?'}`,
        `Play Services ${status.playServicesAvailable ? 'OK' : `not OK (${status.playServicesStatusCode ?? '?'})`}`,
        `BT ${status.bluetoothEnabled === null || status.bluetoothEnabled === undefined ? '?' : status.bluetoothEnabled ? 'on' : 'off'}`,
        `Wi-Fi ${status.wifiEnabled === null || status.wifiEnabled === undefined ? '?' : status.wifiEnabled ? 'on' : 'off'}`,
        `Location ${status.locationEnabled === null || status.locationEnabled === undefined ? '?' : status.locationEnabled ? 'on' : 'off'}`,
      ];

      return statusParts.join(' | ');
    };

    const upsertNearbyUser = (user: NearbyUser) => {
      setNearbyUsers((current) => {
        const exists = current.some((entry) => entry.endpointId === user.endpointId);

        if (exists) {
          return current.map((entry) => (entry.endpointId === user.endpointId ? user : entry));
        }

        const samePerson = current.find((entry) => entry.name === user.name && entry.source !== user.source);
        if (samePerson) {
          if (samePerson.source === 'nearby' && user.source === 'lan') return current;
          return current.map((entry) => (entry.id === samePerson.id ? user : entry));
        }

        return [...current, user];
      });
    };

    const openNearbyChat = (user: NearbyUser) => {
      router.push({
        pathname: '/chat/[userId]',
        params: {
          userId: user.id,
          username: sessionUsername,
          endpointId: user.endpointId ?? user.id,
          remoteName: user.name,
          remoteAvatar: user.avatar,
          remoteDistance: String(user.distance),
          source: user.source ?? 'nearby',
        },
      });
    };

    const showNoRealContacts = (notice: string) => {
      setTransportNotice(notice);
      scanTimer = setTimeout(() => {
        if (!active) return;
        setNearbyUsers([]);
        setScanning(false);
      }, 1700);
    };

    const startNearbySession = async () => {
      addDiagnostic('Checking nearby permissions...');
      const permissionResult = await requestNearbyPermissions();

      if (!active) return;

      const permissionStatus = nearbyTransport.checkPermissions();
      const status = nearbyTransport.getStatus();
      setSetupChecklist(buildSetupChecklist(permissionStatus, status));
      addDiagnostic(describeStatus(status));

      if (!nearbyTransport.isSupported()) {
        showNoRealContacts('Real nearby discovery is unavailable in this build. Install the Android APK on two phones to discover users.');
        return;
      }

      let lanStarted = false;
      let nearbyStarted = false;

      subscriptions.push(
        nearbyTransport.addListener('onEndpointFound', (event) => {
          if (!active) return;
          const source = event.transport === 'lan' ? 'lan' : 'nearby';
          addDiagnostic(`Found ${event.endpointName || 'nearby phone'} via ${source === 'lan' ? 'same Wi-Fi' : 'Nearby'}`);
          upsertNearbyUser(createNearbyUser(event.endpointId, event.endpointName, source));
          setScanning(false);
        }),
        nearbyTransport.addListener('onEndpointLost', (event) => {
          if (!active) return;
          setNearbyUsers((current) => current.filter((user) => user.endpointId !== event.endpointId));
        }),
        nearbyTransport.addListener('onConnectionInitiated', (event) => {
          if (!active) return;
          addDiagnostic(`Connection started with ${event.endpointName || 'nearby phone'}`);

          const nearbyUser = createNearbyUser(
            event.endpointId,
            event.endpointName,
            event.transport === 'lan' ? 'lan' : 'nearby'
          );
          upsertNearbyUser(nearbyUser);

          if (pendingEndpointRef.current === event.endpointId) {
            setPairingRequest({ ...event, direction: 'outgoing' });
            return;
          }

          setPairingRequest({ ...event, direction: 'incoming' });
        }),
        nearbyTransport.addListener('onConnectionResult', (event) => {
          if (!active) return;
          addDiagnostic(`Connection ${event.status}${event.statusCode ? ` (${event.statusCode})` : ''}`);

          const outgoingUser =
            pendingChatUserRef.current?.endpointId === event.endpointId ? pendingChatUserRef.current : null;
          const incomingUser =
            incomingChatUserRef.current?.endpointId === event.endpointId ? incomingChatUserRef.current : null;
          const chatUser = outgoingUser ?? incomingUser;

          if (event.status === 'connected' && chatUser) {
            pendingEndpointRef.current = null;
            pendingChatUserRef.current = null;
            incomingChatUserRef.current = null;
            setSendingRequest(false);
            setSelectedUser(null);
            setPairingRequest(null);
            openNearbyChat(chatUser);
            return;
          }

          if (chatUser) {
            pendingEndpointRef.current = null;
            pendingChatUserRef.current = null;
            incomingChatUserRef.current = null;
            setSendingRequest(false);
            setPairingRequest(null);
            setTransportNotice('The nearby chat request could not be completed.');
          }
        }),
        nearbyTransport.addListener('onError', (event) => {
          if (!active) return;
          setTransportNotice(
            lanStarted && !event.operation.toLowerCase().includes('lan')
              ? `Google Nearby had an issue. Same-Wi-Fi fallback is still active. ${event.message}`
              : event.message
          );
          addDiagnostic(`${event.operation}: ${event.message}`);
          setSendingRequest(false);
        }),
        nearbyTransport.addListener('onStateChanged', (event) => {
          if (!active) return;
          addDiagnostic(`${event.state} ${event.active ? 'started' : 'stopped'}`);
        })
      );

      if (status.wifiEnabled !== false) {
        try {
          if (scanMode === 'auto' || scanMode === 'host') {
            addDiagnostic('Starting same-Wi-Fi host...');
            await nearbyTransport.startLanAdvertising(sessionUsername);
          }

          if (scanMode === 'auto' || scanMode === 'join') {
            addDiagnostic('Starting same-Wi-Fi discovery...');
            await nearbyTransport.startLanDiscovery();
          }

          lanStarted = true;
          addDiagnostic('Same-Wi-Fi fallback active');
        } catch {
          addDiagnostic('Same-Wi-Fi fallback could not start');
        }
      }

      if (!permissionResult.granted) {
        setPermissionIssue(true);
        setTransportNotice(
          lanStarted
            ? 'Same-Wi-Fi fallback is active. Grant Nearby devices and Precise location to also use direct nearby discovery.'
            : 'NexTalk needs Nearby devices and Precise location before direct nearby discovery can start.'
        );
        addDiagnostic(
          `Permission issue: denied ${permissionResult.denied.length}, blocked ${permissionResult.blocked.length}`
        );
      } else {
        addDiagnostic(`Permissions OK (${permissionResult.requested.length || 'no runtime prompts needed'})`);
      }

      const nearbyRadiosReady =
        status.bluetoothEnabled !== false &&
        status.locationEnabled !== false &&
        status.wifiEnabled !== false;

      if (!nearbyRadiosReady) {
        const disabledSettings = [
          status.bluetoothEnabled === false ? 'Bluetooth' : null,
          status.wifiEnabled === false ? 'Wi-Fi' : null,
          status.locationEnabled === false ? 'Location' : null,
        ].filter(Boolean);
        setPermissionIssue(true);
        addDiagnostic(`Turn on ${disabledSettings.join(', ')}`);
      }

      if (permissionResult.granted && nearbyRadiosReady && status.playServicesAvailable) {
        try {
          if (scanMode === 'auto' || scanMode === 'host') {
            addDiagnostic('Starting Google Nearby advertising...');
            await nearbyTransport.startAdvertising(sessionUsername);
          }

          if (scanMode === 'auto' || scanMode === 'join') {
            addDiagnostic('Starting Google Nearby discovery...');
            await nearbyTransport.startDiscovery();
          }

          nearbyStarted = true;
        } catch {
          addDiagnostic('Google Nearby startup failed; same-Wi-Fi fallback remains available');
        }
      } else if (!status.playServicesAvailable) {
        addDiagnostic('Google Nearby unavailable; using same-Wi-Fi fallback');
      }

      if (!active) return;

      if (scanMode === 'host' && (lanStarted || nearbyStarted)) {
        setTransportNotice('Host mode is visible. Set the other phone to Join mode.');
      } else if (!lanStarted && !nearbyStarted) {
        setTransportNotice('No real transport could start. Check Wi-Fi, Bluetooth, location, and permissions.');
        setPermissionIssue(true);
      }

      scanTimer = setTimeout(() => {
        if (!active) return;
        setScanning(false);
      }, 1700);
    };

    void startNearbySession();

    return () => {
      active = false;
      if (scanTimer) clearTimeout(scanTimer);
      subscriptions.forEach((subscription) => subscription.remove());
      void nearbyTransport.stopDiscovery();
      void nearbyTransport.stopAdvertising();
      void nearbyTransport.stopLanDiscovery();
      void nearbyTransport.stopLanAdvertising();
    };
  }, [presentationMode, scanAttempt, scanMode, sessionUsername]);

  const handleSaveSettings = () => {
    const nextName = tempUsername.trim() || 'User';
    setUsername(nextName);
    setShowSettings(false);
  };

  const describeUserDistance = (user: NearbyUser) =>
    user.source === 'demo'
      ? 'Presentation fallback'
      : user.source === 'lan'
        ? 'Same-Wi-Fi device'
        : 'Nearby device';

  const handleOpenChat = async () => {
    if (!selectedUser || sendingRequest) return;

    if (selectedUser.source === 'demo') {
      const demoUser = selectedUser;
      setSelectedUser(null);
      router.push({
        pathname: '/chat/[userId]',
        params: {
          userId: demoUser.id,
          username: sessionUsername,
          endpointId: demoUser.id,
          remoteName: demoUser.name,
          remoteAvatar: demoUser.avatar,
          remoteDistance: String(demoUser.distance),
          source: 'demo',
        },
      });
      return;
    }

    if (selectedUser.endpointId) {
      pendingEndpointRef.current = selectedUser.endpointId;
      pendingChatUserRef.current = selectedUser;
      setSendingRequest(true);

      try {
        await nearbyTransport.requestConnection(selectedUser.endpointId, username);
      } catch {
        pendingEndpointRef.current = null;
        pendingChatUserRef.current = null;
        setSendingRequest(false);
        setTransportNotice('Could not send the nearby chat request.');
      }
      return;
    }

    setSelectedUser(null);
    setTransportNotice('Only real nearby app users can start a chat.');
  };

  const handleConfirmPairing = async () => {
    if (!pairingRequest || (sendingRequest && pairingRequest.direction === 'incoming')) return;

    const nearbyUser = createNearbyUser(
      pairingRequest.endpointId,
      pairingRequest.endpointName,
      pairingRequest.transport === 'lan' ? 'lan' : 'nearby'
    );
    if (pairingRequest.direction === 'incoming') {
      incomingChatUserRef.current = nearbyUser;
    }

    setPairingRequest(null);
    setSendingRequest(true);

    try {
      await nearbyTransport.acceptConnection(pairingRequest.endpointId);
    } catch {
      incomingChatUserRef.current = null;
      pendingEndpointRef.current = null;
      pendingChatUserRef.current = null;
      setSendingRequest(false);
      setTransportNotice('Could not accept the nearby chat request.');
    }
  };

  const handleRejectPairing = async () => {
    if (!pairingRequest) return;

    const endpointId = pairingRequest.endpointId;
    setPairingRequest(null);
    pendingEndpointRef.current = null;
    pendingChatUserRef.current = null;
    incomingChatUserRef.current = null;
    setSendingRequest(false);
    await nearbyTransport.rejectConnection(endpointId);
  };

  const handleRetryPermissions = () => {
    setScanAttempt((attempt) => attempt + 1);
  };

  const handleSetScanMode = (nextMode: ScanMode) => {
    setScanMode(nextMode);
    setScanAttempt((attempt) => attempt + 1);
  };

  const handleSetPresentationMode = (enabled: boolean) => {
    setPresentationMode(enabled);
    setScanAttempt((attempt) => attempt + 1);
  };

  return (
    <LinearGradient colors={nexTalkGradients.background} style={styles.background}>
      <SafeAreaView style={[styles.safeArea, { paddingHorizontal: horizontalPadding }]}>
        <View style={styles.header}>
          <View>
            <View style={styles.titleRow}>
              <Ionicons name="radio-outline" size={26} color={nexTalkColors.cyan} />
              <Text allowFontScaling={false} style={[styles.title, { fontSize: titleSize }]}>
                NexTalk
              </Text>
            </View>
            <Text allowFontScaling={false} style={styles.subtitle}>
              Welcome, {username}
            </Text>
          </View>

          <Pressable onPress={() => setShowSettings(true)} style={styles.iconButton}>
            <Ionicons name="settings-outline" size={20} color={nexTalkColors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.modeControl}>
          {scanModes.map((mode) => {
            const selected = scanMode === mode.value;

            return (
              <Pressable
                key={mode.value}
                onPress={() => handleSetScanMode(mode.value)}
                style={[styles.modeButton, selected && styles.modeButtonActive]}>
                <Text allowFontScaling={false} style={[styles.modeButtonText, selected && styles.modeButtonTextActive]}>
                  {mode.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.radarSection}>
          <View style={[styles.radarFrame, { width: radarSize, height: radarSize }]}>
            {[0, 1, 2, 3].map((ring) => (
              <View
                key={ring}
                style={[
                  styles.radarRing,
                  {
                    width: `${(ring + 1) * 25}%`,
                    height: `${(ring + 1) * 25}%`,
                  },
                ]}
              />
            ))}

            {scanning && <View style={styles.scanGlow} />}

            <View style={styles.centerPulse}>
              <Ionicons name="navigate" size={26} color={nexTalkColors.text} />
            </View>

            {nearbyUsers.map((user) => {
              const distance = (user.distance / 50) * 40;
              const angle = (user.angle * Math.PI) / 180;
              const x = 50 + distance * Math.cos(angle);
              const y = 50 + distance * Math.sin(angle);

              return (
                <Pressable
                  key={user.id}
                  onPress={() => setSelectedUser(user)}
                  style={[
                    styles.radarUser,
                    {
                      left: `${x}%`,
                      top: `${y}%`,
                      backgroundColor: user.avatar,
                      width: radarUserSize,
                      height: radarUserSize,
                      marginLeft: -radarUserSize / 2,
                      marginTop: -radarUserSize / 2,
                    },
                  ]}>
                  <Ionicons name="person" size={14} color={nexTalkColors.text} />
                </Pressable>
              );
            })}
          </View>

          <Text allowFontScaling={false} style={styles.scanText}>
            {scanning
              ? 'Scanning for nearby people...'
              : nearbyUsers.length
                ? `${nearbyUsers.length} NexTalk user${nearbyUsers.length === 1 ? '' : 's'} nearby`
                : (transportNotice ?? 'No NexTalk users nearby yet')}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {setupChecklist.length > 0 && (
            <View style={styles.setupCard}>
              <View style={styles.setupHeader}>
                <Ionicons name="shield-checkmark-outline" size={18} color={nexTalkColors.cyan} />
                <Text allowFontScaling={false} style={styles.setupTitle}>
                  Setup checklist
                </Text>
              </View>
              {setupChecklist.map((item) => (
                <View key={item.key} style={styles.setupRow}>
                  <View
                    style={[
                      styles.setupDot,
                      item.ok === true ? styles.setupDotOk : item.ok === false ? styles.setupDotBad : styles.setupDotPending,
                    ]}>
                    <Ionicons
                      name={item.ok === true ? 'checkmark' : item.ok === false ? 'close' : 'remove'}
                      size={12}
                      color={nexTalkColors.text}
                    />
                  </View>
                  <View style={styles.setupRowText}>
                    <Text allowFontScaling={false} style={styles.setupLabel}>
                      {item.label}
                    </Text>
                    <Text allowFontScaling={false} style={styles.setupDetail}>
                      {item.detail}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {diagnostics.length > 0 && (
            <View style={styles.timelineCard}>
              <View style={styles.setupHeader}>
                <Ionicons name="list-outline" size={18} color={nexTalkColors.cyan} />
                <Text allowFontScaling={false} style={styles.setupTitle}>
                  Connection timeline
                </Text>
              </View>
              {diagnostics.map((entry, index) => (
                <View key={`${entry}-${index}`} style={styles.timelineRow}>
                  <View style={styles.timelineIndex}>
                    <Text allowFontScaling={false} style={styles.timelineIndexText}>
                      {index + 1}
                    </Text>
                  </View>
                  <Text allowFontScaling={false} style={styles.timelineText}>
                    {entry}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {!scanning && !nearbyUsers.length && (
            <View style={styles.emptyNearbyCard}>
              <Ionicons name="radio-outline" size={24} color={nexTalkColors.cyan} />
              <Text allowFontScaling={false} style={styles.emptyNearbyText}>
                {transportNotice ?? 'Keep this screen open on two phones to discover each other offline.'}
              </Text>

              {permissionIssue && (
                <View style={styles.permissionActions}>
                  <Pressable onPress={handleRetryPermissions} style={styles.permissionAction}>
                    <Text allowFontScaling={false} style={styles.permissionActionText}>
                      Try again
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => void Linking.openSettings()} style={styles.permissionActionSecondary}>
                    <Text allowFontScaling={false} style={styles.permissionActionSecondaryText}>
                      Open settings
                    </Text>
                  </Pressable>
                </View>
              )}

            </View>
          )}

          {nearbyUsers.map((user) => (
            <Pressable key={user.id} onPress={() => setSelectedUser(user)} style={styles.userCard}>
              <View style={[styles.userAvatar, { backgroundColor: user.avatar }]}>
                <Ionicons name="person" size={22} color={nexTalkColors.text} />
              </View>

              <View style={styles.userMeta}>
                <Text allowFontScaling={false} style={styles.userName}>
                  {user.name}
                </Text>
                <Text allowFontScaling={false} style={styles.userDistance}>
                  {describeUserDistance(user)}
                </Text>
              </View>

              <View style={styles.userAction}>
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={nexTalkColors.text} />
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={Boolean(selectedUser)} animationType="fade" transparent onRequestClose={() => setSelectedUser(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Pressable onPress={() => setSelectedUser(null)} style={styles.modalClose}>
              <Ionicons name="close" size={18} color={nexTalkColors.textMuted} />
            </Pressable>

            {selectedUser && (
              <>
                <View style={[styles.modalAvatar, { backgroundColor: selectedUser.avatar }]}>
                  <Ionicons name="person" size={36} color={nexTalkColors.text} />
                </View>
                <Text allowFontScaling={false} style={styles.modalTitle}>
                  {selectedUser.name}
                </Text>
                <Text allowFontScaling={false} style={styles.modalBody}>
                  {describeUserDistance(selectedUser)}
                </Text>
                <Text allowFontScaling={false} style={styles.modalHint}>
                  {selectedUser.endpointId
                    ? 'Send a private chat request and confirm the pairing code before encrypted messages can start.'
                    : selectedUser.source === 'demo'
                      ? 'Open a local presentation chat. It is useful for demos but does not connect two phones.'
                      : 'This contact is not a real nearby app user, so chat is unavailable.'}
                </Text>

                <Pressable
                  onPress={handleOpenChat}
                  disabled={sendingRequest || (!selectedUser.endpointId && selectedUser.source !== 'demo')}
                  style={({ pressed }) => [
                    styles.primaryAction,
                    pressed && !sendingRequest && (selectedUser.endpointId || selectedUser.source === 'demo')
                      ? styles.pressed
                      : undefined,
                    sendingRequest || (!selectedUser.endpointId && selectedUser.source !== 'demo') ? styles.disabled : undefined,
                  ]}>
                  <Text allowFontScaling={false} style={styles.primaryActionText}>
                    {sendingRequest
                      ? 'Opening chat...'
                      : selectedUser.endpointId
                        ? 'Request Nearby Chat'
                        : selectedUser.source === 'demo'
                          ? 'Open Demo Chat'
                          : 'Unavailable'}
                  </Text>
                </Pressable>

                <Pressable onPress={() => setSelectedUser(null)} style={styles.secondaryAction}>
                  <Text allowFontScaling={false} style={styles.secondaryActionText}>
                    Cancel
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(pairingRequest)} animationType="fade" transparent onRequestClose={handleRejectPairing}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Pressable onPress={handleRejectPairing} style={styles.modalClose}>
              <Ionicons name="close" size={18} color={nexTalkColors.textMuted} />
            </Pressable>

            {pairingRequest && (
              <>
                <View style={styles.incomingIcon}>
                  <Ionicons name="shield-checkmark-outline" size={34} color={nexTalkColors.text} />
                </View>
                <Text allowFontScaling={false} style={styles.modalTitle}>
                  {pairingRequest.direction === 'incoming' ? pairingRequest.endpointName : 'Confirm pairing'}
                </Text>
                <Text allowFontScaling={false} style={styles.modalBody}>
                  {pairingRequest.direction === 'incoming'
                    ? 'Wants to start a nearby chat'
                    : `Check this code on ${pairingRequest.endpointName || 'the other phone'}`}
                </Text>
                <Text allowFontScaling={false} style={styles.authCode}>
                  {pairingRequest.authenticationDigits ?? 'No code'}
                </Text>
                <Text allowFontScaling={false} style={styles.modalHint}>
                  Both phones must show the same code before continuing.
                </Text>

                <Pressable
                  onPress={handleConfirmPairing}
                  disabled={sendingRequest && pairingRequest.direction === 'incoming'}
                  style={({ pressed }) => [
                    styles.primaryAction,
                    pressed && !(sendingRequest && pairingRequest.direction === 'incoming') ? styles.pressed : undefined,
                    sendingRequest && pairingRequest.direction === 'incoming' ? styles.disabled : undefined,
                  ]}>
                  <Text allowFontScaling={false} style={styles.primaryActionText}>
                    {sendingRequest && pairingRequest.direction === 'incoming' ? 'Connecting...' : 'Code matches'}
                  </Text>
                </Pressable>

                <Pressable onPress={handleRejectPairing} style={styles.secondaryAction}>
                  <Text allowFontScaling={false} style={styles.secondaryActionText}>
                    Cancel pairing
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showSettings} animationType="slide" transparent onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.sheetCard, isCompact && styles.sheetCardCompact]}>
            <View style={styles.sheetHeader}>
              <Text allowFontScaling={false} style={styles.sheetTitle}>
                Settings
              </Text>
              <Pressable onPress={() => setShowSettings(false)} style={styles.modalClose}>
                <Ionicons name="close" size={18} color={nexTalkColors.textMuted} />
              </Pressable>
            </View>

            <View style={styles.settingsBlock}>
              <Text allowFontScaling={false} style={styles.settingsLabel}>
                Display name
              </Text>
              <TextInput
                value={tempUsername}
                onChangeText={setTempUsername}
                placeholder="Enter your name"
                placeholderTextColor={nexTalkColors.textMuted}
                allowFontScaling={false}
                style={styles.settingsInput}
              />
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchTextWrap}>
                <Text allowFontScaling={false} style={styles.settingsLabel}>
                  Silent mode
                </Text>
                <Text allowFontScaling={false} style={styles.switchHint}>
                  {silentMode ? 'Background message alerts are muted' : 'Privacy-safe background alerts are allowed'}
                </Text>
              </View>
              <Switch
                value={silentMode}
                onValueChange={setSilentModeState}
                trackColor={{ false: '#334155', true: '#7C3AED' }}
                thumbColor={nexTalkColors.text}
              />
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchTextWrap}>
                <Text allowFontScaling={false} style={styles.settingsLabel}>
                  Presentation fallback
                </Text>
                <Text allowFontScaling={false} style={styles.switchHint}>
                  {presentationMode ? 'Demo users are shown locally' : 'Nearby and same-Wi-Fi discovery are active'}
                </Text>
              </View>
              <Switch
                value={presentationMode}
                onValueChange={handleSetPresentationMode}
                trackColor={{ false: '#334155', true: '#0891B2' }}
                thumbColor={nexTalkColors.text}
              />
            </View>

            <Pressable onPress={handleSaveSettings} style={styles.primaryAction}>
              <Text allowFontScaling={false} style={styles.primaryActionText}>
                Save settings
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: nexTalkColors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: nexTalkColors.textMuted,
    marginTop: 4,
    fontSize: 14,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: nexTalkColors.surface,
    borderWidth: 1,
    borderColor: nexTalkColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeControl: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
    padding: 4,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.5)',
  },
  modeButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: nexTalkColors.cyan,
  },
  modeButtonText: {
    color: nexTalkColors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  modeButtonTextActive: {
    color: nexTalkColors.text,
  },
  radarSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  radarFrame: {
    width: 320,
    height: 320,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  radarRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.25)',
  },
  scanGlow: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: 'rgba(34, 211, 238, 0.08)',
  },
  centerPulse: {
    width: 60,
    height: 60,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: nexTalkColors.cyan,
    ...nexTalkShadow,
  },
  radarUser: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -18,
    marginTop: -18,
  },
  scanText: {
    color: nexTalkColors.cyan,
    fontWeight: '700',
    fontSize: 15,
    marginTop: 12,
  },
  listContent: {
    gap: 12,
    paddingBottom: 32,
  },
  emptyNearbyCard: {
    alignItems: 'center',
    gap: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: nexTalkColors.border,
    backgroundColor: nexTalkColors.surface,
    padding: 18,
  },
  emptyNearbyText: {
    color: nexTalkColors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  setupCard: {
    gap: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: nexTalkColors.border,
    backgroundColor: nexTalkColors.surface,
    padding: 16,
  },
  setupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setupTitle: {
    color: nexTalkColors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  setupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  setupDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupDotOk: {
    backgroundColor: nexTalkColors.emerald,
  },
  setupDotBad: {
    backgroundColor: nexTalkColors.red,
  },
  setupDotPending: {
    backgroundColor: nexTalkColors.amber,
  },
  setupRowText: {
    flex: 1,
  },
  setupLabel: {
    color: nexTalkColors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  setupDetail: {
    color: nexTalkColors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  timelineCard: {
    gap: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.55)',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    padding: 16,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  timelineIndex: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34, 211, 238, 0.16)',
  },
  timelineIndexText: {
    color: nexTalkColors.cyan,
    fontSize: 10,
    fontWeight: '800',
  },
  timelineText: {
    flex: 1,
    color: nexTalkColors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  permissionActions: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  permissionAction: {
    flex: 1,
    minHeight: 42,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: nexTalkColors.cyan,
  },
  permissionActionText: {
    color: nexTalkColors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  permissionActionSecondary: {
    flex: 1,
    minHeight: 42,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: nexTalkColors.border,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  permissionActionSecondaryText: {
    color: nexTalkColors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: nexTalkColors.border,
    backgroundColor: nexTalkColors.surface,
    padding: 16,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userMeta: {
    flex: 1,
  },
  userName: {
    color: nexTalkColors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  userDistance: {
    color: nexTalkColors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  userAction: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: nexTalkColors.cyan,
    ...nexTalkShadow,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 30,
    padding: 24,
    backgroundColor: nexTalkColors.surfaceStrong,
    borderWidth: 1,
    borderColor: nexTalkColors.border,
    alignItems: 'center',
    gap: 14,
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  modalAvatar: {
    width: 88,
    height: 88,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  incomingIcon: {
    width: 80,
    height: 80,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: nexTalkColors.cyan,
    ...nexTalkShadow,
  },
  modalTitle: {
    color: nexTalkColors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  modalBody: {
    color: nexTalkColors.textMuted,
    fontSize: 14,
  },
  modalHint: {
    color: nexTalkColors.textMuted,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  authCode: {
    minWidth: 120,
    borderRadius: 18,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 10,
    color: nexTalkColors.text,
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.28)',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  primaryAction: {
    width: '100%',
    minHeight: 54,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: nexTalkColors.cyan,
    marginTop: 4,
    ...nexTalkShadow,
  },
  primaryActionText: {
    color: nexTalkColors.text,
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryAction: {
    width: '100%',
    minHeight: 50,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: nexTalkColors.border,
  },
  secondaryActionText: {
    color: nexTalkColors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  sheetCard: {
    width: '100%',
    borderRadius: 30,
    padding: 22,
    backgroundColor: nexTalkColors.surfaceStrong,
    borderWidth: 1,
    borderColor: nexTalkColors.border,
    gap: 18,
  },
  sheetCardCompact: {
    padding: 18,
    borderRadius: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sheetTitle: {
    color: nexTalkColors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  settingsBlock: {
    gap: 10,
  },
  settingsLabel: {
    color: nexTalkColors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  settingsInput: {
    minHeight: 52,
    borderRadius: 18,
    paddingHorizontal: 16,
    color: nexTalkColors.text,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: nexTalkColors.border,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  switchTextWrap: {
    flex: 1,
  },
  switchHint: {
    color: nexTalkColors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.5,
  },
});
