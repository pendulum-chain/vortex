import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FormEvent, useId, useState } from "react";
import PaymentsHeroRails from "../../assets/payments-hero-rails.png";
import { cn } from "../../helpers/cn";
import { submitContactForm } from "../../services/api/contact.service";

const FLOW_SEGMENTS = [
  {
    body: "Invoice foreign clients and settle into local operating funds for payroll, contractors, and monthly expenses.",
    detail: "Software, BPO, design, staffing, digital studios",
    title: "Service exporters"
  },
  {
    body: "Move export receivables into vendor, freight, and operating payments with clearer quotes and stablecoin-based settlement routes.",
    detail: "Manufacturing, apparel, agro, food, packaging",
    title: "Product exporters and importers"
  },
  {
    body: "Add fiat-stablecoin settlement and payout flows through Vortex API/widget while Vortex and local partners handle the compliance-heavy parts.",
    detail: "Fintechs, marketplaces, payment platforms",
    title: "Platforms and marketplaces"
  }
];

const PROCESS_STEPS = [
  {
    body: "Confirm company profile, countries, monthly volume, counterparties, and payout needs.",
    title: "Complete KYB and route review"
  },
  {
    body: "Bring in customer payments, stablecoin treasury, or operational funds through supported routes.",
    title: "Receive or route funds"
  },
  {
    body: "Review route-dependent pricing, FX, stablecoin conversion, timing, and payout path.",
    title: "Compare a quote"
  },
  {
    body: "Convert into local bank settlement, vendor payments, or route-dependent payout flows through Vortex and local partners.",
    title: "Settle or pay out locally"
  }
];

const FIT_ITEMS = [
  {
    body: "Designed around routes and execution rather than forcing businesses into a new treasury stack.",
    title: "Non-custodial by design"
  },
  {
    body: "Connect fiat and stablecoin rails with local settlement paths where availability supports it.",
    title: "Local partner coverage"
  },
  {
    body: "Compliance-heavy flows are handled through Vortex and its partners, subject to route requirements.",
    title: "KYB and KYC aware"
  },
  {
    body: "Give finance teams a concrete comparison before moving money across rails.",
    title: "Quote-based execution"
  }
];

const CURRENCIES = ["EUR", "USD", "USDC", "EURC", "BRL", "MXN", "COP", "ARS"];
const LOCAL_RAILS = ["Pix", "Bre-B", "Instant SEPA", "Argentina instant rails", "Mexico instant rails"];

const COMPARISON_ROWS = [
  {
    question: "What spread am I paying?",
    traditional: "Often blended into bank FX and correspondent costs.",
    vortex: "Quote-based route review before execution."
  },
  {
    question: "How fast can funds become operating cash?",
    traditional: "Corridor, bank, and intermediary dependent.",
    vortex: "Route-dependent settlement paths through local partners."
  },
  {
    question: "Can I pay vendors or contractors locally?",
    traditional: "Usually handled outside the receivables workflow.",
    vortex: "Discuss payout currency, country, counterparty, and compliance needs together."
  }
];

const selectClassName =
  "select select-bordered w-full rounded-lg border-neutral-300 bg-white text-gray-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const inputClassName =
  "input-vortex-primary input-ghost w-full rounded-lg border border-neutral-300 p-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export function PaymentsPage() {
  return (
    <main className="overflow-hidden bg-white text-gray-800">
      <HeroSection />
      <CurrencyStrip />
      <BusinessFlowsSection />
      <HowItWorksSection />
      <WhereVortexFitsSection />
      <RoutesSection />
      <FinanceComparisonSection />
      <LeadSection />
    </main>
  );
}

