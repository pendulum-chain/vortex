import closeIcon from "../../../assets/close-icon.svg";

type CloseButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export const CloseButton = (props: CloseButtonProps) => (
  <button
    className="btn btn-ghost btn-sm btn-circle w-[3rem] transition-transform duration-200 active:scale-95"
    style={{ color: "var(--secondary)" }}
    type="button"
    {...props}
  >
    <span className="text-[1.25em]">
      <img alt="Close" src={closeIcon} />
    </span>
  </button>
);
