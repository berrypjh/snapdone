import { type ComponentProps, useEffect, useState } from 'react';

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { POLL_INTERVAL_MS, type ProcessingPort, type ResumeStep } from '@snapdone/onboarding';
import type { JobDetail } from '@snapdone/processing';

import type { AuthController } from '../auth/controller';
import { LogoutButton } from '../components/auth/LogoutButton';
import type { SelectedImage } from '../onboarding/capture';
import { completeOnboarding } from '../onboarding/completion';
import { createOnboardingController, useOnboardingSnapshot } from '../onboarding/controller';
import { selectedPurposes } from '../onboarding/model';
import { processingApi } from '../onboarding/processingApi';
import { fromSaved, type ProgressStore, toUpdate } from '../onboarding/progress';
import { progressApi } from '../onboarding/progressApi';
import { jobApi } from '../processing/jobApi';
import { createJobPort } from '../processing/port';
import { resultActions } from '../processing/resultActions';
import { OnboardingFirstImageScreen } from '../screens/OnboardingFirstImageScreen';
import { OnboardingIntroScreen } from '../screens/OnboardingIntroScreen';
import { OnboardingPreviewScreen } from '../screens/OnboardingPreviewScreen';
import { OnboardingProcessingScreen } from '../screens/OnboardingProcessingScreen';
import { OnboardingPurposeScreen } from '../screens/OnboardingPurposeScreen';
import { OnboardingResultScreen } from '../screens/OnboardingResultScreen';

import type { OnboardingStackParamList } from './navigation';

const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();

/** 로그인 세션으로 처리 API를 부른다. credential은 AuthController 밖으로 나오지 않는다. */
const createProcessingPort = (
  controller: AuthController,
): ProcessingPort<SelectedImage, JobDetail> => ({
  start: (image) => controller.authorized((credential) => processingApi.start(credential, image)),
  find: (jobId) => controller.authorized((credential) => processingApi.find(credential, jobId)),
  wait: () => new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS)),
});

/** 로그인 세션으로 서버의 온보딩 진행을 읽고 쓴다. web에서 하던 진행도 여기서 이어진다. */
const createProgressStore = (controller: AuthController): ProgressStore => ({
  load: async () => {
    const saved = await controller.authorized((credential) => progressApi.find(credential));
    return saved && fromSaved(saved);
  },
  save: async (progress) => {
    await controller.authorized((credential) => progressApi.save(credential, toUpdate(progress)));
  },
});

/**
 * 온보딩을 끝내고 세션을 다시 받는다. 세션이 complete가 되면 App이 이 흐름 대신 홈을 그린다 —
 * 홈으로 가는 조건은 서버 세션 하나뿐이라 여기서 홈으로 navigate하지 않는다.
 */
const finish = (controller: AuthController) =>
  completeOnboarding({
    complete: () => controller.authorized((credential) => progressApi.complete(credential)),
    refreshSession: controller.refreshSession,
  });

/**
 * 처리 화면. 처음 받은 port를 화면이 떠날 때까지 그대로 써서 처리 요청을 한 번만 보낸다.
 * render 함수가 다시 불려 새 port가 와도 처리를 다시 시작하지 않는다.
 */
const OnboardingProcessingRoute = ({
  port,
  ...props
}: ComponentProps<typeof OnboardingProcessingScreen<JobDetail>>) => {
  const [stable] = useState(() => port);
  return <OnboardingProcessingScreen {...props} port={stable} />;
};

const RESUME_ROUTE: Record<ResumeStep, keyof OnboardingStackParamList> = {
  intro: 'OnboardingIntro',
  purpose: 'OnboardingPurpose',
  'first-image': 'OnboardingFirstImage',
};

type OnboardingFlowProps = { controller: AuthController };