function HeroSection() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section
      aria-labelledby="payments-hero-title"
      className="bg-gradient-to-b from-white to-blue-50 px-4 py-20 md:px-10 lg:py-28"
    >
      <div className="container mx-auto grid items-center gap-12 lg:grid-cols-[0.92fr_1.08fr]">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
          transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <p className="font-semibold text-primary text-sm uppercase tracking-[0.18em]">
            Stablecoin payment infrastructure for business
          </p>
          <h1 className="mt-5 font-bold text-blue-950 text-h1" id="payments-hero-title" style={{ textWrap: "balance" }}>
            Receive international business payments on stablecoin rails
          </h1>
          <p className="mt-6 max-w-xl text-body-lg text-gray-600">
            Vortex helps businesses turn cross-border customer payments into local settlement, stablecoin treasury, or local
            bank payouts through compliant fiat and stablecoin routes.
          </p>
          <div className="mt-8 flex">
            <a className="btn btn-vortex-primary rounded-3xl px-7" href="#payments-lead-form">
              Talk to Vortex
            </a>
          </div>
        </motion.div>

        <motion.div
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="relative"
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.96, y: 20 }}
          transition={{ delay: shouldReduceMotion ? 0 : 0.1, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <div className="overflow-hidden rounded-lg bg-blue-950 shadow-2xl">
            <img
              alt="Global stablecoin payment route visual with illuminated international settlement paths"
              className="h-full min-h-[240px] w-full object-cover"
              draggable={false}
              src={PaymentsHeroRails}
            />
          </div>
          <PaymentRouteCard />
        </motion.div>
      </div>
    </section>
  );
}

function PaymentRouteCard() {
  return (
    <aside
      aria-label="Payment route visual"
      className="-mt-10 lg:-mt-16 relative mx-auto max-w-3xl rounded-lg border border-blue-100 bg-white/95 p-4 shadow-card backdrop-blur md:p-5"
    >
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1.2fr] md:items-center">
        <RouteNode label="Foreign customer invoice" value="USD / EUR" />
        <RouteArrow />
        <RouteNode highlight label="Stablecoin route" value="USDC / EURC" />
        <RouteArrow />
        <RouteNode label="Local bank payout" tags={["BRL", "COP", "MXN", "ARS"]} value="Bank account settlement" />
      </div>
    </aside>
  );
}

