import { CSSProperties, JSX } from 'react';
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
  <button
    className={`btn btn-ghost h-1 p-1 m-0 rounded ${props.className || ''}`}
    style={props.inline ? { height: 'inherit', minHeight: '0', padding: 0 } : {}}
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
  </button>
);
