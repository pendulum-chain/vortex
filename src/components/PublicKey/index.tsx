import { memo, useCallback } from 'preact/compat';
import { Button } from 'react-daisyui';
import CopyIcon from '../../assets/CopyIcon';
import { useClipboard } from '../../hooks/useClipboard';

type Variant = 'full' | 'short' | 'shorter' | 'hexa';

function getDigitCounts(variant?: Variant) {
  if (variant === 'short') {
    return {
      leading: 6,
      trailing: 6,
    };
  } else if (variant === 'hexa') {
    return {
      leading: 10,
      trailing: 10,
    };
  } else {
    return {
      leading: 4,
      trailing: 4,
    };
  }
}

export function shortenName(name: string, intendedLength: number) {
  if (name.length <= intendedLength) {
    return name;
  } else {
    return (
      name.substr(0, intendedLength - 3).trim() +
      '…' +
      name
        .substr(intendedLength - 3)
        .substr(-3)
        .trim()
    );
  }
}

interface PublicKeyProps {
  publicKey: string;
  variant?: Variant;
  style?: React.CSSProperties;
  className?: string;
  showRaw?: boolean;
}

// tslint:disable-next-line no-shadowed-variable
export const PublicKey = memo(function PublicKey(props: PublicKeyProps) {
  const { variant = 'full', className } = props;
  const digits = getDigitCounts(props.variant);

  const style: React.CSSProperties = {
    userSelect: 'text',
    WebkitUserSelect: 'text',
    whiteSpace: variant !== 'full' ? 'pre' : undefined,
    ...props.style,
  };

  return (
    <span style={style} className={className}>
      {props.variant === 'full' || !props.variant
        ? props.publicKey
        : props.publicKey.substr(0, digits.leading) + '…' + props.publicKey.substr(-digits.trailing)}
    </span>
  );
});

interface AddressProps {
  publicKey: string;
  variant?: Variant;
  inline?: boolean;
  style?: React.CSSProperties;
  className?: string;
  icon?: JSX.Element;
  onClick?: () => void;
  wrap?: boolean;
}

// tslint:disable-next-line no-shadowed-variable
export const ClickableAddress = memo(function ClickableAddress(props: AddressProps) {
  return (
    <Button
      className="rounded h-1 p-1 m-0"
      style={props.inline ? { height: 'inherit', minHeight: '0', padding: 0 } : {}}
      color="ghost"
      type="button"
      onClick={props.onClick}
    >
      {props.icon ? (
        <>
          {props.icon}
          &nbsp;
        </>
      ) : null}
      <PublicKey {...props} />
    </Button>
  );
});

interface CopyableAddressProps extends AddressProps {
  onClick?: () => void;
}

// tslint:disable-next-line no-shadowed-variable
export const CopyableAddress = memo(function CopyableAddress(props: CopyableAddressProps) {
  const { onClick } = props;
  const clipboard = useClipboard();

  const handleClick = useCallback(() => {
    if (onClick) {
      onClick();
    }
    clipboard.copyToClipboard(props.publicKey);
  }, [clipboard, onClick, props.publicKey]);

  return <ClickableAddress {...props} onClick={handleClick} icon={<CopyIcon className="w-4 h-4" />} />;
});
