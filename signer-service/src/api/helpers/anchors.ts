interface TomlValues {
  signingKey: string | undefined;
  webAuthEndpoint: string | undefined;
  sep24Url: string | undefined;
  sep6Url: string | undefined;
  kycServer: string | undefined;
}

const TOML_KEYS = {
  SIGNING_KEY: 'SIGNING_KEY',
  WEB_AUTH_ENDPOINT: 'WEB_AUTH_ENDPOINT',
  TRANSFER_SERVER_SEP0024: 'TRANSFER_SERVER_SEP0024',
  TRANSFER_SERVER: 'TRANSFER_SERVER',
  KYC_SERVER: 'KYC_SERVER',
} as const;

const fetchTomlValues = async (tomlFileUrl: string): Promise<TomlValues> => {
  const response = await fetch(tomlFileUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch TOML file: ${response.statusText}`);
  }

  const tomlFileContent = (await response.text()).split('\n');
  const findValueInToml = (key: string): string | undefined => {
    const keyValue = tomlFileContent.find((line) => line.includes(key));
    return keyValue?.split('=')[1]?.trim().replace(/"/g, '');
  };

  return {
    signingKey: findValueInToml(TOML_KEYS.SIGNING_KEY),
    webAuthEndpoint: findValueInToml(TOML_KEYS.WEB_AUTH_ENDPOINT),
    sep24Url: findValueInToml(TOML_KEYS.TRANSFER_SERVER_SEP0024),
    sep6Url: findValueInToml(TOML_KEYS.TRANSFER_SERVER),
    kycServer: findValueInToml(TOML_KEYS.KYC_SERVER),
  };
};

export { fetchTomlValues, type TomlValues };