function RouteNode({
  label,
  value,
  tags,
  highlight = false
}: {
  label: string;
  value: string;
  tags?: string[];
  highlight?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border p-4", highlight ? "border-primary bg-blue-50" : "border-gray-100 bg-white")}>
      <p className="font-medium text-gray-500 text-sm">{label}</p>
      <p className="mt-1 font-bold text-blue-950 text-lg">{value}</p>
      {tags && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map(tag => (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary text-xs" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RouteArrow() {
  return <div aria-hidden="true" className="hidden h-px w-8 bg-primary md:block" />;
}

function CurrencyStrip() {
  return (
    <section aria-label="Supported route currencies" className="border-blue-100 border-y bg-white px-4 py-6 md:px-10">
      <div className="container mx-auto flex flex-wrap justify-center gap-3">
        {["USDC", "EURC", "USD", "EUR", "BRL", "MXN", "COP", "ARS"].map(currency => (
          <span className="rounded-full bg-gray-50 px-4 py-2 font-semibold text-blue-950 text-sm shadow-sm" key={currency}>
            {currency}
          </span>
        ))}
      </div>
    </section>
  );
}

function BusinessFlowsSection() {
  return (
    <section aria-labelledby="payments-flows-title" className="container mx-auto px-4 py-20 md:px-10 lg:py-28">
      <SectionHeading
        eyebrow="Built for real business flows"
        title="Turn international receivables into local operating cash"
      />
      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {FLOW_SEGMENTS.map(item => (
          <article className="rounded-lg border border-gray-100 bg-white p-6 shadow-card" key={item.title}>
            <div
              aria-hidden="true"
              className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-primary"
            >
              <span className="h-5 w-5 rounded-full border-4 border-current" />
            </div>
            <h3 className="font-bold text-blue-950 text-h3">{item.title}</h3>
            <p className="mt-3 text-body text-gray-600">{item.body}</p>
            <p className="mt-5 font-semibold text-gray-800 text-sm">{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section aria-labelledby="payments-process-title" className="bg-blue-50 px-4 py-20 md:px-10 lg:py-28">
      <div className="container mx-auto grid gap-12 lg:grid-cols-[0.78fr_1fr]">
        <div className="lg:sticky lg:top-24 lg:h-fit">
          <SectionHeading align="left" eyebrow="How it works" title="From KYB to quote-based settlement" />
          <p className="mt-5 max-w-xl text-body-lg text-gray-600">
            Vortex gives finance teams a practical path from customer payment to local settlement, with compliance review, quote
            visibility, and payout routing in one flow.
          </p>
        </div>
        <ol className="space-y-5">
          {PROCESS_STEPS.map((step, index) => (
            <li className="grid gap-4 rounded-lg bg-white p-6 shadow-card md:grid-cols-[auto_1fr]" key={step.title}>
              <span className="font-bold text-h3 text-primary">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="font-bold text-blue-950 text-h3">{step.title}</h3>
                <p className="mt-2 text-body text-gray-600">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function WhereVortexFitsSection() {
  return (
    <section aria-labelledby="payments-fit-title" className="bg-blue-950 px-4 py-20 text-white md:px-10 lg:py-28">
      <div className="container mx-auto">
        <SectionHeading
          eyebrow="Where Vortex fits"
          title="Finance infrastructure without the operational sprawl"
          variant="dark"
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {FIT_ITEMS.map(item => (
            <article className="rounded-lg border border-white/10 bg-white/5 p-6" key={item.title}>
              <h3 className="font-bold text-h3 text-white">{item.title}</h3>
              <p className="mt-3 text-blue-100 text-body">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function RoutesSection() {
  return (
    <section
      aria-labelledby="payments-routes-title"
      className="container mx-auto grid gap-12 px-4 py-20 md:px-10 lg:grid-cols-2 lg:py-28"
    >
      <div>
        <SectionHeading align="left" eyebrow="Routes we can discuss" title="EUR, USD, stablecoins, and local payout routes" />
        <p className="mt-5 text-body-lg text-gray-600">
          Vortex can discuss routes that connect fiat and stablecoin settlement with local instant payment systems, including
          Pix in Brazil, Bre-B in Colombia, Instant SEPA in Europe, and comparable instant bank rails in Argentina and Mexico.
          Availability, limits, timing, and pricing stay route-dependent.
        </p>
        <ChipSet items={CURRENCIES} label="Currency routes" />
        <ChipSet items={LOCAL_RAILS} label="Local payout rails" muted />
      </div>
      <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-card">
        <div className="rounded-lg bg-blue-950 p-4 text-white">
          <p className="font-semibold text-blue-200 text-sm">Route preview</p>
          <h3 className="mt-1 font-bold text-h3">Convert USDT to BRL via Pix</h3>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <AmountCard detail="Stablecoin balance" label="From" value="10,000 USDT" />
          <div
            aria-hidden="true"
            className="mx-auto h-10 w-10 rounded-full bg-primary/10 text-center font-bold text-primary leading-10"
          >
            →
          </div>
          <AmountCard detail="Brazilian bank account" label="To" value="BRL via Pix" />
        </div>
        <ol className="mt-5 grid gap-3">
          {["Company KYB reviewed", "Route and quote confirmed", "Local bank settlement initiated"].map((item, index) => (
            <li className="flex items-center gap-3 rounded-lg bg-blue-50 p-3 text-gray-700" key={item}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-sm text-white">
                {index + 1}
              </span>
              {item}
            </li>
          ))}
        </ol>
        <p className="mt-5 text-gray-500 text-sm">
          Subject to KYB/KYC, limits, liquidity, and regulatory availability through local partners.
        </p>
      </div>
    </section>
  );
}

function AmountCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <p className="font-medium text-gray-500 text-sm">{label}</p>
      <p className="mt-1 font-bold text-blue-950 text-xl">{value}</p>
      <p className="mt-1 text-gray-500 text-sm">{detail}</p>
    </div>
  );
}

function FinanceComparisonSection() {
  return (
    <section aria-labelledby="payments-finance-title" className="bg-blue-50 px-4 py-20 md:px-10 lg:py-28">
      <div className="container mx-auto">
        <SectionHeading eyebrow="Finance-team comparison" title="A cleaner way to compare cross-border payment routes" />
        <div className="mt-12 overflow-hidden rounded-lg bg-white shadow-card">
          <div className="grid bg-blue-950 px-5 py-4 font-semibold text-white md:grid-cols-3">
            <span>Question</span>
            <span className="hidden md:block">Traditional path</span>
            <span className="hidden md:block">Vortex route discussion</span>
          </div>
          {COMPARISON_ROWS.map(row => (
            <div className="grid gap-3 border-gray-100 border-t px-5 py-5 md:grid-cols-3" key={row.question}>
              <div>
                <p className="font-semibold text-blue-950">{row.question}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-400 text-xs uppercase md:hidden">Traditional path</p>
                <p className="text-gray-600">{row.traditional}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-400 text-xs uppercase md:hidden">Vortex route discussion</p>
                <p className="text-gray-600">{row.vortex}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LeadSection() {
  return (
    <section
      aria-labelledby="payments-lead-title"
      className="container mx-auto grid gap-10 px-4 py-20 md:px-10 lg:grid-cols-[0.8fr_1fr] lg:py-28"
      id="payments-lead-form"
    >
      <div>
        <SectionHeading align="left" eyebrow="Compare your route" title="Tell us the payment flow you want to improve" />
        <p className="mt-5 text-body-lg text-gray-600">
          Share the currencies, countries, and monthly volume. Vortex can review whether a fiat and stablecoin route is worth
          comparing for your business.
        </p>
        <p className="mt-6 text-gray-500 text-sm">
          Prefer a direct note?{" "}
          <Link
            className="font-semibold text-primary underline decoration-primary/30 underline-offset-2"
            to="/{-$locale}/contact"
          >
            Contact the Vortex team
          </Link>
          .
        </p>
      </div>
      <PaymentsLeadForm />
    </section>
  );
}

function PaymentsLeadForm() {
  const formId = useId();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const mutation = useMutation({
    mutationFn: submitContactForm,
    onError: () => setStatus("error"),
    onSuccess: () => setStatus("success")
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const companyEmail = String(formData.get("companyEmail") || "");
    const companyName = String(formData.get("companyName") || "Payments route lead");
    const routeSummary = [
      `Monthly volume: ${formData.get("volume")}`,
      `Receive currency: ${formData.get("receiveCurrency")}`,
      `Payout currency: ${formData.get("payoutCurrency")}`,
      `Country: ${formData.get("country")}`,
      `Use case: ${formData.get("useCase")}`
    ].join("\n");

    mutation.mutate({
      email: companyEmail,
      fullName: companyName,
      inquiry: `Payments route comparison request\n\n${routeSummary}`,
      projectName: companyName,
      timestamp: new Date().toISOString()
    });
  };

  const disabled = mutation.isPending || status === "success";

  return (
    <form className="rounded-lg bg-white p-6 shadow-card md:p-8" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField htmlFor={`${formId}-company`} label="Company name">
          <input className={inputClassName} disabled={disabled} id={`${formId}-company`} name="companyName" required />
        </FormField>
        <FormField htmlFor={`${formId}-email`} label="Company email">
          <input
            autoComplete="email"
            className={inputClassName}
            disabled={disabled}
            id={`${formId}-email`}
            name="companyEmail"
            required
            type="email"
          />
        </FormField>
        <FormField htmlFor={`${formId}-volume`} label="Monthly volume">
          <select className={selectClassName} disabled={disabled} id={`${formId}-volume`} name="volume" required>
            <option value="">Select range</option>
            <option>Under 50k</option>
            <option>50k to 250k</option>
            <option>250k to 1m</option>
            <option>Over 1m</option>
          </select>
        </FormField>
        <FormField htmlFor={`${formId}-receive`} label="Receive currency">
          <select className={selectClassName} disabled={disabled} id={`${formId}-receive`} name="receiveCurrency" required>
            <option value="">Select currency</option>
            <option>USD</option>
            <option>EUR</option>
            <option>USDC</option>
            <option>EURC</option>
          </select>
        </FormField>
        <FormField htmlFor={`${formId}-payout`} label="Payout currency">
          <select className={selectClassName} disabled={disabled} id={`${formId}-payout`} name="payoutCurrency" required>
            <option value="">Select currency</option>
            <option>BRL</option>
            <option>MXN</option>
            <option>COP</option>
            <option>ARS</option>
            <option>EUR</option>
          </select>
        </FormField>
        <FormField htmlFor={`${formId}-country`} label="Country">
          <input
            className={inputClassName}
            disabled={disabled}
            id={`${formId}-country`}
            name="country"
            placeholder="Brazil, Argentina, Mexico"
            required
          />
        </FormField>
        <FormField className="md:col-span-2" htmlFor={`${formId}-use-case`} label="Use case">
          <select className={selectClassName} disabled={disabled} id={`${formId}-use-case`} name="useCase" required>
            <option value="">Select use case</option>
            <option>Service exporter</option>
            <option>Product exporter/importer</option>
            <option>Platform or marketplace</option>
            <option>Local payout</option>
          </select>
        </FormField>
      </div>
      <button className="btn btn-vortex-primary mt-6 w-full rounded-3xl" disabled={disabled} type="submit">
        {mutation.isPending ? "Sending..." : status === "success" ? "Request sent" : "Request route comparison"}
      </button>
      <AnimatePresence>
        {status === "error" && (
          <motion.p animate={{ opacity: 1 }} className="mt-3 text-error text-sm" exit={{ opacity: 0 }} initial={{ opacity: 0 }}>
            Something went wrong. Please try again or email sales@vortexfinance.co.
          </motion.p>
        )}
      </AnimatePresence>
      <p className="mt-4 text-gray-500 text-sm">Subject to KYB/KYC, limits, liquidity, and regulatory availability.</p>
    </form>
  );
}

function FormField({
  children,
  className,
  htmlFor,
  label
}: {
  children: React.ReactNode;
  className?: string;
  htmlFor: string;
  label: string;
}) {
  return (
    <label className={cn("block", className)} htmlFor={htmlFor}>
      <span className="mb-1 block font-medium text-gray-600 text-xs">{label}</span>
      {children}
    </label>
  );
}

function ChipSet({ items, label, muted = false }: { items: string[]; label: string; muted?: boolean }) {
  return (
    <div aria-label={label} className="mt-6 flex flex-wrap gap-2" role="group">
      {items.map(item => (
        <span
          className={cn(
            "rounded-full px-3 py-1.5 font-semibold text-sm",
            muted ? "bg-gray-100 text-gray-600" : "bg-primary/10 text-primary"
          )}
          key={item}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function SectionHeading({
  align = "center",
  eyebrow,
  title,
  variant = "light"
}: {
  align?: "center" | "left";
  eyebrow: string;
  title: string;
  variant?: "dark" | "light";
}) {
  const isDark = variant === "dark";

  return (
    <div className={cn(align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-2xl")}>
      <p className="font-semibold text-primary text-sm uppercase tracking-[0.18em]">{eyebrow}</p>
      <h2
        className={cn("mt-3 font-bold text-h2", isDark ? "text-white" : "text-blue-950")}
        id={
          eyebrow === "Built for real business flows"
            ? "payments-flows-title"
            : eyebrow === "How it works"
              ? "payments-process-title"
              : eyebrow === "Where Vortex fits"
                ? "payments-fit-title"
                : eyebrow === "Routes we can discuss"
                  ? "payments-routes-title"
                  : eyebrow === "Finance-team comparison"
                    ? "payments-finance-title"
                    : "payments-lead-title"
        }
        style={{ textWrap: "balance" }}
      >
        {title}
      </h2>
    </div>
  );
}
