/**
 * Expo는 빌드 시 EXPO_PUBLIC_ 환경변수를 번들에 인라인하므로
 * React Native 환경에서도 process.env를 통해 접근할 수 있다.
 *
 * Node.js API를 사용하는 것은 아니므로 @types/node 대신
 * 앱에서 실제로 사용하는 환경변수만 최소한으로 선언한다.
 */
declare const process: {
  env: {
    EXPO_PUBLIC_API_BASE_URL?: string;
  };
};
