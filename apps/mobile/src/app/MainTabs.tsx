import { getColor, useTheme } from '@berrypjh/react-native-ui';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CircleUserRound, History, House } from 'lucide-react-native';

import type { AuthController } from '../auth/controller';
import type { HandoffMemory } from '../auth/webHandoff';
import { ME_TITLE } from '../components/me/meCopy';
import { JOB_PAGE_TITLE, WEB_PAGES } from '../lib/web';
import { HomeScreen } from '../screens/HomeScreen';
import { MeScreen } from '../screens/MeScreen';
import { WebContentScreen } from '../screens/WebContentScreen';

import type { MainTabParamList, RootStackParamList } from './navigation';

const Tab = createBottomTabNavigator<MainTabParamList>();

const HOME_TITLE = '이미지 액션 라우터';

type MainTabsProps = NativeStackScreenProps<RootStackParamList, 'Main'> & {
  controller: AuthController;
  handoffMemory: HandoffMemory;
};

/**
 * 로그인 뒤의 하단 탭 — 홈 · 기록 · 내 정보. web 폰 폭의 하단 탭과 같은 구성이다.
 * 탭이 하단 inset을 가지므로 `AppShell`은 bottom을 비워 둔다. 색은 공용 토큰이다.
 */
export const MainTabs = ({ navigation, controller, handoffMemory }: MainTabsProps) => {
  const theme = useTheme();
  const active = getColor(theme, 'text.primary');
  const inactive = getColor(theme, 'text.light');

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: active,
        tabBarInactiveTintColor: inactive,
        headerShadowVisible: false,
      }}
    >
      <Tab.Screen
        name="Home"
        options={{
          title: HOME_TITLE,
          tabBarLabel: '홈',
          tabBarIcon: ({ color, size }) => <House color={color} size={size} />,
        }}
      >
        {(props) => <HomeScreen {...props} controller={controller} />}
      </Tab.Screen>
      <Tab.Screen
        name="History"
        options={{
          title: WEB_PAGES.history.title,
          tabBarLabel: '기록',
          tabBarIcon: ({ color, size }) => <History color={color} size={size} />,
        }}
      >
        {(props) => (
          <WebContentScreen
            path={WEB_PAGES.history.path}
            onTitle={(title) => props.navigation.setOptions({ title })}
            onOpenJob={(path) => navigation.navigate('WebContent', { path, title: JOB_PAGE_TITLE })}
            controller={controller}
            handoffMemory={handoffMemory}
          />
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Me"
        options={{
          title: ME_TITLE,
          tabBarLabel: ME_TITLE,
          tabBarIcon: ({ color, size }) => <CircleUserRound color={color} size={size} />,
        }}
      >
        {(props) => <MeScreen {...props} controller={controller} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
};
