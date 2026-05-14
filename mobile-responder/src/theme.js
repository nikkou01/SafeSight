import { Platform } from 'react-native'

export const colors = {
  background: '#f6f2ec',
  surface: '#ffffff',
  surfaceAlt: '#fff7ed',
  ink: '#0b1120',
  inkSoft: '#334155',
  inkMuted: '#64748b',
  border: '#eadfd5',
  accent: '#0f766e',
  accentStrong: '#0b5d56',
  accentSoft: '#ccfbf1',
  info: '#2563eb',
  infoSoft: '#dbeafe',
  warning: '#f59e0b',
  warningSoft: '#fff4d6',
  danger: '#b91c1c',
  dangerSoft: '#fee2e2',
  success: '#15803d',
  successSoft: '#dcfce7',
  violet: '#6d28d9',
  violetSoft: '#ede9fe',
}

export const font = {
  display: Platform.select({
    ios: 'AvenirNext-DemiBold',
    android: 'sans-serif-condensed',
    default: 'sans-serif-medium',
  }),
  body: Platform.select({
    ios: 'AvenirNext-Regular',
    android: 'sans-serif',
    default: 'sans-serif',
  }),
  bodyMedium: Platform.select({
    ios: 'AvenirNext-Medium',
    android: 'sans-serif-medium',
    default: 'sans-serif-medium',
  }),
}

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 999,
}

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
}

export const shadows = {
  card: {
    shadowColor: '#0b1120',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  floating: {
    shadowColor: '#0b1120',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
}
