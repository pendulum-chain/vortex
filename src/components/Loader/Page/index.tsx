import { Skeleton } from '../../Skeleton';

export const PageLoader = ({ className = '' }: { className?: string }) => (
  <div className={className}>
    <Skeleton className="w-full h-[300px] mb-8" />
    <Skeleton className="w-[50%] h-[42px] mb-4" />
    <Skeleton className="w-[80%] h-[22px] mb-2" />
    <Skeleton className="w-[45%] h-[22px] mb-2" />
    <Skeleton className="w-[55%] h-[22px] mb-2" />
  </div>
);

export const defaultPageLoader = (
  <div className="flex justify-center my-8">
    <PageLoader className="w-full max-w-[800px]" />
  </div>
);
