import { ReactNode, useEffect, useRef } from "react";

interface PopoverProps {
  children: ReactNode;
  className?: string;
  isVisible?: boolean;
}

export const Popover = ({ children, className = "", isVisible = true }: PopoverProps) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible) {
      popoverRef.current?.showPopover();
    } else {
      popoverRef.current?.hidePopover();
    }
  }, [isVisible]);

  return (
    <div className={className} popover="manual" ref={popoverRef}>
      {children}
    </div>
  );
};
