import closeIcon from "../../../assets/close-icon.svg";

type CloseButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export const CloseButton = (props: CloseButtonProps) => (
  <button
    className="btn btn-ghost btn-sm btn-circle w-[3rem] text-secondary transition-transform duration-200 active:scale-95"
    type="button"
    {...props}
  >
    <span className="text-[1.25em]">
      <img alt="Close" src={closeIcon} />
    </span>
  </button>
);
