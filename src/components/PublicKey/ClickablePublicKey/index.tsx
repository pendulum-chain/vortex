import { CSSProperties, JSX } from 'react';
import { Button } from 'react-daisyui';
import { FormatPublicKeyVariant, PublicKey } from '..';

export interface ClickablePublicKeyProps {
  publicKey: string;
  variant?: FormatPublicKeyVariant;
  inline?: boolean;
  style?: CSSProperties;
  className?: string;
  icon?: JSX.Element;
  onClick?: () => void;
  wrap?: boolean;
}

export const ClickablePublicKey = (props: ClickablePublicKeyProps) => (
  <Button
    className="h-1 p-1 m-0 rounded"
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
