import { TenantName } from '../../models/Tenant';
import { AppConfig } from './types';
export type NablaConfig = AppConfig &
  Partial<
    Record<
      TenantName,
      {
        indexerUrl: string;
        router: string;
        oracle: string;
        curve: string;
      }
    >
  >;

export const nablaConfig: NablaConfig = {
  tenants: [TenantName.Foucoco],
  foucoco: {
    indexerUrl: 'https://squid.subsquid.io/foucoco-squid/graphql',
    router: '6mrTyH54tYXKsVxrahapG1S54cVMqqwqtnmTLLbj3NZT2f1k',
    oracle: '6n32n4F11qfFXfFYhVj15fChZTXpVP5zJSM98361gK5QKrxW',
    curve: '6mnENTpY6B5mqtUHsjv3BxwKucT9hqF761QrYGfD22ccLzdC',
  },
};
