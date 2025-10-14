import { CSSProperties, JSX, useState } from "react";
import { AnimatedIcon } from "../../AnimatedIcon";
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

export const ClickablePublicKey = (props: ClickablePublicKeyProps) => {
  const [triggerAnimation, setTriggerAnimation] = useState(false);

  const handleClick = () => {
    if (props.onClick) {
      props.onClick();
    }
    setTriggerAnimation(true);
  };

  const handleAnimationComplete = () => {
    setTriggerAnimation(false);
  };

  return (
    <button
      className={`btn btn-ghost m-0 h-1 rounded p-1 ${props.className || ""}`}
      onClick={handleClick}
      style={props.inline ? { height: "inherit", minHeight: "0", padding: 0 } : {}}
      type="button"
    >
      <PublicKey {...props} />
      <AnimatedIcon className="h-4 w-4" onAnimationComplete={handleAnimationComplete} trigger={triggerAnimation} />
    </button>
  );
};
