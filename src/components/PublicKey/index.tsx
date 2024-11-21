import { CSSProperties } from 'react';

export type FormatPublicKeyVariant = 'full' | 'short' | 'shorter' | 'hexa';

const digitCounts: Record<FormatPublicKeyVariant, { leading: number; trailing: number }> = {
  full: { leading: 4, trailing: 4 },
  shorter: { leading: 4, trailing: 4 },
  short: { leading: 6, trailing: 6 },
  hexa: { leading: 10, trailing: 10 },
};

function getDigitCounts(variant: FormatPublicKeyVariant = 'full') {
  return digitCounts[variant];
}

export function shortenName(name: string, intendedLength: number) {
  if (name.length <= intendedLength) {
    return name;
  }
  return (
    name.substring(0, intendedLength - 3).trim() +
    '…' +
    name
      .substring(intendedLength - 3)
      .slice(-3)
      .trim()
  );
}

interface PublicKeyProps {
  publicKey: string;
  variant?: FormatPublicKeyVariant;
  style?: CSSProperties;
  className?: string;
  showRaw?: boolean;
}

export function PublicKey({ publicKey, variant = 'full', style, className }: PublicKeyProps) {
  const digits = getDigitCounts(variant);

  const spanStyle: CSSProperties = {
    userSelect: 'text',
    WebkitUserSelect: 'text',
    whiteSpace: variant !== 'full' ? 'pre' : undefined,
    ...style,
  };

  return (
    <span style={spanStyle} className={className}>
      {variant === 'full'
        ? publicKey
        : publicKey.substring(0, digits.leading) + '…' + publicKey.substring(publicKey.length - digits.trailing)}
    </span>
  );
}
