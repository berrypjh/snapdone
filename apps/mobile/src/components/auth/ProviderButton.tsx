import { Button } from '@berrypjh/react-native-ui';
import type { AuthProvider } from '@snapdone/auth-contracts';

import type { ProviderAvailability } from '../../auth/controller';

import { continueWith } from './authCopy';

type ProviderButtonProps = {
  provider: AuthProvider;
  availability: ProviderAvailability;
  loading: boolean;
  busy: boolean;
  onPress: (provider: AuthProvider) => void;
};

export const ProviderButton = ({
  provider,
  availability,
  loading,
  busy,
  onPress,
}: ProviderButtonProps) => (
  <Button
    variant="outlined"
    size="lg"
    fullWidth
    loading={loading}
    disabled={busy || availability !== 'available'}
    accessibilityHint={availability === 'unavailable' ? '지금은 사용할 수 없습니다' : undefined}
    onPress={() => onPress(provider)}
  >
    {continueWith(provider)}
  </Button>
);
