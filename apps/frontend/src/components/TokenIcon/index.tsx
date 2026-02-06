import { FC, memo, useState } from "react";
import placeholderIcon from "../../assets/coins/placeholder.svg";
import { cn } from "../../helpers/cn";

interface TokenIconProps {
  src: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
}

export const TokenIcon: FC<TokenIconProps> = memo(function TokenIcon({ src, fallbackSrc, alt, className }) {
  const [isLoading, setIsLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [fallbackError, setFallbackError] = useState(false);

  const handleError = () => {
    if (!imgError) {
      setImgError(true);
      if (!fallbackSrc) {
        setIsLoading(false);
      }
    } else {
      setFallbackError(true);
      setIsLoading(false);
    }
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

  const getImageSrc = () => {
    if (!imgError) return src;
    if (fallbackSrc && !fallbackError) return fallbackSrc;
    return placeholderIcon;
  };

  return (
    <div className={cn("relative", className)}>
      {isLoading && <div className="absolute inset-0 rounded-full bg-gray-200" />}
      <img
        alt={alt}
        className={cn("h-full w-full rounded-full object-contain", isLoading && "opacity-0")}
        decoding="async"
        loading="lazy"
        onError={handleError}
        onLoad={handleLoad}
        src={getImageSrc()}
      />
    </div>
  );
});
