import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { API_BASE_URL } from '../config'
import { useAuth } from '../context/AuthContext'
import { colors, font, radius, shadows, spacing } from '../theme'

export default function LoginScreen() {
  const { login, loading } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function onSubmit() {
    try {
      setError('')
      await login(username.trim(), password)
    } catch {
      setError('Invalid username/password or server unreachable.')
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View pointerEvents="none" style={styles.backdrop}>
        <View style={styles.backdropOrb} />
        <View style={styles.backdropWave} />
      </View>

      <View style={[styles.card, shadows.floating]}>
        <Text style={styles.title}>SafeSight Responder</Text>
        <Text style={styles.subtitle}>Field operations console</Text>

        <Text style={styles.label}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          placeholder="Responder ID"
          placeholderTextColor={colors.inkMuted}
          style={styles.input}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Secure passphrase"
          placeholderTextColor={colors.inkMuted}
          style={styles.input}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          onPress={onSubmit}
          disabled={loading}
          style={[styles.button, loading && styles.buttonDisabled]}
        >
          {loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Sign In</Text>}
        </TouchableOpacity>

        <Text style={styles.apiLabel}>API: {API_BASE_URL}</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
  },
  backdropOrb: {
    position: 'absolute',
    top: -60,
    right: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.accentSoft,
    opacity: 0.8,
  },
  backdropWave: {
    position: 'absolute',
    bottom: -120,
    left: -40,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.warningSoft,
    opacity: 0.7,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontFamily: font.display,
    fontSize: 24,
    color: colors.ink,
  },
  subtitle: {
    color: colors.inkSoft,
    marginTop: 4,
    marginBottom: spacing.md,
    fontFamily: font.body,
  },
  label: {
    color: colors.inkSoft,
    marginBottom: 6,
    fontFamily: font.bodyMedium,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    color: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    fontFamily: font.body,
  },
  error: {
    color: colors.danger,
    marginBottom: spacing.sm,
    fontFamily: font.body,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: 'white',
    fontFamily: font.bodyMedium,
  },
  apiLabel: {
    color: colors.inkMuted,
    fontSize: 11,
    marginTop: spacing.md,
    fontFamily: font.body,
  },
})
