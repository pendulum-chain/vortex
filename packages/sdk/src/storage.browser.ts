async function storeEphemeralKeys(fileName: string, data: unknown): Promise<void> {
  localStorage.setItem(fileName, JSON.stringify(data, null, 2));
}

async function retrieveEphemeralKeys(key: string): Promise<unknown | null> {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : null;
}

export { storeEphemeralKeys, retrieveEphemeralKeys };
