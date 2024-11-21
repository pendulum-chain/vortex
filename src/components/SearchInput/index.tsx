import { MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { Dispatch } from 'react';

interface SearchInputProps {
  set: Dispatch<string>;
}

export const SearchInput = ({ set, ...p }: SearchInputProps) => (
  <label className="input input-bordered flex items-center" htmlFor="search">
    <MagnifyingGlassIcon className="mr-1 size-5 text-neutral-400" />
    <input
      className="w-full"
      type="text"
      placeholder="Search"
      name="search"
      id="search"
      onChange={(e) => set((e.target as HTMLInputElement).value)}
      role="presentation"
      autoComplete="off"
      {...p}
    />
  </label>
);
