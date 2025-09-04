import { ReactNode } from "react";
import VortexBackgroundVideo from "../../assets/videos/vortex-background.webm";

interface QuoteBackgroundProps {
  children: ReactNode;
}

export function QuoteBackground({ children }: QuoteBackgroundProps) {
  return (
    <div className="relative overflow-hidden pb-4">
      <video
        autoPlay
        className="absolute top-0 left-0 z-0 h-full w-full object-cover"
        controls={false}
        loop
        muted
        playsInline
        preload="auto"
      >
        <source src={VortexBackgroundVideo} />
        Your browser does not support the video tag.
      </video>

      <div className="absolute top-0 left-0 z-10 h-full w-full bg-black opacity-25" />

      <div className="relative z-20 flex h-full px-4">{children}</div>
    </div>
  );
}
