import { useMemo } from 'react';
import { TenantName } from '../models/Tenant';

interface PriceFetcherAsset {
  assetName: string;
  blockchain: string;
  assetId: string | undefined;
  exclude?: TenantName[];
  provider: 'dia' | 'diaForeign';
}

type PricesCache = {
  [key: string]: number;
};

const assets: PriceFetcherAsset[] = [
  {
    assetName: 'USDC.s',
    blockchain: 'Ethereum',
    assetId: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    provider: 'dia',
    exclude: [TenantName.Pendulum],
  },
  {
    assetName: 'XLM.s',
    blockchain: 'Stellar',
    assetId: '0x0000000000000000000000000000000000000000/',
    provider: 'dia',
    exclude: [TenantName.Pendulum],
  },
  {
    assetName: 'TZS.s',
    blockchain: 'YahooFinance',
    assetId: 'TZS-USD',
    provider: 'diaForeign',
    exclude: [TenantName.Pendulum],
  },
  {
    assetName: 'BRL.s',
    blockchain: 'YahooFinance',
    assetId: 'BRL-USD',
    provider: 'diaForeign',
    exclude: [TenantName.Pendulum],
  },
  {
    assetName: 'KSM',
    blockchain: 'Kusama',
    assetId: '0x0000000000000000000000000000000000000000',
    provider: 'dia',
    exclude: [TenantName.Pendulum],
  },
  {
    assetName: 'USDT',
    blockchain: 'Ethereum',
    assetId: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    provider: 'dia',
  },

  {
    assetName: 'DOT',
    blockchain: 'Polkadot',
    assetId: '0x0000000000000000000000000000000000000000',
    provider: 'dia',
    exclude: [TenantName.Amplitude],
  },
  {
    assetName: 'AMPE',
    blockchain: 'Amplitude',
    assetId: undefined,
    provider: 'dia',
    exclude: [TenantName.Pendulum],
  },
  {
    assetName: 'PEN',
    blockchain: 'Pendulum',
    assetId: '0x0000000000000000000000000000000000000000',
    provider: 'dia',
    exclude: [TenantName.Amplitude],
  },
];

const getDIAAssetPrice = async (asset: PriceFetcherAsset): Promise<number> => {
  if (!asset.assetId) return 0;

  try {
    const data = await fetch(`https://api.diadata.org/v1/assetQuotation/${asset.blockchain}/${asset.assetId}`);
    if (data.ok) {
      return (await data.json())['Price'];
    }
  } catch (e) {
    console.error(e);
  }

  return 0;
};

const getDIAAssetForeignPrice = async (asset: PriceFetcherAsset): Promise<number> => {
  if (!asset.assetId) return 0;
  try {
    const data = await fetch(`https://api.diadata.org/v1/foreignQuotation/${asset.blockchain}/${asset.assetId}`);
    if (data.ok) {
      return (await data.json())['Price'];
    }
  } catch (e) {
    console.error(e);
  }

  return 0;
};

const providers = {
  dia: getDIAAssetPrice,
  diaForeign: getDIAAssetForeignPrice,
};

const lookup = (assetCode: string) => {
  const found = assets.find(({ assetName }) => assetName === assetCode);

  if (!found) throw Error(`Asset ${assetCode} was not found`);

  return found;
};

const getPrice = async (asset: PriceFetcherAsset) => {
  try {
    return await providers[asset.provider](asset);
  } catch (e) {
    console.error('Not able fetch to price for asset: ', e);
  }
};

export const usePriceFetcher = () => {
  const pricesCache: Promise<PricesCache> = useMemo(async () => {
    let cache = {};
    for (let i = 0; i < assets.length; i++) {
      cache = { ...cache, [assets[i].assetName]: await getPrice(assets[i]) };
    }
    return cache;
  }, []);

  const fetch = async (assetCode: string) => {
    try {
      return await getPrice(lookup(assetCode));
    } catch (e) {
      console.error(e);
    }
  };

  return { fetch, pricesCache };
};
