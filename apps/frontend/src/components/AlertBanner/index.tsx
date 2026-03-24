import { cn } from "../../helpers/cn";

type AlertVariant = "warning" | "error" | "success";

const variantStyles: Record<AlertVariant, { container: string; text: string }> = {
  error: { container: "bg-error/10", text: "text-error" },
  success: { container: "bg-success/10", text: "text-success" },
  warning: { container: "bg-warning/10", text: "text-warning" }
};

interface AlertBannerProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  variant?: AlertVariant;
}

export function AlertBanner({ icon, title, description, children, className, variant = "warning" }: AlertBannerProps) {
  const { container, text } = variantStyles[variant];

  return (
    <div
      className={cn(
        "rounded-lg p-4",
        container,
        children ? "flex flex-col items-center" : "flex items-center gap-3",
        className
      )}
      role="alert"
    >
      <div className="flex items-center">
        {icon}
        <div className="ml-3">
          <p className={cn("font-medium text-sm", text)}>{title}</p>
          {description && <p className="text-gray-600 text-sm">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
