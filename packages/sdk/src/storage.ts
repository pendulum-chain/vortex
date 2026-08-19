async function storeEphemeralKeys(fileName: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  const { writeFile } = await import("fs/promises");
  await writeFile(fileName, content, "utf-8");
}

async function retrieveEphemeralKeys(key: string): Promise<unknown | null> {
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
}

export { storeEphemeralKeys, retrieveEphemeralKeys };
