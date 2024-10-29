const fetchTomlValues = async (tomlFileUrl) => {
  const response = await fetch(tomlFileUrl);
  if (response.status !== 200) {
    throw new Error(`Failed to fetch TOML file: ${response.statusText}`);
  }

  const tomlFileContent = (await response.text()).split('\n');
  const findValueInToml = (key) => {
    for (const line of tomlFileContent) {
      const regexp = new RegExp(`^\\s*${key}\\s*=\\s*"(.*)"\\s*$`);
      const match = regexp.exec(line);
      if (match) {
        return match[1];
      }
    }
  };

  return {
    signingKey: findValueInToml('SIGNING_KEY'),
    webAuthEndpoint: findValueInToml('WEB_AUTH_ENDPOINT'),
    sep24Url: findValueInToml('TRANSFER_SERVER_SEP0024'),
    sep6Url: findValueInToml('TRANSFER_SERVER'),
    kycServer: findValueInToml('KYC_SERVER'),
  };
};

module.exports = { fetchTomlValues };
