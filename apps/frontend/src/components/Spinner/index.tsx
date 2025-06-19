import { cn } from "../../helpers/cn";

export type SpinnerSize = "sm" | "md" | "lg";
export type SpinnerTheme = "light" | "dark";

export function Spinner({ size = "sm", theme = "light" }: { size?: SpinnerSize; theme?: SpinnerTheme }) {
  const sizeClasses = {
    lg: "w-10 h-10",
    md: "w-8 h-8",
    sm: "w-6 h-6"
  };

  const themeClasses = {
    dark: "border-gray-600 ",
    light: "border-white"
  };

  return (
    <div
      className={cn(themeClasses[theme], "animate-spin rounded-full border-[2.5px] border-t-transparent", sizeClasses[size])}
    />
  );
}
