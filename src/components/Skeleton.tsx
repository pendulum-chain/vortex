import { CSSProperties, HTMLAttributes } from 'preact/compat';

export type SkeletonProps = {
  isLoading?: boolean;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLDivElement>, 'style'>;

export const Skeleton = ({ className, isLoading, children, ...rest }: SkeletonProps) =>
  isLoading === false ? (
    <>{children}</>
  ) : (
    <div {...rest} className={`bg-neutral-300 dark:bg-neutral-600 rounded-lg ${className} animate-pulse`}>
      <div className="invisible">{children}</div>
    </div>
  );
