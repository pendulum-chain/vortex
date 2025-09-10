import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
// Import country flag images
import brazilFlag from "../../assets/countries/brazil.png";
import usFlag from "../../assets/countries/english.png";
import { cn } from "../../helpers/cn";
import { Language } from "../../translations/helpers";

interface LanguageButtonProps {
  selectedLanguage: Language;
  isOpen: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const LanguageButton = ({ selectedLanguage, isOpen, onClick, disabled }: LanguageButtonProps) => (
  <motion.button
    className={cn(
      "flex cursor-pointer items-center gap-2 rounded-full bg-base-300 px-2 py-3 sm:px-4 ",
      disabled && "cursor-not-allowed opacity-50"
    )}
    disabled={disabled}
    onClick={onClick}
    whileHover={{ scale: disabled ? 1 : 1.02 }}
    whileTap={{ scale: disabled ? 1 : 0.98 }}
  >
    <img
      alt={selectedLanguage === Language.English ? "English" : "Português"}
      className={cn("h-5 w-5", disabled && "opacity-50")}
      src={selectedLanguage === Language.English ? usFlag : brazilFlag}
    />
    <motion.div animate={{ rotate: isOpen ? 180 : 0 }} className={cn(disabled && "opacity-50")} transition={{ duration: 0.2 }}>
      <ChevronDownIcon className="ml-1 block h-4 w-4" />
    </motion.div>
  </motion.button>
);

interface LanguageDropdownProps {
  isOpen: boolean;
  onLanguageSelect: (language: Language) => void;
  disabled?: boolean;
}

const LanguageDropdown = ({ isOpen, onLanguageSelect, disabled }: LanguageDropdownProps) => (
  <AnimatePresence>
    {isOpen && !disabled && (
      <motion.div
        animate={{ opacity: 1 }}
        className="absolute z-50 mt-2 w-48 whitespace-nowrap rounded-box bg-base-300 p-2 shadow-lg"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
        layout
        transition={{ duration: 0.2 }}
      >
        <button
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-base-200"
          onClick={() => onLanguageSelect(Language.English)}
        >
          <img alt="English" className="h-5 w-5" src={usFlag} />
          <span>English</span>
        </button>
        <button
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-base-200"
          onClick={() => onLanguageSelect(Language.Portuguese_Brazil)}
        >
          <img alt="Português" className="h-5 w-5" src={brazilFlag} />
          <span>Português</span>
        </button>
      </motion.div>
    )}
  </AnimatePresence>
);

function useClickOutside(ref: React.RefObject<HTMLDivElement | null>, callback: () => void) {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [callback, ref]);
}

// Helper function to update path with language
const updatePathWithLanguage = (path: string, language: Language): string => {
  const languageValues = Object.values(Language);

  // Check if path already contains a language segment
  for (const lang of languageValues) {
    const langSegment = `/${lang.toLowerCase()}`;
    if (path.includes(langSegment)) {
      // Replace existing language segment
      return path.replace(langSegment, `/${language.toLowerCase()}`);
    }
  }

  // No language segment found, add it at the beginning
  return `/${language.toLowerCase()}${path}`;
};

export const LanguageSelector = ({ disabled }: { disabled?: boolean }) => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get current language from i18n
  const currentLanguage = i18n.language === Language.Portuguese_Brazil ? Language.Portuguese_Brazil : Language.English;

  useClickOutside(dropdownRef, () => setIsOpen(false));

  const handleLanguageSelect = (language: Language) => {
    // Get current path and replace language segment or add it
    const currentPath = window.location.pathname;
    const newPath = updatePathWithLanguage(currentPath, language);

    // Update URL without full page reload
    window.history.pushState({}, "", newPath);

    // Update i18n language
    i18n.changeLanguage(language);

    setIsOpen(false);
  };

  const wrapperProps = disabled
    ? {
        className: "tooltip tooltip-primary tooltip-bottom before:whitespace-pre-wrap before:content-[attr(data-tip)]",
        "data-tip": "Language selection is disabled."
      }
    : {};

  return (
    <div {...wrapperProps}>
      <div className={cn("relative mr-2", disabled && "pointer-events-none")} ref={dropdownRef}>
        <LanguageButton
          disabled={disabled}
          isOpen={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          selectedLanguage={currentLanguage}
        />
        <LanguageDropdown disabled={disabled} isOpen={isOpen} onLanguageSelect={handleLanguageSelect} />
      </div>
    </div>
  );
};
