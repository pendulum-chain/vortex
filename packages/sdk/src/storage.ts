import { readFile, writeFile } from "fs/promises";

const isNode = typeof window === "undefined";

async function storeEphemeralKeys(key: string, data: any): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  if (isNode) {
    await writeFile(`${key}.json`, content, "utf-8");
  } else {
    localStorage.setItem(key, content);
  }
}

async function retrieveEphemeralKeys(key: string): Promise<any | null> {
  if (isNode) {
    try {
      const data = await readFile(`${key}.json`, "utf-8");
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  } else {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }
}

export { storeEphemeralKeys, retrieveEphemeralKeys };
