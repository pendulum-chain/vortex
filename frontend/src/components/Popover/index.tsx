import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface PopoverProps {
  /**
   * Whether the popover should be visible
   */
  isVisible: boolean;

  /**
   * The content to display in the popover
   */
  children: ReactNode;

  /**
   * Optional CSS class name for the popover container
   */
  className?: string;

  /**
   * Delay in milliseconds before showing the popover
   * This is useful for controlling the order in the Top-Layer
   */
  showDelay?: number;

  /**
   * ID for the popover element
   */
  id?: string;

  /**
   * The element to render the popover into
   * Defaults to document.getElementById('modals')
   */
  container?: HTMLElement | null;
}

/**
 * A component that renders its children in a popover using the Popover API
 * This ensures the content appears in the Top-Layer
 */
export const Popover = ({ isVisible, children, className = '', showDelay = 100, id, container }: PopoverProps) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const modalsElement = container || document.getElementById('modals');

  useEffect(() => {
    const popover = popoverRef.current;
    let timeoutId: number | undefined;

    if (isVisible && popover) {
      timeoutId = window.setTimeout(() => {
        popover.showPopover();
      }, showDelay);
    } else if (popover && popover.matches(':popover-open')) {
      popover.hidePopover();
    }

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      if (popover && popover.matches(':popover-open')) {
        popover.hidePopover();
      }
    };
  }, [isVisible, showDelay]);

  if (!modalsElement) return null;

  return createPortal(
    <div ref={popoverRef} popover="manual" id={id} className={className}>
      {children}
    </div>,
    modalsElement,
  );
};
