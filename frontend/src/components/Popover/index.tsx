import { ReactNode, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface PopoverProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

export const Popover = ({ children, className = '', id }: PopoverProps) => {
  // const popoverRef = useRef<HTMLDivElement>(null);
  // const modalsElement = document.getElementById('modals');

  console.log('Popover render');

  const setPopoverRef = useCallback((node: HTMLDivElement | null) => {
    console.log('node', node);
    if (node) {
      if (node.matches && !node.matches(':popover-open')) {
        console.log('showPopover');
        node.showPopover();
      } else if (node.matches && node.matches(':popover-open')) {
        node.hidePopover();
      }
    }
    // popoverRef.current = node;
  }, []);

  // useEffect(() => {
  //   return () => {
  //     const popover = popoverRef.current;
  //     if (popover && popover.matches(':popover-open')) {
  //       popover.hidePopover();
  //     }
  //   };
  // }, []);

  // if (!modalsElement) return null;

  return (
    <div ref={setPopoverRef} popover="manual" id={id} className={className}>
      {children}
    </div>
  );
};
