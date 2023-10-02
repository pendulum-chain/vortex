import { lazy, Suspense } from 'preact/compat';

interface Opts<T> {
  importFn: T;
  fallback: JSX.Element | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SuspenseLoad = <T extends () => Promise<any>>({ importFn, fallback }: Opts<T>) => {
  const LazyComponent = lazy(importFn);
  return (
    <Suspense fallback={fallback || null}>
      <LazyComponent />
    </Suspense>
  );
};
