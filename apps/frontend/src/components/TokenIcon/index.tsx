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

  const getImageSrc = () => {
    if (!imgError) return src;
    if (fallbackSrc && !fallbackError) return fallbackSrc;
    return placeholderIcon;
  };

  const handleError = () => {
    if (!imgError) {
      setImgError(true);
      setIsLoading(true);
    } else if (fallbackSrc && !fallbackError) {
      setFallbackError(true);
      setIsLoading(true);
    } else {
      setIsLoading(false);
    }
  };

  const handleLoad = () => {
    setIsLoading(false);
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
