export async function waitUntilTrue(test: () => Promise<boolean>, periodMs = 1000) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await test()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, periodMs));
  }
}
