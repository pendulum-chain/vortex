import { PalletIdentityRegistration } from '@polkadot/types/lookup';
import { useMemo } from 'preact/hooks';
import { useNodeInfoState } from '../NodeInfoProvider';

export interface PalletIdentityInfo {
  display?: string;
  email?: string;
  riot?: string;
  twitter?: string;
  web?: string;
}

export function useIdentityPallet() {
  const { api } = useNodeInfoState().state;

  const memo = useMemo(() => {
    return {
      async identityOf(account: string): Promise<PalletIdentityInfo | undefined> {
        if (!api || !api.query.identity) {
          return;
        }
        const identityResponse = await api.query.identity.identityOf(account);
        if (identityResponse.isEmpty) {
          return;
        }

        // Casting the data to the real value PalletIdentityRegistration, fails to show readable info
        // Therefore the cast to 'any'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pir: any = identityResponse.toHuman() as unknown as PalletIdentityRegistration;
        return {
          display: pir.info.display ? pir.info.display.Raw : '',
          email: pir.info.email ? pir.info.email.Raw : '',
          riot: pir.info.riot ? pir.info.riot.Raw : '',
          twitter: pir.info.twitter ? pir.info.twitter.Raw : '',
          web: pir.info.web ? pir.info.web.Raw : '',
        };
      },
    };
  }, [api]);

  return memo;
}
