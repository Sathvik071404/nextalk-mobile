import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { onboardingSlides } from '@/features/nextalk/data';
import { nexTalkColors, nexTalkGradients, nexTalkShadow } from '@/features/nextalk/theme';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const onboardingLogo = require('../../assets/images/icon.png');

export default function OnboardingScreen() {
  const { width, height } = useWindowDimensions();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showUsernameStep, setShowUsernameStep] = useState(false);
  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const isCompact = width < 390;
  const isShortScreen = height < 760;
  const horizontalPadding = isCompact ? 18 : 24;
  const heroSize = isCompact ? 88 : 104;
  const heroIconSize = isCompact ? 38 : 44;
  const titleSize = isCompact ? 28 : 32;
  const titleLineHeight = isCompact ? 34 : 38;
  const descriptionSize = isCompact ? 15 : 17;
  const descriptionLineHeight = isCompact ? 22 : 26;
  const logoSize = clamp(width * 0.28, 92, 118);
  const contentMaxWidth = Math.min(width - horizontalPadding * 2, 360);

  const currentItem = onboardingSlides[currentSlide];
  const showLogoHero = currentSlide === 0;

  const handleNext = () => {
    if (currentSlide < onboardingSlides.length - 1) {
      setCurrentSlide((slide) => slide + 1);
      return;
    }

    setShowUsernameStep(true);
  };

  const handleStart = () => {
    const nextUsername = username.trim();
    if (!nextUsername || saving) return;

    setSaving(true);
    router.replace({
      pathname: '/discovery',
      params: { username: nextUsername },
    });
  };

  return (
    <LinearGradient colors={nexTalkGradients.background} style={styles.background}>
      <SafeAreaView style={[styles.safeArea, { paddingHorizontal: horizontalPadding }]}>
        <View style={styles.contentLayer}>
          {showUsernameStep ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
              style={styles.usernameAvoider}>
              <ScrollView
                contentContainerStyle={[
                  styles.usernameStep,
                  isShortScreen && styles.usernameStepCompact,
                  { minHeight: Math.max(height - 80, 520) },
                ]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <View style={[styles.heroIcon, { width: heroSize, height: heroSize }]}>
                  <Ionicons name="radio-outline" size={heroIconSize} color={nexTalkColors.text} />
                </View>

                <Text allowFontScaling={false} style={[styles.title, { fontSize: titleSize, lineHeight: titleLineHeight }]}>
                  Welcome to NexTalk
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.description,
                    {
                      fontSize: descriptionSize,
                      lineHeight: descriptionLineHeight,
                      maxWidth: contentMaxWidth,
                    },
                  ]}>
                  Choose the display name other nearby people will see.
                </Text>

                <View style={[styles.formCard, isCompact && styles.formCardCompact]}>
                  <TextInput
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="words"
                    autoComplete="name"
                    autoFocus
                    onSubmitEditing={handleStart}
                    placeholder="Enter your name"
                    placeholderTextColor={nexTalkColors.textMuted}
                    returnKeyType="done"
                    allowFontScaling={false}
                    style={styles.input}
                  />

                  <Pressable
                    onPress={handleStart}
                    disabled={!username.trim() || saving}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && username.trim() ? styles.pressed : undefined,
                      (!username.trim() || saving) ? styles.disabled : undefined,
                    ]}>
                    <Text allowFontScaling={false} style={styles.primaryButtonText}>
                      {saving ? 'Starting...' : 'Start Discovering'}
                    </Text>
                  </Pressable>

                  <Pressable onPress={() => setShowUsernameStep(false)} style={styles.secondaryButton}>
                    <Text allowFontScaling={false} style={styles.secondaryButtonText}>
                      Back
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          ) : (
            <ScrollView
              contentContainerStyle={[
                styles.onboardingStep,
                isShortScreen && styles.onboardingStepCompact,
                { minHeight: Math.max(height - 80, 540) },
              ]}
              showsVerticalScrollIndicator={false}>
              <View style={[styles.heroSection, isCompact && styles.heroSectionCompact]}>
                {showLogoHero ? (
                  <View style={[styles.logoFrame, { width: logoSize, height: logoSize, borderRadius: logoSize * 0.24 }]}>
                    <Image source={onboardingLogo} style={styles.logoImage} contentFit="cover" />
                  </View>
                ) : (
                  <View style={[styles.featureIcon, { width: heroSize, height: heroSize }]}>
                    <Ionicons name={currentItem.icon} size={isCompact ? 40 : 48} color={nexTalkColors.cyan} />
                  </View>
                )}

                <Text allowFontScaling={false} style={[styles.title, { fontSize: titleSize, lineHeight: titleLineHeight }]}>
                  {currentItem.title}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.description,
                    {
                      fontSize: descriptionSize,
                      lineHeight: descriptionLineHeight,
                      maxWidth: contentMaxWidth,
                    },
                  ]}>
                  {currentItem.description}
                </Text>
              </View>

              <View style={[styles.footer, isShortScreen && styles.footerCompact]}>
                <View style={styles.dotsRow}>
                  {onboardingSlides.map((_, index) => (
                    <View
                      key={index}
                      style={[styles.dot, index === currentSlide ? styles.dotActive : undefined]}
                    />
                  ))}
                </View>

                <View style={[styles.buttonRow, isCompact && currentSlide > 0 && styles.buttonColumn]}>
                  {currentSlide > 0 && (
                    <Pressable onPress={() => setCurrentSlide((slide) => slide - 1)} style={styles.secondaryButton}>
                      <Text allowFontScaling={false} style={styles.secondaryButtonText}>
                        Back
                      </Text>
                    </Pressable>
                  )}

                  <Pressable
                    onPress={handleNext}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      currentSlide === 0 && styles.primaryButtonFull,
                      pressed ? styles.pressed : undefined,
                    ]}>
                    <Text allowFontScaling={false} style={styles.primaryButtonText}>
                      {currentSlide === onboardingSlides.length - 1 ? 'Get Started' : 'Next'}
                    </Text>
                  </Pressable>
                </View>

                <Pressable onPress={() => setShowUsernameStep(true)} style={styles.skipButton}>
                  <Text allowFontScaling={false} style={styles.skipText}>
                    Skip
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
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
    position: 'relative',
    backgroundColor: 'rgba(2, 6, 23, 0.16)',
  },
  contentLayer: {
    flex: 1,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  onboardingStep: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingVertical: 22,
  },
  onboardingStepCompact: {
    paddingVertical: 16,
  },
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  heroSectionCompact: {
    gap: 18,
  },
  usernameAvoider: {
    flex: 1,
  },
  usernameStep: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    paddingVertical: 28,
  },
  usernameStepCompact: {
    gap: 16,
    paddingVertical: 22,
  },
  heroIcon: {
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: nexTalkColors.cyan,
    ...nexTalkShadow,
  },
  logoFrame: {
    overflow: 'hidden',
    backgroundColor: nexTalkColors.surfaceStrong,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.34)',
    ...nexTalkShadow,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  featureIcon: {
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.34)',
  },
  title: {
    color: nexTalkColors.text,
    fontWeight: '800',
    textAlign: 'center',
  },
  description: {
    color: nexTalkColors.textMuted,
    textAlign: 'center',
  },
  footer: {
    gap: 24,
    paddingBottom: 20,
  },
  footerCompact: {
    gap: 18,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.35)',
  },
  dotActive: {
    width: 28,
    backgroundColor: nexTalkColors.cyan,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 14,
  },
  buttonColumn: {
    flexDirection: 'column',
  },
  primaryButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: nexTalkColors.cyan,
    ...nexTalkShadow,
  },
  primaryButtonFull: {
    flexBasis: '100%',
  },
  primaryButtonText: {
    color: nexTalkColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderWidth: 1,
    borderColor: nexTalkColors.border,
  },
  secondaryButtonText: {
    color: nexTalkColors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  skipButton: {
    alignItems: 'center',
  },
  skipText: {
    color: nexTalkColors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  formCard: {
    width: '100%',
    borderRadius: 30,
    padding: 22,
    backgroundColor: nexTalkColors.surface,
    borderWidth: 1,
    borderColor: nexTalkColors.border,
    gap: 14,
  },
  formCardCompact: {
    padding: 18,
    borderRadius: 24,
  },
  input: {
    minHeight: 56,
    borderRadius: 20,
    paddingHorizontal: 18,
    fontSize: 16,
    color: nexTalkColors.text,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: nexTalkColors.border,
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.45,
  },
});
