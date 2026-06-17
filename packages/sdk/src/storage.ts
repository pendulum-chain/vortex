const isNode = typeof window === "undefined";

async function storeEphemeralKeys(fileName: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  if (isNode) {
    const { writeFile } = await import("fs/promises");
    await writeFile(fileName, content, "utf-8");
  } else {
    localStorage.setItem(fileName, content);
  }
}

async function retrieveEphemeralKeys(key: string): Promise<unknown | null> {
  if (isNode) {
    try {
      const { readFile } = await import("fs/promises");
      const data = await readFile(`${key}.json`, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
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
