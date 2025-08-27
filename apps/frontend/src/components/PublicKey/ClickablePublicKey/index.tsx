import { CSSProperties, JSX } from "react";
import { FormatPublicKeyVariant, PublicKey } from "..";

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
    className={`btn btn-ghost m-0 h-1 rounded p-1 ${props.className || ""}`}
    onClick={props.onClick}
    style={props.inline ? { height: "inherit", minHeight: "0", padding: 0 } : {}}
    type="button"
  >
    <PublicKey {...props} />
    {props.icon ? (
      <>
        {props.icon}
        &nbsp;
      </>
    ) : null}
  </button>
);
