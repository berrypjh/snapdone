import { useEffect, useState } from 'react';
import { AppState, Linking, useColorScheme } from 'react-native';

import { ThemeProvider, useTheme } from '@berrypjh/react-native-ui';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAuthSnapshot } from '../auth/controller';
import { destinationFor } from '../auth/model';
import { createHandoffMemory } from '../auth/webHandoff';
import { AuthRestoreFailed } from '../components/auth/AuthRestoreFailed';
import { AuthRestoring } from '../components/auth/AuthRestoring';
import { LogoutButton } from '../components/auth/LogoutButton';
import { PREVIEW_NOTE } from '../components/processing/resultCopy';
import { AuthScreen } from '../screens/AuthScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { OnboardingPreviewScreen } from '../screens/OnboardingPreviewScreen';
import { PhotoCaptureScreen } from '../screens/PhotoCaptureScreen';
import { WebContentScreen } from '../screens/WebContentScreen';
import { navigationTheme } from '../theme/navigationTheme';

import { createAppAuthController, legalLinks, resumeFromLaunchUrl } from './appAuth';
import type { RootStackParamList } from './navigation';
import { OnboardingFlow } from './OnboardingFlow';
import { PhotoProcessingRoute, PhotoResultRoute } from './photoRoutes';

const Stack = createNativeStackNavigator<RootStackParamList>();

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
        {destination === 'onboarding' && auth.status === 'authenticated' && (
          <Stack.Screen name="Onboarding" options={{ headerShown: false }}>
            {() => <OnboardingFlow controller={controller} />}
          </Stack.Screen>
        )}
        {destination === 'home' && (
          <>
            <Stack.Screen
              name="Home"
              options={{
                title: '이미지 액션 라우터',
                headerRight: () => <LogoutButton controller={controller} />,
              }}
            >
              {(props) => <HomeScreen {...props} controller={controller} />}
            </Stack.Screen>
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
            <Stack.Screen name="PhotoCapture" options={{ title: '사진 추가' }}>
              {({ navigation }) => (
                <PhotoCaptureScreen
                  onSelected={(image) => navigation.navigate('PhotoPreview', { image })}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="PhotoPreview" options={{ title: '사진 확인' }}>
              {({ navigation, route }) => (
                <OnboardingPreviewScreen
                  image={route.params.image}
                  note={PREVIEW_NOTE}
                  onProcess={(image) => navigation.navigate('PhotoProcessing', { image })}
                  onChooseAnother={() => navigation.goBack()}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="PhotoProcessing" options={{ title: '사진 처리' }}>
              {(props) => <PhotoProcessingRoute {...props} controller={controller} />}
            </Stack.Screen>
            <Stack.Screen name="PhotoResult" options={{ title: '처리 결과' }}>
              {(props) => <PhotoResultRoute {...props} controller={controller} />}
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
