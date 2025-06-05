import { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../helpers/cn';
import { Language } from '../../translations/helpers';

// Import country flag images
import brazilFlag from '../../assets/countries/brazil.png';
import usFlag from '../../assets/countries/united-states.png';

interface LanguageButtonProps {
  selectedLanguage: Language;
  isOpen: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const LanguageButton = ({ selectedLanguage, isOpen, onClick, disabled }: LanguageButtonProps) => (
  <motion.button
    className={cn(
      'flex items-center gap-2 px-2 sm:px-4 py-3 rounded-full bg-base-100',
      disabled && 'opacity-50 cursor-not-allowed',
    )}
    onClick={onClick}
    whileHover={{ scale: disabled ? 1 : 1.02 }}
    whileTap={{ scale: disabled ? 1 : 0.98 }}
    disabled={disabled}
  >
    <img
      src={selectedLanguage === Language.English ? usFlag : brazilFlag}
      alt={selectedLanguage === Language.English ? 'English' : 'Português'}
      className={cn('w-5 h-5', disabled && 'opacity-50')}
    />
    <motion.div
      animate={{ rotate: isOpen ? 180 : 0 }}
      transition={{ duration: 0.2 }}
      className={cn(disabled && 'opacity-50')}
    >
      <ChevronDownIcon className="block w-4 h-4 ml-1" />
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
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute z-50 w-48 p-2 mt-2 shadow-lg bg-base-100 rounded-box whitespace-nowrap"
        layout
      >
        <button
          onClick={() => onLanguageSelect(Language.English)}
          className="flex items-center w-full gap-2 p-2 rounded-lg hover:bg-base-200"
        >
          <img src={usFlag} alt="English" className="w-5 h-5" />
          <span>English</span>
        </button>
        <button
          onClick={() => onLanguageSelect(Language.Portuguese_Brazil)}
          className="flex items-center w-full gap-2 p-2 rounded-lg hover:bg-base-200"
        >
          <img src={brazilFlag} alt="Português" className="w-5 h-5" />
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

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    window.history.pushState({}, '', newPath);

    // Update i18n language
    i18n.changeLanguage(language);

    setIsOpen(false);
  };

  const wrapperProps = disabled
    ? {
        className: 'tooltip tooltip-primary tooltip-bottom before:whitespace-pre-wrap before:content-[attr(data-tip)]',
        'data-tip': 'Language selection is disabled.',
      }
    : {};

  return (
    <div {...wrapperProps}>
      <div className={cn('relative mr-2', disabled && 'pointer-events-none')} ref={dropdownRef}>
        <LanguageButton
          selectedLanguage={currentLanguage}
          isOpen={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
        />
        <LanguageDropdown isOpen={isOpen} onLanguageSelect={handleLanguageSelect} disabled={disabled} />
      </div>
    </div>
  );
};
