export const nexTalkColors = {
  backgroundStart: '#020617',
  backgroundMiddle: '#2E1065',
  backgroundEnd: '#020617',
  surface: 'rgba(15, 23, 42, 0.72)',
  surfaceStrong: '#0F172A',
  border: 'rgba(51, 65, 85, 0.88)',
  text: '#FFFFFF',
  textMuted: '#94A3B8',
  cyan: '#22D3EE',
  purple: '#8B5CF6',
  emerald: '#10B981',
  amber: '#F59E0B',
  red: '#FB7185',
  whiteSoft: 'rgba(255, 255, 255, 0.08)',
};

export const nexTalkGradients = {
  background: [nexTalkColors.backgroundStart, nexTalkColors.backgroundMiddle, nexTalkColors.backgroundEnd] as const,
  primary: ['#06B6D4', '#8B5CF6'] as const,
};

export const nexTalkShadow = {
  shadowColor: '#06B6D4',
  shadowOpacity: 0.18,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 10 },
  elevation: 10,
};