/**
 * 서버 온보딩이 끝나기 전의 화면 흐름. 서버에 저장된 진행을 읽은 뒤에 stack을 만든다 —
 * `initialRouteName`은 navigator가 처음 만들어질 때만 읽히기 때문이다.
 * 이어서 열면 그 단계가 stack의 첫 화면이 되어, 그 아래 단계로는 뒤로 가지 않는다.
 */
export const OnboardingFlow = ({ controller }: OnboardingFlowProps) => {
  const [onboarding] = useState(() =>
    createOnboardingController({ store: createProgressStore(controller) }),
  );
  const snapshot = useOnboardingSnapshot(onboarding);
  const [processingPort] = useState(() => createProcessingPort(controller));

  useEffect(() => {
    void onboarding.load();
  }, [onboarding]);

  if (snapshot.status === 'loading') return null;

  return (
    <OnboardingStack.Navigator
      initialRouteName={RESUME_ROUTE[snapshot.progress.step]}
      screenOptions={({ navigation }) => ({
        title: '',
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        // 이어서 열어 첫 화면이 된 단계에서는 소개 화면(로그아웃)으로 돌아갈 수 없다. 로그아웃을 헤더에 둔다.
        headerRight: navigation.canGoBack()
          ? undefined
          : () => <LogoutButton controller={controller} />,
      })}
    >
      <OnboardingStack.Screen name="OnboardingIntro" options={{ headerShown: false }}>
        {({ navigation }) => (
          <OnboardingIntroScreen
            controller={controller}
            onStart={() => {
              onboarding.dispatch({ type: 'start' });
              navigation.navigate('OnboardingPurpose');
            }}
          />
        )}
      </OnboardingStack.Screen>
      <OnboardingStack.Screen name="OnboardingPurpose">
        {({ navigation }) => (
          <OnboardingPurposeScreen
            initialSelection={selectedPurposes(snapshot.progress.purpose)}
            onNext={(purposes) => {
              onboarding.dispatch({ type: 'choose-purposes', purposes });
              navigation.navigate('OnboardingFirstImage');
            }}
            onSkip={() => {
              onboarding.dispatch({ type: 'skip-purpose' });
              navigation.navigate('OnboardingFirstImage');
            }}
          />
        )}
      </OnboardingStack.Screen>
      <OnboardingStack.Screen name="OnboardingFirstImage">
        {({ navigation }) => (
          <OnboardingFirstImageScreen
            onSelected={(image) => navigation.navigate('OnboardingPreview', { image })}
          />
        )}
      </OnboardingStack.Screen>
      <OnboardingStack.Screen name="OnboardingPreview">
        {({ navigation, route }) => (
          <OnboardingPreviewScreen
            image={route.params.image}
            onProcess={(image) => navigation.navigate('OnboardingProcessing', { image })}
            onChooseAnother={() => navigation.goBack()}
          />
        )}
      </OnboardingStack.Screen>
      <OnboardingStack.Screen name="OnboardingProcessing">
        {({ navigation, route }) => (
          <OnboardingProcessingRoute
            key={route.key}
            image={route.params.image}
            port={
              route.params.choice
                ? createJobPort(controller, jobApi, route.params.choice)
                : processingPort
            }
            onCompleted={(job) =>
              navigation.replace('OnboardingResult', { image: route.params.image, job })
            }
            onChooseAnother={() => navigation.popTo('OnboardingFirstImage')}
          />
        )}
      </OnboardingStack.Screen>
      <OnboardingStack.Screen name="OnboardingResult">
        {({ navigation, route }) => (
          <OnboardingResultScreen
            image={route.params.image}
            initial={route.params.job}
            {...resultActions(controller)}
            onChooseType={(source, imageType) =>
              navigation.replace('OnboardingProcessing', {
                image: route.params.image,
                choice: { sourceJobId: source.jobId, imageType },
              })
            }
            onComplete={() => finish(controller)}
          />
        )}
      </OnboardingStack.Screen>
    </OnboardingStack.Navigator>
  );
};
