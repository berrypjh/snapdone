import { useState } from 'react';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { AuthController } from '../auth/controller';
import { jobApi } from '../processing/jobApi';
import { createJobPort } from '../processing/port';
import { resultActions } from '../processing/resultActions';
import { OnboardingProcessingScreen } from '../screens/OnboardingProcessingScreen';
import { PhotoResultScreen } from '../screens/PhotoResultScreen';

import type { RootStackParamList } from './navigation';

type WithController<Name extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  Name
> & { controller: AuthController };

/**
 * 홈의 사진 처리. 화면마다 port를 하나만 만들어 처리 요청을 한 번만 보낸다.
 * 끝나면 결과로 바꾼다(replace) — 뒤로 가면 같은 사진의 확인 화면이라 사진을 다시 고르지 않는다.
 */
export const PhotoProcessingRoute = ({
  navigation,
  route,
  controller,
}: WithController<'PhotoProcessing'>) => {
  const { image, choice } = route.params;
  const [port] = useState(() => createJobPort(controller, jobApi, choice));

  return (
    <OnboardingProcessingScreen
      image={image}
      port={port}
      onCompleted={(job) => navigation.replace('PhotoResult', { image, job })}
      onChooseAnother={() => navigation.popTo('PhotoCapture')}
    />
  );
};

/** 지금 처리한 사진의 결과. 필드 확정 · 유형 선택은 같은 로그인 세션과 같은 사진으로 한다. */
export const PhotoResultRoute = ({
  navigation,
  route,
  controller,
}: WithController<'PhotoResult'>) => {
  const { image, job } = route.params;

  return (
    <PhotoResultScreen
      image={image}
      initial={job}
      {...resultActions(controller)}
      onChooseType={(source, imageType) =>
        navigation.replace('PhotoProcessing', {
          image,
          choice: { sourceJobId: source.jobId, imageType },
        })
      }
      onChooseAnother={() => navigation.popTo('PhotoCapture')}
      onHome={() => navigation.popTo('Main', { screen: 'Home' })}
    />
  );
};
