import { MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

interface SearchInputProps {
  set: Dispatch<SetStateAction<string>>;
  placeholder?: string;
}

export const SearchInput = ({ set, placeholder, ...p }: SearchInputProps) => {
  const { t } = useTranslation();

  return (
    <label
      className="input-vortex-primary flex items-center w-full input input-bordered h-[3rem] text-base focus:outline-primary"
      htmlFor="search"
    >
      <MagnifyingGlassIcon className="mr-1 size-5 text-neutral-400" />
      <input
        className="w-full h-[3rem] "
        type="text"
        placeholder={placeholder || t('components.searchInput.placeholder')}
        name="search"
        id="search"
        onChange={(e) => set((e.target as HTMLInputElement).value)}
        role="presentation"
        autoComplete="off"
        {...p}
      />
    </label>
  );
};
