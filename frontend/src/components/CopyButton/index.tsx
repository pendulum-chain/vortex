interface CopyButtonProps {
  text: string;
  className?: string;
  inline?: boolean;
  onClick?: () => void;
}

export const CopyButton = ({ text, className, onClick }: CopyButtonProps) => (
  <button className={`break-all btn p-1 m-0 rounded ${className || ''}`} type="button" onClick={onClick}>
    {text}
  </button>
);
