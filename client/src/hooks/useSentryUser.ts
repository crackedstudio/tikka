import { useEffect } from 'react';
import { Sentry } from '../lib/sentry';
import { useWalletContext } from '../providers/WalletProvider';

export function useSentryUser(): void {
  const { address } = useWalletContext();

  useEffect(() => {
    if (address) {
      Sentry.setUser({ id: address });
    } else {
      Sentry.setUser(null);
    }
  }, [address]);
}
