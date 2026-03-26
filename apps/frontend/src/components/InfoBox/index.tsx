import { cn } from "../../helpers/cn";

interface InfoBoxProps {
  children: React.ReactNode;
  className?: string;
}

export const InfoBox = ({ children, className }: InfoBoxProps) => (
  <div className={cn("rounded-lg border border-gray-300 p-4", className)}>{children}</div>
);
