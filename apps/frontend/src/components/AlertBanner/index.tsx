import { cn } from "../../helpers/cn";

interface AlertBannerProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function AlertBanner({ icon, title, description, children, className }: AlertBannerProps) {
  return (
    <div
      className={cn(
        "rounded-lg bg-yellow-50 p-4",
        children ? "flex flex-col items-center" : "flex items-center gap-3",
        className
      )}
      role="alert"
    >
      <div className="flex items-center">
        {icon}
        <div className="ml-3">
          <p className="font-medium text-sm text-yellow-800">{title}</p>
          {description && <p className="text-gray-600 text-sm">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
