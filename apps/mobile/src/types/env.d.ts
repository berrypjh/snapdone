/**
 * Expo는 빌드 시 EXPO_PUBLIC_ 환경변수를 번들에 인라인하므로
 * React Native 환경에서도 process.env를 통해 접근할 수 있다.
 */
declare const process: {
  env: {
    EXPO_PUBLIC_API_BASE_URL?: string;
    EXPO_PUBLIC_WEB_BASE_URL?: string;
  };
};
