export async function waitUntilTrue(test: () => Promise<boolean>, periodMs = 1000) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await test()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, periodMs));
  }
}

export async function waitUntilTrueWithTimeout(
  test: () => Promise<boolean>,
  periodMs = 1000,
  timeoutMs = 180000
): Promise<void> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout waiting for condition after ${timeoutMs} ms`)), timeoutMs);
  });

  const waitPromise = waitUntilTrue(test, periodMs);
  await Promise.race([waitPromise, timeoutPromise]);
}
