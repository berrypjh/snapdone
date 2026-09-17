import { useEffect, useState } from 'react';
import { AppState, Linking, useColorScheme } from 'react-native';

import { ThemeProvider, useTheme } from '@berrypjh/react-native-ui';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { randomUUID } from 'expo-crypto';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { authApi } from '../auth/api';
import { parseOAuthCallback } from '../auth/callback';
import { type AuthController, createAuthController, useAuthSnapshot } from '../auth/controller';
import { expoProofCrypto, secureAuthStorage, systemAuthBrowser } from '../auth/device';
import { createGoogleSignIn, finishGoogleSignIn, type GoogleSignInDeps } from '../auth/google';
import { destinationFor } from '../auth/model';
import { createHandoffMemory } from '../auth/webHandoff';
import { AuthRestoreFailed } from '../components/auth/AuthRestoreFailed';
import { AuthRestoring } from '../components/auth/AuthRestoring';
import { LogoutButton } from '../components/auth/LogoutButton';
import { getLegalLinks, isSignUpAllowed } from '../lib/legal';
import { AuthScreen } from '../screens/AuthScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { OnboardingIntroScreen } from '../screens/OnboardingIntroScreen';
import { WebContentScreen } from '../screens/WebContentScreen';
import { navigationTheme } from '../theme/navigationTheme';

import type { RootStackParamList } from './navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

const legalLinks = getLegalLinks();

const authRedirectUri = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URI;

const googleSignInDeps: GoogleSignInDeps | null = authRedirectUri
  ? {
      api: authApi,
      storage: secureAuthStorage,
      crypto: expoProofCrypto,
      browser: systemAuthBrowser,
      redirectUri: authRedirectUri,
      now: Date.now,
    }
  : null;

const createAppAuthController = () =>
  createAuthController({
    api: authApi,
    storage: secureAuthStorage,
    signIn: googleSignInDeps ? { google: createGoogleSignIn(googleSignInDeps) } : {},
    signUpAllowed: isSignUpAllowed(legalLinks, __DEV__),
    newRequestId: randomUUID,
  });

const resumeFromLaunchUrl = async (controller: AuthController) => {
  const url = await Linking.getInitialURL();
  if (!googleSignInDeps || !url || !parseOAuthCallback(url, googleSignInDeps.redirectUri)) return;
  await controller.resume('google', () => finishGoogleSignIn(googleSignInDeps, url));
};

const AppNavigator = () => {
  const theme = useTheme();
  const [controller] = useState(createAppAuthController);
  const [handoffMemory] = useState(createHandoffMemory);
  const { auth } = useAuthSnapshot(controller);
  const destination = destinationFor(auth);

  useEffect(() => {
    void controller.start().then(() => resumeFromLaunchUrl(controller));
  }, [controller]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void controller.revalidate();
    });
    return () => subscription.remove();
  }, [controller]);

  return (
    <NavigationContainer theme={navigationTheme(theme)}>
      <Stack.Navigator>
        {destination === 'restoring' && (
          <Stack.Screen
            name="Restoring"
            component={AuthRestoring}
            options={{ headerShown: false }}
          />
        )}
        {destination === 'restore-failed' && auth.status === 'restore-failed' && (
          <Stack.Screen name="RestoreFailed" options={{ headerShown: false }}>
            {() => (
              <AuthRestoreFailed
                error={auth.error}
                onRetry={() => void controller.retryRestore()}
              />
            )}
          </Stack.Screen>
        )}
        {destination === 'sign-in' && (
          <Stack.Screen name="Auth" options={{ headerShown: false, title: '로그인' }}>
            {() => (
              <AuthScreen
                controller={controller}
                legalLinks={legalLinks}
                onOpenLegal={(url) => void Linking.openURL(url)}
              />
            )}
          </Stack.Screen>
        )}
        {destination === 'onboarding' && (
          <Stack.Screen name="OnboardingIntro" options={{ headerShown: false }}>
            {() => <OnboardingIntroScreen controller={controller} />}
          </Stack.Screen>
        )}
        {destination === 'home' && (
          <>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{
                title: '이미지 액션 라우터',
                headerRight: () => <LogoutButton controller={controller} />,
              }}
            />
            <Stack.Screen
              name="WebContent"
              options={({ route }) => ({ title: route.params.title })}
            >
              {(props) => (
                <WebContentScreen
                  {...props}
                  controller={controller}
                  handoffMemory={handoffMemory}
                />
              )}
            </Stack.Screen>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export const App = () => {
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';

  return (
    <SafeAreaProvider>
      <ThemeProvider mode={mode}>
        <StatusBar />
        <AppNavigator />
      </ThemeProvider>
    </SafeAreaProvider>
  );
};

export default App;
