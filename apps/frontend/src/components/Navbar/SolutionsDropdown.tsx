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

  return (
    <div className="relative ml-3" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className={`cursor-pointer ${navLinkStyles}`}>{t("components.navbar.solutions")}</div>
      {isOpen && (
        <div className="absolute top-full left-0 z-50 cursor-initial pt-2">
          <div className="min-w-24 rounded-lg bg-white py-2 shadow-lg">
            {submenuItems.map(item => (
              <button className={submenuButtonStyles} key={item.label} onClick={item.onClick}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
