import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { nexTalkColors, nexTalkShadow } from '@/features/nextalk/theme';

export function MessageComposer({
  value,
  onChange,
  onSend,
  compact = false,
  disabled = false,
  placeholder = 'Type a message...',
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  compact?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const sendDisabled = disabled || !value.trim();

  return (
    <View style={styles.row}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={nexTalkColors.textMuted}
        multiline
        editable={!disabled}
        allowFontScaling={false}
        style={[styles.input, compact && styles.inputCompact, disabled && styles.disabledInput]}
      />

      <Pressable
        onPress={onSend}
        disabled={sendDisabled}
        style={({ pressed }) => [
          styles.sendButton,
          compact && styles.sendButtonCompact,
          pressed && !sendDisabled ? styles.pressed : undefined,
          sendDisabled ? styles.disabled : undefined,
        ]}>
        <Ionicons name="send" size={compact ? 16 : 20} color={nexTalkColors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: nexTalkColors.border,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    color: nexTalkColors.text,
    fontSize: 15,
  },
  inputCompact: {
    minHeight: 44,
    maxHeight: 88,
    borderRadius: 20,
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  disabledInput: {
    opacity: 0.58,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: nexTalkColors.cyan,
    ...nexTalkShadow,
  },
  sendButtonCompact: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.45,
  },
});
