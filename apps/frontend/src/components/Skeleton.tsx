import { CSSProperties, HTMLAttributes } from "react";
import { cn } from "../helpers/cn";

export type SkeletonProps = {
  isLoading?: boolean;
  style?: CSSProperties;
  text?: string; // Optional text to display while loading
} & Omit<HTMLAttributes<HTMLDivElement>, "style">;

export const Skeleton = ({ className, isLoading, children, text, ...rest }: SkeletonProps) =>
  isLoading === false ? (
    <>{children}</>
  ) : (
    <div
      {...rest}
      className={cn("flex animate-pulse items-center justify-center rounded-lg bg-neutral-300 dark:bg-neutral-600", className)}
    >
      <div className="invisible">{children}</div>
      {text && <p className="text-center font-medium text-lg">{text}</p>}
    </div>
  );
