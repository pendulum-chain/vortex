import { applyLocale, FormatOn, formatValueForDisplay, ThousandStyle } from "numora";
import { NumoraInput } from "numora-react";
import type { ReactNode } from "react";
import { toDisplayAmount, toRawAmount } from "@/lib/amount";

// `true` resolves the visitor's browser locale. The same options drive the editable field and the
// read-only amounts, so a quote never shows two number formats side by side.
const FORMATTING_OPTIONS = {
  autoAddLeadingZero: true,
  formatOn: FormatOn.Change,
  thousandStyle: ThousandStyle.Thousand,
  ...applyLocale(true, {})
};

const DECIMAL_SEPARATOR = FORMATTING_OPTIONS.decimalSeparator ?? ".";
const THOUSAND_SEPARATOR = FORMATTING_OPTIONS.thousandSeparator ?? ",";

/** Formats a dot-decimal amount the way the input renders it, for read-only sides of a quote. */
export function formatAmount(raw: string, maxDecimals: number): string {
  return formatValueForDisplay(toDisplayAmount(raw, DECIMAL_SEPARATOR), maxDecimals, FORMATTING_OPTIONS).formatted;
}

interface AmountPanelProps {
  /** The amount itself — an `<AmountInput>` on the side the user drives, plain text on the other. */
  children: ReactNode;
  hint?: ReactNode;
  /** Set on the editable side so clicking the label focuses the field. */
  labelFor?: string;
  label: string;
  /** Currency chip: which fiat, token, and chain this side of the quote is denominated in. */
  selector: ReactNode;
}

export function AmountPanel({ children, hint, label, labelFor, selector }: AmountPanelProps) {
  return (
    // Scoped to the amount field: the chips inside carry their own focus ring, and lighting the
    // whole panel for those would double up. `outline` rather than `ring` because a ring is itself a
    // box-shadow and would replace the panel's elevation for as long as the field is focused.
    <div className="surface-raised rounded-lg bg-card p-4 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-ring/50 has-[input:focus-visible]:outline-offset-2">
      {labelFor ? (
        <label className="text-muted-foreground text-sm" htmlFor={labelFor}>
          {label}
        </label>
      ) : (
        <p className="text-muted-foreground text-sm">{label}</p>
      )}
      <div className="mt-1 flex h-11 items-center gap-3">
        {selector}
        <div className="flex min-w-0 flex-1 justify-end">{children}</div>
      </div>
      {hint && <div className="mt-2 flex items-center justify-between gap-3 pt-1 text-sm">{hint}</div>}
    </div>
  );
}

interface AmountInputProps {
  id: string;
  maxDecimals: number;
  onChange: (value: string) => void;
  /** Dot-decimal string; rendered through numora in the visitor's locale. */
  value: string;
}

export function AmountInput({ id, maxDecimals, onChange, value }: AmountInputProps) {
  return (
    <NumoraInput
      autoAddLeadingZero
      autoCapitalize="none"
      autoComplete="off"
      autoCorrect="off"
      className="w-full bg-transparent text-right font-semibold text-2xl tabular-nums outline-none placeholder:text-muted-foreground/50"
      data-1p-ignore
      decimalSeparator={DECIMAL_SEPARATOR}
      formatOn={FormatOn.Change}
      id={id}
      maxDecimals={maxDecimals}
      onChange={event => onChange(toRawAmount(event.target.value, DECIMAL_SEPARATOR, THOUSAND_SEPARATOR))}
      placeholder="0"
      spellCheck={false}
      thousandSeparator={THOUSAND_SEPARATOR}
      thousandStyle={ThousandStyle.Thousand}
      value={toDisplayAmount(value, DECIMAL_SEPARATOR)}
    />
  );
}
