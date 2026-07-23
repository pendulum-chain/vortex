import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { TokenIcon } from "@/components/assets/AssetIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { filterOnrampTokenOptions, type OnrampTokenOption } from "@/domain/onramp";
import { cn } from "@/lib/cn";

interface TokenComboboxProps extends Omit<React.ComponentProps<typeof Button>, "onChange" | "value"> {
  onChange: (option: OnrampTokenOption) => void;
  options: OnrampTokenOption[];
  value: string;
}

export function TokenCombobox({ onChange, options, value, className, ...triggerProps }: TokenComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const selected = options.find(option => option.currency === value);
  const filtered = filterOnrampTokenOptions(options, deferredSearch);

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSearch("");
    }
  }

  return (
    <Popover onOpenChange={changeOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
          role="combobox"
          type="button"
          variant="outline"
          {...triggerProps}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected && (
              <TokenIcon
                fallbackLogoURI={selected.token.fallbackLogoURI}
                logoURI={selected.token.logoURI}
                network={selected.network}
              />
            )}
            <span className="truncate">{selected?.label ?? "Select token"}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      {/* Matches the trigger when it is a full-width form field, but never collapses to the width of a chip. */}
      <PopoverContent align="end" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
        <div className="relative border-b p-2">
          <Search className="-translate-y-1/2 absolute top-1/2 left-4 size-4 text-muted-foreground" />
          <Input
            aria-label="Search tokens"
            autoFocus
            className="border-0 pl-8 shadow-none focus-visible:ring-0"
            onChange={event => setSearch(event.target.value)}
            placeholder="Search token or network"
            value={search}
          />
        </div>
        <div aria-label="Token options" className="max-h-64 overflow-y-auto p-1" role="listbox">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-muted-foreground text-sm">No tokens found.</p>
          ) : (
            filtered.map(option => (
              <button
                aria-label={option.label}
                aria-selected={option.currency === value}
                className="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                key={option.currency}
                onClick={() => {
                  onChange(option);
                  changeOpen(false);
                }}
                role="option"
                type="button"
              >
                <TokenIcon
                  fallbackLogoURI={option.token.fallbackLogoURI}
                  logoURI={option.token.logoURI}
                  network={option.network}
                />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">{option.label}</span>
                  <span className="truncate text-muted-foreground text-xs">{option.networkLabel}</span>
                </span>
                <Check className={cn("size-4", option.currency === value ? "opacity-100" : "opacity-0")} />
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
