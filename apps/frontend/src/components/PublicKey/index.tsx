import { CSSProperties } from "react";

export type FormatPublicKeyVariant = "full" | "short" | "shorter" | "hexa";

const digitCounts: Record<FormatPublicKeyVariant, { leading: number; trailing: number }> = {
  full: { leading: 4, trailing: 4 },
  hexa: { leading: 10, trailing: 10 },
  short: { leading: 6, trailing: 6 },
  shorter: { leading: 4, trailing: 4 }
};

function getDigitCounts(variant: FormatPublicKeyVariant = "full") {
  return digitCounts[variant];
}

interface PublicKeyProps {
  publicKey: string;
  variant?: FormatPublicKeyVariant;
  style?: CSSProperties;
  className?: string;
  showRaw?: boolean;
}

export function PublicKey({ publicKey, variant = "full", style, className }: PublicKeyProps) {
  const digits = getDigitCounts(variant);

  const spanStyle: CSSProperties = {
    userSelect: "text",
    WebkitUserSelect: "text",
    whiteSpace: variant !== "full" ? "pre" : undefined,
    ...style
  };

  return (
    <span className={className} style={spanStyle}>
      {variant === "full"
        ? publicKey
        : publicKey.substring(0, digits.leading) + "…" + publicKey.substring(publicKey.length - digits.trailing)}
    </span>
  );
}
