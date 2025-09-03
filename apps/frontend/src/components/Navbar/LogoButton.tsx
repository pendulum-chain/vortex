import whiteLogo from "../../assets/logo/white.png";

interface LogoButtonProps {
  onClick: () => void;
}

export const LogoButton = ({ onClick }: LogoButtonProps) => (
  <button className="cursor-pointer" onClick={onClick}>
    <img alt="Vortex Logo" className="xs:block max-w-38" src={whiteLogo} />
  </button>
);
