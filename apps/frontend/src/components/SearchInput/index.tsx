import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../helpers/cn";

interface SearchInputProps {
  set: Dispatch<SetStateAction<string>> | ((value: string) => void);
  placeholder?: string;
  className?: string;
}

export const SearchInput = ({ set, placeholder, className, ...p }: SearchInputProps) => {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "input-vortex-primary input input-bordered flex h-[3rem] items-center text-base focus-within:outline-primary",
        className ?? "w-full"
      )}
    >
      <label className="sr-only" htmlFor="search-input">
        {t("components.searchInput.placeholder")}
      </label>
      <MagnifyingGlassIcon className="mr-1 size-5 shrink-0 text-neutral-400" />
      <input
        autoComplete="off"
        className="h-[3rem] w-full"
        id="search-input"
        name="search"
        onChange={e => set((e.target as HTMLInputElement).value)}
        placeholder={placeholder || t("components.searchInput.placeholder")}
        role="presentation"
        type="text"
        {...p}
      />
    </div>
  );
};
