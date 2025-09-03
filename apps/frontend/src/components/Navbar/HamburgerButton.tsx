interface HamburgerButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

export const HamburgerButton = ({ isOpen, onClick }: HamburgerButtonProps) => (
  <button
    aria-label="Toggle mobile menu"
    className={`flex h-8 w-8 flex-col items-center justify-center rounded-md transition-colors duration-200 sm:hidden ${
      isOpen ? "bg-white" : "btn-vortex-secondary"
    }`}
    onClick={onClick}
  >
    <span className={`block h-0.5 w-5 transition-colors duration-200 ${isOpen ? "bg-blue-950" : "bg-white"}`} />
    <span className={`mt-1 block h-0.5 w-5 transition-colors duration-200 ${isOpen ? "bg-blue-950" : "bg-white"}`} />
    <span className={`mt-1 block h-0.5 w-5 transition-colors duration-200 ${isOpen ? "bg-blue-950" : "bg-white"}`} />
  </button>
);
