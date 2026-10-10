/**
 * Expo는 빌드 시 EXPO_PUBLIC_ 환경변수를 번들에 인라인하므로
 * React Native 환경에서도 process.env를 통해 접근할 수 있다.
 */
declare const process: {
  env: {
    EXPO_PUBLIC_API_BASE_URL?: string;
    EXPO_PUBLIC_WEB_BASE_URL?: string;
    EXPO_PUBLIC_TERMS_URL?: string;
    EXPO_PUBLIC_PRIVACY_URL?: string;
    EXPO_PUBLIC_AUTH_REDIRECT_URI?: string;
    /** `true`면 WebView를 Chrome `chrome://inspect`로 볼 수 있다. 진단용 내부 빌드에만 둔다. */
    EXPO_PUBLIC_WEBVIEW_DEBUG?: string;
    /** JS 오류 · 네이티브 크래시를 보낼 Sentry DSN. 비면 Sentry를 켜지 않는다. */
    EXPO_PUBLIC_SENTRY_DSN?: string;
  };
};
