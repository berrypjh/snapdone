export type LegalLinks = { terms: string; privacy: string };

const httpsUrl = (value: string | undefined) => (value?.startsWith('https://') ? value : null);

export const getLegalLinks = (): LegalLinks | null => {
  const terms = httpsUrl(process.env.EXPO_PUBLIC_TERMS_URL);
  const privacy = httpsUrl(process.env.EXPO_PUBLIC_PRIVACY_URL);
  return terms && privacy ? { terms, privacy } : null;
};

export const isSignUpAllowed = (links: LegalLinks | null, isDev: boolean) =>
  links !== null || isDev;
