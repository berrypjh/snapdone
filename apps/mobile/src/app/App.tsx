import { useEffect, useState } from 'react';
import { Linking, useColorScheme } from 'react-native';

import { ThemeProvider, useTheme } from '@berrypjh/react-native-ui';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { randomUUID } from 'expo-crypto';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { authApi } from '../auth/api';
import { createAuthController, useAuthSnapshot } from '../auth/controller';
import { secureAuthStorage } from '../auth/device';
import { destinationFor } from '../auth/model';
import { AuthRestoring } from '../components/auth/AuthRestoring';
import { getLegalLinks, isSignUpAllowed } from '../lib/legal';
import { AuthScreen } from '../screens/AuthScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { WebContentScreen } from '../screens/WebContentScreen';
import { navigationTheme } from '../theme/navigationTheme';

import type { RootStackParamList } from './navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

const legalLinks = getLegalLinks();

const createAppAuthController = () =>
  createAuthController({
    api: authApi,
    storage: secureAuthStorage,
    // Provider sign-in ports are added from 03 (OAuth) and 05 (Apple). Until then every provider is unavailable.
    signIn: {},
    signUpAllowed: isSignUpAllowed(legalLinks, __DEV__),
    newRequestId: randomUUID,
  });

const AppNavigator = () => {
  const theme = useTheme();
  const [controller] = useState(createAppAuthController);
  const destination = destinationFor(useAuthSnapshot(controller).auth);

  useEffect(() => {
    void controller.start();
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
        {/* Onboarding screens (ON-02~07) do not exist yet, so a new profile also lands on Home. */}
        {(destination === 'onboarding' || destination === 'home') && (
          <>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: '이미지 액션 라우터' }}
            />
            <Stack.Screen
              name="WebContent"
              component={WebContentScreen}
              options={({ route }) => ({ title: route.params.title })}
            />
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
