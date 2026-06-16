import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MessageComposer } from '@/components/nextalk/message-composer';
import { MessageFeed } from '@/components/nextalk/message-feed';
import {
  Message,
  NearbyUser,
  createId,
  getUserById,
} from '@/features/nextalk/data';
import {
  NEARBY_WIPE_TIMEOUT_MS,
  NearbySecureSessionStatus,
  createEphemeralSessionKey,
  createNearbyRoomId,
  createSessionKeyFingerprint,
  decodeNearbyPayload,
  encodeNearbyMessage,
  encodePeerLeftPayload,
  encodeReceiptPayload,
  encodeTypingPayload,
  nearbyTransport,
} from '@/features/nextalk/nearby-transport';
import { nexTalkColors, nexTalkGradients, nexTalkShadow } from '@/features/nextalk/theme';

export default function ChatScreen() {
  const {
    userId,
    username: usernameParam,
    endpointId: endpointIdParam,
    remoteName,
    remoteAvatar,
    remoteDistance,
    source,
  } = useLocalSearchParams<{
    userId: string;
    username?: string;
    endpointId?: string;
    remoteName?: string;
    remoteAvatar?: string;
    remoteDistance?: string;
    source?: string;
  }>();
  const liveEndpointId = typeof endpointIdParam === 'string' ? endpointIdParam : '';
  const isLiveNearbyChat = Boolean(liveEndpointId && (source === 'nearby' || source === 'lan'));
  const isDemoChat = source === 'demo';
  const paramUser = useMemo<NearbyUser | null>(
    () =>
      typeof remoteName === 'string' && remoteName.trim()
        ? {
            id: typeof userId === 'string' ? userId : liveEndpointId,
            endpointId: liveEndpointId,
            name: remoteName.trim(),
            avatar: typeof remoteAvatar === 'string' ? remoteAvatar : nexTalkColors.cyan,
            distance: typeof remoteDistance === 'string' ? Number.parseInt(remoteDistance, 10) || 1 : 1,
            angle: 0,
            status: 'online',
            source: source === 'demo' ? 'demo' : source === 'lan' ? 'lan' : 'nearby',
          }
        : null,
    [liveEndpointId, remoteAvatar, remoteDistance, remoteName, source, userId]
  );
  const selectedUser = useMemo(() => paramUser ?? getUserById(userId), [paramUser, userId]);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = width < 390;
  const horizontalPadding = isCompact ? 14 : 18;
  const messageScrollRef = useRef<ScrollView>(null);
  const timersRef = useRef<number[]>([]);
  const wipeCountdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wipeExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wipeStartedRef = useRef(false);
  const remoteTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localTypingActiveRef = useRef(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [typingParticipant, setTypingParticipant] = useState(selectedUser);
  const [showInfo, setShowInfo] = useState(false);
  const [wipeCountdownSeconds, setWipeCountdownSeconds] = useState<number | null>(null);
  const [chatLocked, setChatLocked] = useState(false);
  const username = typeof usernameParam === 'string' ? usernameParam.trim() : '';
  const sessionKey = useMemo(() => createEphemeralSessionKey(), []);
  const sessionKeyFingerprint = useMemo(() => createSessionKeyFingerprint(sessionKey), [sessionKey]);
  const [secureSession, setSecureSession] = useState<NearbySecureSessionStatus>(
    isDemoChat
      ? { active: true, fingerprint: sessionKeyFingerprint }
      : { active: false, fingerprint: '' }
  );
  const roomId = useMemo(
    () => (isLiveNearbyChat ? createNearbyRoomId() : undefined),
    [isLiveNearbyChat]
  );

  const clearWipeTimers = useCallback(() => {
    if (wipeCountdownTimerRef.current) {
      clearInterval(wipeCountdownTimerRef.current);
      wipeCountdownTimerRef.current = null;
    }

    if (wipeExitTimerRef.current) {
      clearTimeout(wipeExitTimerRef.current);
      wipeExitTimerRef.current = null;
    }
  }, []);

  const clearTypingTimers = useCallback(() => {
    if (remoteTypingTimerRef.current) {
      clearTimeout(remoteTypingTimerRef.current);
      remoteTypingTimerRef.current = null;
    }

    if (localTypingTimerRef.current) {
      clearTimeout(localTypingTimerRef.current);
      localTypingTimerRef.current = null;
    }
  }, []);

  const finishWipeAndReturn = useCallback(() => {
    clearWipeTimers();
    wipeStartedRef.current = false;
    setMessages([]);
    setInputText('');
    setTypingParticipant(null);
    setSecureSession(
      isDemoChat
        ? { active: true, fingerprint: sessionKeyFingerprint }
        : { active: false, fingerprint: '' }
    );
    setWipeCountdownSeconds(null);
    setChatLocked(false);
    router.replace({
      pathname: '/discovery',
      params: { username },
    });
  }, [clearWipeTimers, isDemoChat, sessionKeyFingerprint, username]);

  const startPeerWipeCountdown = useCallback(
    (notice: string) => {
      if (wipeStartedRef.current) return;

      wipeStartedRef.current = true;
      setChatLocked(true);
      setTypingParticipant(null);
      setInputText('');
      setWipeCountdownSeconds(Math.ceil(NEARBY_WIPE_TIMEOUT_MS / 1000));
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          text: notice,
          senderId: null,
          senderName: 'NexTalk',
          timestamp: new Date().toISOString(),
          kind: 'system',
        },
      ]);

      const wipeDeadline = Date.now() + NEARBY_WIPE_TIMEOUT_MS;
      wipeCountdownTimerRef.current = setInterval(() => {
        const secondsLeft = Math.max(0, Math.ceil((wipeDeadline - Date.now()) / 1000));
        setWipeCountdownSeconds(secondsLeft);

        if (secondsLeft <= 0 && wipeCountdownTimerRef.current) {
          clearInterval(wipeCountdownTimerRef.current);
          wipeCountdownTimerRef.current = null;
        }
      }, 1000);

      wipeExitTimerRef.current = setTimeout(finishWipeAndReturn, NEARBY_WIPE_TIMEOUT_MS);
    },
    [finishWipeAndReturn]
  );

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timersRef.current = timersRef.current.filter((entry) => entry !== timer);
      callback();
    }, delay) as unknown as number;

    timersRef.current.push(timer);
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      clearWipeTimers();
      clearTypingTimers();
    };
  }, [clearTypingTimers, clearWipeTimers]);

  useEffect(() => {
    if (!username) {
      router.replace('/');
      return;
    }

    if (!selectedUser) return;

    clearWipeTimers();
    clearTypingTimers();
    wipeStartedRef.current = false;
    setWipeCountdownSeconds(null);
    setChatLocked(false);

    setMessages([
      {
        id: createId(),
        text: isDemoChat
          ? 'Presentation fallback chat opened. This simulates the chat flow on one phone only.'
          : 'Private peer connection established. An end-to-end encryption key is being prepared for this session.',
        senderId: null,
        senderName: 'NexTalk',
        timestamp: new Date().toISOString(),
        kind: 'system',
      },
    ]);

    setTypingParticipant(null);
    setSecureSession(
      isDemoChat
        ? { active: true, fingerprint: sessionKeyFingerprint }
        : nearbyTransport.getSecureSessionStatus(liveEndpointId)
    );
    setShowInfo(false);
  }, [
    clearTypingTimers,
    clearWipeTimers,
    isDemoChat,
    isLiveNearbyChat,
    liveEndpointId,
    selectedUser,
    sessionKeyFingerprint,
    username,
  ]);

  useEffect(() => {
    messageScrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, typingParticipant]);

  useEffect(() => {
    if (!isLiveNearbyChat || !liveEndpointId) return;

    setSecureSession(nearbyTransport.getSecureSessionStatus(liveEndpointId));

    const secureSubscription = nearbyTransport.addListener('onSecureSessionChanged', (event) => {
      if (event.endpointId !== liveEndpointId) return;
      setSecureSession({ active: event.active, fingerprint: event.fingerprint });
    });

    return () => {
      secureSubscription.remove();
    };
  }, [isLiveNearbyChat, liveEndpointId]);

  useEffect(() => {
    if (!isLiveNearbyChat || !liveEndpointId || !selectedUser) return;

    const payloadSubscription = nearbyTransport.addListener('onPayloadReceived', (event) => {
      if (event.endpointId !== liveEndpointId) return;

      const payload = decodeNearbyPayload(event.text);
      if (!payload) return;

      if (payload.type === 'typing') {
        if (remoteTypingTimerRef.current) {
          clearTimeout(remoteTypingTimerRef.current);
          remoteTypingTimerRef.current = null;
        }

        setTypingParticipant(payload.active ? selectedUser : null);
        if (payload.active) {
          remoteTypingTimerRef.current = setTimeout(() => {
            setTypingParticipant(null);
            remoteTypingTimerRef.current = null;
          }, 1800);
        }
        return;
      }

      if (payload.type === 'receipt') {
        setMessages((current) =>
          current.map((message) =>
            message.id === payload.messageId ? { ...message, status: 'delivered' } : message
          )
        );
        return;
      }

      if (payload.type === 'peer_left') {
        startPeerWipeCountdown(`${payload.senderName || selectedUser.name} left. This chat will wipe in 60 seconds.`);
        return;
      }

      if (payload.type === 'room_wiped') {
        finishWipeAndReturn();
        return;
      }

      void nearbyTransport
        .sendSecureMessage(liveEndpointId, encodeReceiptPayload(payload.id, roomId))
        .catch(() => undefined);

      setMessages((current) => {
        if (current.some((message) => message.id === payload.id)) return current;

        return [
          ...current,
          {
            id: payload.id,
            text: payload.text,
            senderId: liveEndpointId,
            senderName: payload.senderName || selectedUser.name,
            timestamp: payload.sentAt,
            kind: 'message',
            status: 'delivered',
          },
        ];
      });
    });

    const disconnectSubscription = nearbyTransport.addListener('onDisconnected', (event) => {
      if (event.endpointId !== liveEndpointId) return;

      setSecureSession({ active: false, fingerprint: '' });
      startPeerWipeCountdown('The other person disconnected. This chat will wipe in 60 seconds.');
    });

    return () => {
      payloadSubscription.remove();
      disconnectSubscription.remove();
    };
  }, [finishWipeAndReturn, isLiveNearbyChat, liveEndpointId, roomId, selectedUser, startPeerWipeCountdown]);

  const stopLocalTyping = useCallback(() => {
    if (localTypingTimerRef.current) {
      clearTimeout(localTypingTimerRef.current);
      localTypingTimerRef.current = null;
    }

    if (localTypingActiveRef.current && isLiveNearbyChat && liveEndpointId && secureSession.active) {
      void nearbyTransport
        .sendSecureMessage(liveEndpointId, encodeTypingPayload(username, false, roomId))
        .catch(() => undefined);
    }
    localTypingActiveRef.current = false;
  }, [isLiveNearbyChat, liveEndpointId, roomId, secureSession.active, username]);

  const handleInputChange = useCallback(
    (value: string) => {
      setInputText(value);
      if (!isLiveNearbyChat || !liveEndpointId || !secureSession.active || chatLocked) return;

      if (!value.trim()) {
        stopLocalTyping();
        return;
      }

      if (!localTypingActiveRef.current) {
        localTypingActiveRef.current = true;
        void nearbyTransport
          .sendSecureMessage(liveEndpointId, encodeTypingPayload(username, true, roomId))
          .catch(() => undefined);
      }

      if (localTypingTimerRef.current) {
        clearTimeout(localTypingTimerRef.current);
      }
      localTypingTimerRef.current = setTimeout(stopLocalTyping, 1200);
    },
    [chatLocked, isLiveNearbyChat, liveEndpointId, roomId, secureSession.active, stopLocalTyping, username]
  );

  if (!selectedUser) {
    return (
      <LinearGradient colors={nexTalkGradients.background} style={styles.background}>
        <SafeAreaView style={styles.emptyState}>
          <Text style={styles.emptyText}>Chat not found.</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const activeMemberList = [
    { id: 'me', name: `${username || 'You'} (You)`, avatar: nexTalkColors.cyan, distance: 0, source: 'nearby' as const },
    selectedUser,
  ];

  const handleEndChat = () => {
    setShowInfo(false);
    setTypingParticipant(null);
    setMessages([]);
    setInputText('');
    setWipeCountdownSeconds(null);
    setChatLocked(false);
    clearWipeTimers();
    clearTypingTimers();
    localTypingActiveRef.current = false;
    wipeStartedRef.current = false;
    if (liveEndpointId) {
      const leavePayload = encodePeerLeftPayload(username, roomId);
      const leaveRequest = secureSession.active
        ? nearbyTransport.sendSecureMessage(liveEndpointId, leavePayload)
        : nearbyTransport.sendMessage(liveEndpointId, leavePayload);

      void leaveRequest
        .catch(() => undefined)
        .finally(() => {
          void nearbyTransport.disconnect(liveEndpointId);
        });
    }
    router.replace({
      pathname: '/discovery',
      params: { username },
    });
  };

  const handleSend = async () => {
    if (chatLocked || (isLiveNearbyChat && !secureSession.active)) return;

    const trimmedMessage = inputText.trim();
    if (!trimmedMessage) return;

    stopLocalTyping();

    const newMessage: Message = {
      id: createId(),
      text: trimmedMessage,
      senderId: 'me',
      senderName: username,
      timestamp: new Date().toISOString(),
      kind: 'message',
      status: 'sending',
    };

    setMessages((current) => [...current, newMessage]);
    setInputText('');

    if (isLiveNearbyChat && liveEndpointId) {
      try {
        await nearbyTransport.sendSecureMessage(liveEndpointId, encodeNearbyMessage(newMessage, roomId));
        setMessages((current) =>
          current.map((message) =>
            message.id === newMessage.id ? { ...message, status: 'sent' } : message
          )
        );
      } catch {
        setMessages((current) =>
          current.map((message) =>
            message.id === newMessage.id ? { ...message, status: 'failed' } : message
          )
        );
      }
      return;
    }

    schedule(() => {
      setMessages((current) =>
        current.map((message) =>
          message.id === newMessage.id ? { ...message, status: 'sent' } : message
        )
      );
    }, 300);

    schedule(() => {
      setMessages((current) =>
        current.map((message) =>
          message.id === newMessage.id ? { ...message, status: 'delivered' } : message
        )
      );
    }, 700);

    if (isDemoChat) {
      schedule(() => {
        setTypingParticipant(selectedUser);
      }, 850);

      schedule(() => {
        setTypingParticipant(null);
        setMessages((current) => [
          ...current,
          {
            id: createId(),
            text: 'Demo reply received. The real mode uses Nearby Connections when both phones finish Host/Join pairing.',
            senderId: selectedUser.id,
            senderName: selectedUser.name,
            timestamp: new Date().toISOString(),
            kind: 'message',
            status: 'delivered',
          },
        ]);
      }, 1700);
    }
  };

  return (
    <LinearGradient colors={nexTalkGradients.background} style={styles.background}>
      <SafeAreaView style={[styles.safeArea, { paddingHorizontal: horizontalPadding }]}>
        <View style={styles.header}>
          <Pressable onPress={handleEndChat} style={styles.circleButton}>
            <Ionicons name="arrow-back" size={20} color={nexTalkColors.text} />
          </Pressable>

          <View style={styles.headerMain}>
            <View style={[styles.headerAvatar, { backgroundColor: selectedUser.avatar }]}>
              <Ionicons name="person" size={isCompact ? 18 : 22} color={nexTalkColors.text} />
              <View style={styles.onlineDot} />
            </View>
            <View style={styles.headerMeta}>
              <Text allowFontScaling={false} numberOfLines={1} style={[styles.headerTitle, isCompact && styles.headerTitleCompact]}>
                {selectedUser.name}
              </Text>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.headerSubtitle}>
                {selectedUser.source === 'demo'
                  ? 'Presentation fallback'
                  : selectedUser.source === 'lan'
                    ? 'Same-Wi-Fi device'
                    : 'Nearby device'}
              </Text>
            </View>
          </View>

          <Pressable onPress={() => setShowInfo(true)} style={[styles.circleButton, isCompact && styles.circleButtonCompact]}>
            <Ionicons name="information-circle-outline" size={20} color={nexTalkColors.cyan} />
          </Pressable>
        </View>

        <View style={[styles.securityBadge, !secureSession.active && styles.securityBadgePending]}>
          <Ionicons
            name={secureSession.active ? 'lock-closed-outline' : 'sync-outline'}
            size={14}
            color={secureSession.active ? nexTalkColors.emerald : nexTalkColors.amber}
          />
          <Text allowFontScaling={false} style={styles.securityBadgeText}>
            {isDemoChat
              ? `Local demo session ${sessionKeyFingerprint}`
              : secureSession.active
                ? `End-to-end encrypted ${secureSession.fingerprint}`
                : 'Securing peer-to-peer session...'}
          </Text>
        </View>

        <View style={styles.chatActionStrip}>
          <Text allowFontScaling={false} style={styles.chatActionHint}>
            {wipeCountdownSeconds === null
              ? isDemoChat
                ? 'Presentation fallback active'
                : selectedUser.source === 'lan'
                  ? 'Private same-Wi-Fi chat active'
                  : 'Private nearby chat active'
              : `Peer left. Wiping in ${wipeCountdownSeconds}s`}
          </Text>
          <Pressable onPress={handleEndChat} style={styles.endChatButton}>
            <Ionicons name="close-circle-outline" size={16} color={nexTalkColors.red} />
            <Text allowFontScaling={false} style={styles.endChatText}>
              End chat
            </Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.chatShell}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 20}>
          <ScrollView
            ref={messageScrollRef}
            contentContainerStyle={[styles.messageList, { paddingBottom: Math.max(20, insets.bottom + 12) }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <MessageFeed messages={messages} typingParticipant={typingParticipant} showSenderNames={false} />
          </ScrollView>

          <View style={[styles.composerWrap, { paddingBottom: Math.max(12, insets.bottom + 6) }]}>
            <MessageComposer
              value={inputText}
              onChange={handleInputChange}
              onSend={handleSend}
              disabled={chatLocked || (isLiveNearbyChat && !secureSession.active)}
              placeholder={
                chatLocked
                  ? 'Chat is ending...'
                  : isLiveNearbyChat && !secureSession.active
                    ? 'Securing connection...'
                    : 'Type a message...'
              }
            />
          </View>
        </KeyboardAvoidingView>

        <Modal visible={showInfo} animationType="slide" transparent onRequestClose={() => setShowInfo(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.infoCard}>
              <View style={styles.modalHeader}>
                <Text allowFontScaling={false} style={styles.modalTitle}>
                  Contact info
                </Text>
                <Pressable onPress={() => setShowInfo(false)} style={styles.circleButtonSmall}>
                  <Ionicons name="close" size={16} color={nexTalkColors.textMuted} />
                </Pressable>
              </View>

              <View style={styles.infoList}>
                {activeMemberList.map((member) => (
                  <View key={member.id} style={styles.infoRow}>
                    <View style={[styles.infoAvatar, { backgroundColor: member.avatar }]}>
                      <Ionicons name="person" size={18} color={nexTalkColors.text} />
                    </View>
                    <View style={styles.infoMeta}>
                      <Text allowFontScaling={false} style={styles.infoName}>
                        {member.name}
                      </Text>
                      <Text allowFontScaling={false} style={styles.infoHint}>
                        {member.id === 'me'
                          ? 'Local device'
                          : member.source === 'demo'
                          ? 'Demo participant'
                          : member.source === 'lan'
                            ? 'Same-Wi-Fi device'
                            : 'Nearby device'}
                      </Text>
                    </View>
                    <View style={styles.infoDot} />
                  </View>
                ))}

                <Pressable onPress={handleEndChat} style={styles.infoDangerAction}>
                  <Text allowFontScaling={false} style={styles.infoDangerActionText}>
                    End chat
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: 18, paddingTop: 12 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: nexTalkColors.text, fontSize: 18, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  circleButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: nexTalkColors.surface,
    borderWidth: 1,
    borderColor: nexTalkColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleButtonCompact: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  circleButtonSmall: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: nexTalkColors.emerald,
    borderWidth: 2,
    borderColor: nexTalkColors.backgroundStart,
  },
  headerMeta: { flex: 1 },
  headerTitle: { color: nexTalkColors.text, fontSize: 18, fontWeight: '800' },
  headerTitleCompact: { fontSize: 16 },
  headerSubtitle: { color: nexTalkColors.textMuted, fontSize: 12, marginTop: 3 },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.22)',
  },
  securityBadgeText: {
    color: nexTalkColors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  securityBadgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.24)',
  },
  chatActionStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.45)',
  },
  chatActionHint: { color: nexTalkColors.textMuted, flex: 1, fontSize: 12, lineHeight: 17 },
  endChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(251, 113, 133, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(251, 113, 133, 0.22)',
  },
  endChatText: { color: nexTalkColors.red, fontSize: 12, fontWeight: '700' },
  chatShell: { flex: 1, marginTop: 14 },
  messageList: { paddingBottom: 20, gap: 12 },
  composerWrap: {
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(51, 65, 85, 0.4)',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.7)',
    padding: 18,
  },
  infoCard: {
    borderRadius: 30,
    padding: 22,
    backgroundColor: nexTalkColors.surfaceStrong,
    borderWidth: 1,
    borderColor: nexTalkColors.border,
    gap: 16,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { color: nexTalkColors.text, fontSize: 22, fontWeight: '800' },
  infoList: { gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoMeta: { flex: 1 },
  infoName: { color: nexTalkColors.text, fontSize: 15, fontWeight: '700' },
  infoHint: { color: nexTalkColors.textMuted, fontSize: 12, marginTop: 2 },
  infoDot: { width: 10, height: 10, borderRadius: 999, backgroundColor: nexTalkColors.emerald },
  infoDangerAction: {
    minHeight: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(251, 113, 133, 0.22)',
    backgroundColor: 'rgba(251, 113, 133, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    ...nexTalkShadow,
    shadowColor: nexTalkColors.red,
    shadowOpacity: 0.12,
  },
  infoDangerActionText: {
    color: nexTalkColors.red,
    fontSize: 14,
    fontWeight: '800',
  },
});
