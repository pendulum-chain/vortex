import { ReactNode } from "react";

interface QuoteBackgroundProps {
  children: ReactNode;
}

export function QuoteBackground({ children }: QuoteBackgroundProps) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 pb-4">
      <div className="absolute top-0 left-0 z-10 h-full w-full bg-black opacity-25" />

      <div className="relative z-20 flex h-full px-4">{children}</div>
    </div>
  );
}
