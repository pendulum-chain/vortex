import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { SubmenuItem } from "./types";

interface SolutionsDropdownProps {
  isOpen: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  submenuItems: SubmenuItem[];
}

const navLinkStyles = "text-white text-xl";
const submenuButtonStyles = "block w-full cursor-pointer px-4 py-2 text-left text-gray-800 transition-colors hover:bg-gray-100";

export const SolutionsDropdown = ({ isOpen, onMouseEnter, onMouseLeave, submenuItems }: SolutionsDropdownProps) => {
  const { t } = useTranslation();

  const handleTriggerClick = () => {
    if (isOpen) {
      onMouseLeave();
    } else {
      onMouseEnter();
    }
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isOpen) {
        onMouseLeave();
      } else {
        onMouseEnter();
      }
    }
    if (event.key === "Escape") {
      onMouseLeave();
    }
  };

  return (
    <div className="relative ml-3">
      <button
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={`cursor-pointer bg-transparent p-0 ${navLinkStyles}`}
        onClick={handleTriggerClick}
        onFocus={onMouseEnter}
        onKeyDown={handleTriggerKeyDown}
        onMouseEnter={onMouseEnter}
        type="button"
      >
        {t("components.navbar.solutions")}
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 z-50 cursor-initial pt-2">
          <div className="min-w-24 rounded-lg bg-white py-2 shadow-lg">
            {submenuItems.map(item => (
              <button
                className={submenuButtonStyles}
                key={item.label}
                onBlur={onMouseLeave}
                onClick={item.onClick}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
