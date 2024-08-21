import { useMemo } from 'preact/hooks';

export function useClipboard() {
  return useMemo(
    () => ({
      async copyToClipboard(value: string) {
        try {
          await navigator.clipboard.writeText(value);
        } catch (error) {
          console.error('Failed to copy: ', error);
        }
      },
    }),
    [],
  );
}
