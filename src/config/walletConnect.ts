import { TenantName } from '../models/Tenant';

export const chainIds: Record<TenantName | 'polkadot', string> = {
  polkadot: 'polkadot:91b171bb158e2d3848fa23a9f1c25182',
  foucoco: 'polkadot:67221cd96c1551b72d55f65164d6a39f', // foucoco,
  amplitude: 'polkadot:cceae7f3b9947cdb67369c026ef78efa', // amplitude
  pendulum: 'polkadot:5d3c298622d5634ed019bf61ea4b7165', // pendulum
  local: 'polkadot:67221cd96c1551b72d55f65164d6a39f', // foucoco
};

export const walletConnectConfig = {
  requiredNamespaces: {
    polkadot: {
      methods: ['polkadot_signTransaction', 'polkadot_signMessage'],
      events: ['chainChanged', 'accountsChanged'],
      chains: [chainIds.polkadot],
    },
  },
  optionalNamespaces: {
    polkadot: {
      methods: ['polkadot_signTransaction', 'polkadot_signMessage'],
      events: ['chainChanged', 'accountsChanged'],
      chains: [chainIds.foucoco, chainIds.amplitude, chainIds.pendulum],
    },
  },
};
