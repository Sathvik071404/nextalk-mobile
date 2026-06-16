import { Animated, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef } from 'react';

import { Message, NearbyUser } from '@/features/nextalk/data';
import { nexTalkColors } from '@/features/nextalk/theme';

function TypingDots() {
  const dots = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;

  useEffect(() => {
    const animations = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 120),
          Animated.timing(dot, {
            toValue: -6,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 260,
            useNativeDriver: true,
          }),
        ])
      )
    );

    animations.forEach((animation) => animation.start());
    return () => {
      animations.forEach((animation) => animation.stop());
    };
  }, [dots]);

  return (
    <View style={styles.typingDots}>
      {dots.map((dot, index) => (
        <Animated.View key={index} style={[styles.dot, { transform: [{ translateY: dot }] }]} />
      ))}
    </View>
  );
}

export function MessageFeed({
  messages,
  typingParticipant,
  showSenderNames,
  compact = false,
}: {
  messages: Message[];
  typingParticipant: NearbyUser | null;
  showSenderNames: boolean;
  compact?: boolean;
}) {
  return (
    <View style={styles.feed}>
      {messages.map((message) => {
        if (message.kind === 'system') {
          return (
            <View key={message.id} style={styles.systemRow}>
              <View style={[styles.systemBubble, compact && styles.systemBubbleCompact]}>
                <Text allowFontScaling={false} style={[styles.systemText, compact && styles.systemTextCompact]}>
                  {message.text}
                </Text>
              </View>
            </View>
          );
        }

        const isMine = message.senderId === 'me';
        const time = new Date(message.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        const status =
          message.status === 'sending'
            ? 'Sending'
            : message.status === 'failed'
              ? 'Failed'
              : message.status === 'sent'
              ? 'Sent'
              : 'Delivered';

        return (
            <View key={message.id} style={[styles.messageRow, isMine ? styles.alignEnd : styles.alignStart]}>
            <View style={[styles.messageColumn, isMine ? styles.alignEnd : styles.alignStart]}>
              {!isMine && showSenderNames && (
                <Text allowFontScaling={false} style={[styles.senderName, compact && styles.senderNameCompact]}>
                  {message.senderName}
                </Text>
              )}
              <View
                style={[
                  styles.messageBubble,
                  compact && styles.messageBubbleCompact,
                  isMine ? styles.mineBubble : styles.otherBubble,
                ]}>
                <Text allowFontScaling={false} style={[styles.messageText, compact && styles.messageTextCompact]}>
                  {message.text}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Text allowFontScaling={false} style={[styles.metaText, compact && styles.metaTextCompact]}>
                  {time}
                </Text>
                {isMine && (
                  <Text allowFontScaling={false} style={[styles.metaText, compact && styles.metaTextCompact]}>
                    {status}
                  </Text>
                )}
              </View>
            </View>
          </View>
        );
      })}

      {typingParticipant && (
        <View style={[styles.messageRow, styles.alignStart]}>
          <View style={styles.messageColumn}>
            {showSenderNames && (
              <Text allowFontScaling={false} style={[styles.senderName, compact && styles.senderNameCompact]}>
                {typingParticipant.name}
              </Text>
            )}
            <View style={[styles.messageBubble, compact && styles.messageBubbleCompact, styles.otherBubble]}>
              <TypingDots />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  feed: {
    gap: 14,
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageColumn: {
    maxWidth: '84%',
    gap: 6,
  },
  alignStart: {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  alignEnd: {
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  senderName: {
    color: nexTalkColors.cyan,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
  },
  senderNameCompact: {
    fontSize: 11,
  },
  messageBubble: {
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  messageBubbleCompact: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mineBubble: {
    backgroundColor: nexTalkColors.cyan,
    borderBottomRightRadius: 8,
  },
  otherBubble: {
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: nexTalkColors.border,
    borderBottomLeftRadius: 8,
  },
  messageText: {
    color: nexTalkColors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  messageTextCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
  },
  metaText: {
    color: nexTalkColors.textMuted,
    fontSize: 11,
  },
  metaTextCompact: {
    fontSize: 10,
  },
  systemRow: {
    alignItems: 'center',
  },
  systemBubble: {
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    borderColor: 'rgba(34, 211, 238, 0.25)',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  systemBubbleCompact: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  systemText: {
    color: '#C5F7FF',
    fontSize: 12,
    textAlign: 'center',
  },
  systemTextCompact: {
    fontSize: 11,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: nexTalkColors.textMuted,
  },
});
