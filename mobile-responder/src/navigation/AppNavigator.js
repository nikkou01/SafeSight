import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import LoginScreen from '../screens/LoginScreen'
import DashboardScreen from '../screens/DashboardScreen'
import CollisionsScreen from '../screens/CollisionsScreen'
import AlertsScreen from '../screens/AlertsScreen'
import CamerasScreen from '../screens/CamerasScreen'
import { colors, font, radius, shadows, spacing } from '../theme'

const RootStack = createNativeStackNavigator()
const Tabs = createBottomTabNavigator()

function ScreenWrapper({ title, subtitle, children }) {
  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.backdrop}>
        <View style={styles.backdropOrbLeft} />
        <View style={styles.backdropOrbRight} />
      </View>
      <View style={[styles.headerCard, shadows.card]}>
        <Text style={styles.eyebrow}>SafeSight Responder</Text>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  )
}

function ResponderTabs() {
  const { logout } = useAuth()

  return (
    <Tabs.Navigator
      screenOptions={{
        headerRight: () => (
          <TouchableOpacity onPress={logout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        ),
        headerTitleAlign: 'left',
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitleNav,
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: [styles.tabBar, shadows.floating],
      }}
    >
      <Tabs.Screen
        name="Dashboard"
        options={{ headerTitle: 'Responder Dashboard' }}
      >
        {() => (
          <ScreenWrapper
            title="Responder Dashboard"
            subtitle="Live incident pulse and response readiness."
          >
            <DashboardScreen />
          </ScreenWrapper>
        )}
      </Tabs.Screen>

      <Tabs.Screen
        name="Collisions"
        options={{ headerTitle: 'Collision Logs' }}
      >
        {() => (
          <ScreenWrapper
            title="Collision Logs"
            subtitle="Review incidents, confirm status, and open clips."
          >
            <CollisionsScreen />
          </ScreenWrapper>
        )}
      </Tabs.Screen>

      <Tabs.Screen
        name="Alerts"
        options={{ headerTitle: 'SMS Alerts' }}
      >
        {() => (
          <ScreenWrapper
            title="SMS Alerts"
            subtitle="Message delivery and responder outreach status."
          >
            <AlertsScreen />
          </ScreenWrapper>
        )}
      </Tabs.Screen>

      <Tabs.Screen
        name="Cameras"
        options={{ headerTitle: 'Camera Health' }}
      >
        {() => (
          <ScreenWrapper
            title="Camera Health"
            subtitle="Track RTSP availability and snapshot checks."
          >
            <CamerasScreen />
          </ScreenWrapper>
        )}
      </Tabs.Screen>
    </Tabs.Navigator>
  )
}

function NonResponderScreen() {
  const { user, logout } = useAuth()
  return (
    <View style={styles.blockedScreen}>
      <View style={[styles.blockedCard, shadows.card]}>
        <Text style={styles.blockedTitle}>Responder App Access Only</Text>
        <Text style={styles.blockedBody}>
          Logged in as {user?.full_name || user?.username || 'Unknown'} ({user?.role || 'unknown role'}). This mobile app is limited to responder accounts.
        </Text>
        <TouchableOpacity onPress={logout} style={styles.blockedButton}>
          <Text style={styles.blockedButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

export default function AppNavigator() {
  const { authReady, user, isResponder } = useAuth()

  if (!authReady) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    )
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <RootStack.Screen name="Login" component={LoginScreen} />
        ) : isResponder ? (
          <RootStack.Screen name="ResponderTabs" component={ResponderTabs} />
        ) : (
          <RootStack.Screen name="NonResponder" component={NonResponderScreen} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 180,
  },
  backdropOrbLeft: {
    position: 'absolute',
    top: -20,
    left: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.accentSoft,
    opacity: 0.8,
  },
  backdropOrbRight: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: colors.warningSoft,
    opacity: 0.9,
  },
  headerCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eyebrow: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: colors.accentStrong,
    fontFamily: font.bodyMedium,
  },
  headerTitle: {
    marginTop: 6,
    fontSize: 22,
    fontFamily: font.display,
    color: colors.ink,
  },
  headerSubtitle: {
    marginTop: 6,
    color: colors.inkSoft,
    fontSize: 13,
    fontFamily: font.body,
  },
  header: {
    backgroundColor: colors.background,
  },
  headerTitleNav: {
    fontFamily: font.display,
    color: colors.ink,
    fontSize: 18,
  },
  logoutButton: {
    marginRight: spacing.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  logoutText: {
    color: colors.accentStrong,
    fontFamily: font.bodyMedium,
    fontSize: 12,
  },
  tabBar: {
    height: 64,
    paddingTop: 6,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 11,
  },
  blockedScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  blockedCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  blockedTitle: {
    fontSize: 20,
    fontFamily: font.display,
    color: colors.ink,
    marginBottom: 8,
  },
  blockedBody: {
    color: colors.inkSoft,
    marginBottom: 16,
    fontFamily: font.body,
  },
  blockedButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  blockedButtonText: {
    color: 'white',
    fontFamily: font.bodyMedium,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
})
