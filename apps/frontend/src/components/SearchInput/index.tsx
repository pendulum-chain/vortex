import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";

interface SearchInputProps {
  set: Dispatch<SetStateAction<string>>;
  placeholder?: string;
}

export const SearchInput = ({ set, placeholder, ...p }: SearchInputProps) => {
  const { t } = useTranslation();

  return (
    <label
      className="input-vortex-primary input input-bordered flex h-[3rem] w-full items-center text-base focus:outline-primary"
      htmlFor="search"
    >
      <MagnifyingGlassIcon className="mr-1 size-5 text-neutral-400" />
      <input
        autoComplete="off"
        className="h-[3rem] w-full "
        id="search"
        name="search"
        onChange={e => set((e.target as HTMLInputElement).value)}
        placeholder={placeholder || t("components.searchInput.placeholder")}
        role="presentation"
        type="text"
        {...p}
      />
    </label>
  );
};
