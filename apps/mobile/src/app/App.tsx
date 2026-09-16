import { useColorScheme } from 'react-native';

import { ThemeProvider, useTheme } from '@berrypjh/react-native-ui';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HomeScreen } from '../screens/HomeScreen';
import { WebContentScreen } from '../screens/WebContentScreen';
import { navigationTheme } from '../theme/navigationTheme';

import type { RootStackParamList } from './navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator = () => {
  const theme = useTheme();

  return (
    <NavigationContainer theme={navigationTheme(theme)}>
      <Stack.Navigator>
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
