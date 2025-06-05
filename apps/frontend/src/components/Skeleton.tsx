import { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '../helpers/cn';

export type SkeletonProps = {
  isLoading?: boolean;
  style?: CSSProperties;
  text?: string; // Optional text to display while loading
} & Omit<HTMLAttributes<HTMLDivElement>, 'style'>;

export const Skeleton = ({ className, isLoading, children, text, ...rest }: SkeletonProps) =>
  isLoading === false ? (
    <>{children}</>
  ) : (
    <div
      {...rest}
      className={cn(
        'bg-neutral-300 dark:bg-neutral-600 rounded-lg animate-pulse flex justify-center items-center',
        className,
      )}
    >
      <div className="invisible">{children}</div>
      {text && <p className="text-center text-lg font-medium">{text}</p>}
    </div>
  );
