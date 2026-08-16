/**
 * Expo inlines EXPO_PUBLIC_ variables into the bundle at build time, so the app
 * reads them off `process.env` even though React Native does not run on Node.
 *
 * Only the variables this app actually reads are declared. Pulling in the whole
 * @types/node surface would suggest Node APIs are available here; they are not.
 */
declare const process: {
  env: {
    EXPO_PUBLIC_API_BASE_URL?: string;
  };
};
