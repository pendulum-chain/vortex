import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import PaymentsHeroRails from "../../assets/payments-hero-rails.png";
import { Field } from "../../components/Field";
import { cn } from "../../helpers/cn";
import { submitContactForm } from "../../services/api/contact.service";
import { buildPaymentsInquiry } from "./paymentsLeadPayload";

const FLOW_SEGMENTS = ["serviceExporters", "productExporters", "platforms"] as const;
const PROCESS_STEPS = ["kyb", "receive", "quote", "settle"] as const;
const FIT_ITEMS = ["nonCustodial", "localCoverage", "compliance", "quoteExecution"] as const;
const COMPARISON_ROWS = ["spread", "operatingCash", "vendors"] as const;
const CURRENCIES = ["EUR", "USD", "USDC", "EURC", "BRL", "MXN", "COP", "ARS"];
const LOCAL_RAILS = ["pix", "breb", "instantSepa", "argentina", "mexico"] as const;
const CURRENCY_STRIP = ["USDC", "EURC", "USD", "EUR", "BRL", "MXN", "COP", "ARS"];
const VOLUME_OPTIONS = ["under50k", "50kTo250k", "250kTo1m", "over1m"] as const;
const RECEIVE_CURRENCY_OPTIONS = ["USD", "EUR", "USDC", "EURC"];
const PAYOUT_CURRENCY_OPTIONS = ["BRL", "MXN", "COP", "ARS", "EUR"];
const USE_CASE_OPTIONS = ["serviceExporter", "productExporter", "platform", "localPayout"] as const;

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const createPaymentsLeadSchema = (t: (key: string) => string) =>
  z.object({
    companyEmail: z
      .string()
      .trim()
      .min(1, t("pages.payments.form.validation.emailRequired"))
      .regex(EMAIL_REGEX, t("pages.payments.form.validation.emailFormat")),
    companyName: z.string().trim().min(1, t("pages.payments.form.validation.companyNameRequired")),
    country: z.string().trim().min(1, t("pages.payments.form.validation.countryRequired")),
    payoutCurrency: z.string().trim().min(1, t("pages.payments.form.validation.payoutCurrencyRequired")),
    privacyPolicyAccepted: z
      .boolean()
      .refine(val => val === true, { message: t("pages.contact.validation.privacyPolicyRequired") }),
    receiveCurrency: z.string().trim().min(1, t("pages.payments.form.validation.receiveCurrencyRequired")),
    useCase: z.string().trim().min(1, t("pages.payments.form.validation.useCaseRequired")),
    volume: z.string().trim().min(1, t("pages.payments.form.validation.volumeRequired"))
  });

type PaymentsLeadFormData = z.infer<ReturnType<typeof createPaymentsLeadSchema>>;

const selectClassName =
  "select select-bordered w-full rounded-lg border-neutral-300 bg-white text-gray-800 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const inputClassName = "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

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
  const { t } = useTranslation();

  return (
    <section
      aria-labelledby="payments-hero-title"
      className="relative overflow-hidden bg-blue-950 px-4 py-16 text-white md:px-10 md:py-24 lg:py-28"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-center bg-cover opacity-90 md:bg-right"
        style={{ backgroundImage: `url(${PaymentsHeroRails})` }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(16,26,72,0.98)_0%,rgba(16,26,72,0.82)_44%,rgba(16,26,72,0.26)_78%),linear-gradient(180deg,rgba(16,26,72,0.2)_0%,rgba(16,26,72,0.94)_100%)]"
      />
      <div className="container relative mx-auto grid min-h-[720px] items-center gap-12 lg:grid-cols-[0.92fr_1.08fr]">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
          transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <p className="font-semibold text-cyan-300 text-sm uppercase tracking-[0.18em]">{t("pages.payments.hero.eyebrow")}</p>
          <h1 className="mt-5 font-bold text-h1 text-white" id="payments-hero-title" style={{ textWrap: "balance" }}>
            {t("pages.payments.hero.title")}
          </h1>
          <p className="mt-6 max-w-xl text-body-lg text-white/80">{t("pages.payments.hero.description")}</p>
          <div className="mt-8 flex">
            <a className="btn btn-vortex-primary rounded-3xl px-7" href="#payments-lead-form">
              {t("pages.payments.hero.cta")}
            </a>
          </div>
        </motion.div>

        <motion.div
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="relative"
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.96, y: 20 }}
          transition={{ delay: shouldReduceMotion ? 0 : 0.1, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <PaymentRouteCard />
        </motion.div>
      </div>
    </section>
  );
}

function PaymentRouteCard() {
  const { t } = useTranslation();

  return (
    <aside
      aria-label={t("pages.payments.routeVisual.ariaLabel")}
      className="relative mx-auto max-w-3xl overflow-hidden rounded-lg border border-white/15 bg-blue-950/75 shadow-2xl backdrop-blur-md"
    >
      <div className="grid gap-3 p-4 md:grid-cols-[1fr_auto_1fr_auto_1.2fr] md:items-center md:p-5">
        <RouteNode label={t("pages.payments.routeVisual.invoice")} value="USD / EUR" />
        <RouteArrow />
        <RouteNode highlight label={t("pages.payments.routeVisual.stablecoin")} value="USDC / EURC" />
        <RouteArrow />
        <RouteNode
          label={t("pages.payments.routeVisual.localBankPayout")}
          tags={["BRL", "COP", "MXN", "ARS"]}
          value={t("pages.payments.routeVisual.bankSettlement")}
        />
      </div>
      <RouteQuoteCard />
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
    <div
      className={cn(
        "min-h-[132px] rounded-lg border p-4",
        highlight ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/15 bg-white/10"
      )}
    >
      <p className="font-semibold text-sm text-white/60 uppercase">{label}</p>
      <p className="mt-2 font-bold text-lg text-white leading-tight">{value}</p>
      {tags && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map(tag => (
            <span
              className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 font-semibold text-white text-xs"
              key={tag}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RouteArrow() {
  return <div aria-hidden="true" className="hidden h-0.5 w-8 bg-gradient-to-r from-cyan-300 to-cyan-300/0 md:block" />;
}

function RouteQuoteCard() {
  const { t } = useTranslation();
  const rows = ["receive", "route", "settlement", "status"] as const;

  return (
    <div className="bg-white/95 p-5 text-gray-800 md:p-6">
      <p className="font-semibold text-gray-500 text-sm uppercase">{t("pages.payments.routeQuote.eyebrow")}</p>
      <h2 className="mt-1 font-bold text-2xl text-blue-950 leading-tight">{t("pages.payments.routeQuote.title")}</h2>
      <dl className="mt-5 grid gap-3">
        {rows.map(row => (
          <div className="grid gap-2 border-gray-200 border-t pt-3 sm:grid-cols-[7rem_1fr]" key={row}>
            <dt className="font-semibold text-gray-500 text-xs uppercase">{t(`pages.payments.routeQuote.rows.${row}.term`)}</dt>
            <dd className="m-0 font-semibold text-gray-800 text-sm leading-relaxed">
              {t(`pages.payments.routeQuote.rows.${row}.description`)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CurrencyStrip() {
  const { t } = useTranslation();

  return (
    <section
      aria-label={t("pages.payments.currencyStrip.ariaLabel")}
      className="border-blue-100 border-y bg-white px-4 py-6 md:px-10"
    >
      <div className="container mx-auto flex flex-wrap justify-center gap-3">
        {CURRENCY_STRIP.map(currency => (
          <span className="rounded-full bg-gray-50 px-4 py-2 font-semibold text-blue-950 text-sm shadow-sm" key={currency}>
            {currency}
          </span>
        ))}
      </div>
    </section>
  );
}

function BusinessFlowsSection() {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="payments-flows-title" className="container mx-auto px-4 py-20 md:px-10 lg:py-28">
      <SectionHeading
        eyebrow={t("pages.payments.flows.eyebrow")}
        id="payments-flows-title"
        title={t("pages.payments.flows.title")}
      />
      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {FLOW_SEGMENTS.map(item => (
          <article className="rounded-lg border border-gray-100 bg-white p-6 shadow-card" key={item}>
            <div
              aria-hidden="true"
              className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-primary"
            >
              <span className="h-5 w-5 rounded-full border-4 border-current" />
            </div>
            <h3 className="font-bold text-blue-950 text-h3">{t(`pages.payments.flows.items.${item}.title`)}</h3>
            <p className="mt-3 text-body text-gray-600">{t(`pages.payments.flows.items.${item}.body`)}</p>
            <p className="mt-5 font-semibold text-gray-800 text-sm">{t(`pages.payments.flows.items.${item}.detail`)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="payments-process-title" className="bg-blue-50 px-4 py-20 md:px-10 lg:py-28">
      <div className="container mx-auto grid gap-12 lg:grid-cols-[0.78fr_1fr]">
        <div className="lg:sticky lg:top-24 lg:h-fit">
          <SectionHeading
            align="left"
            eyebrow={t("pages.payments.process.eyebrow")}
            id="payments-process-title"
            title={t("pages.payments.process.title")}
          />
          <p className="mt-5 max-w-xl text-body-lg text-gray-600">{t("pages.payments.process.description")}</p>
        </div>
        <ol className="space-y-5">
          {PROCESS_STEPS.map((step, index) => (
            <li className="grid gap-4 rounded-lg bg-white p-6 shadow-card md:grid-cols-[auto_1fr]" key={step}>
              <span className="font-bold text-h3 text-primary">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="font-bold text-blue-950 text-h3">{t(`pages.payments.process.steps.${step}.title`)}</h3>
                <p className="mt-2 text-body text-gray-600">{t(`pages.payments.process.steps.${step}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function WhereVortexFitsSection() {
  const { t } = useTranslation();

  return (
    <section
      aria-labelledby="payments-fit-title"
      className="bg-[radial-gradient(circle_at_82%_36%,rgba(57,213,255,0.14),transparent_26%)] bg-blue-950 px-4 py-20 text-white md:px-10 lg:py-28"
    >
      <div className="container mx-auto">
        <SectionHeading
          eyebrow={t("pages.payments.fit.eyebrow")}
          id="payments-fit-title"
          title={t("pages.payments.fit.title")}
          variant="dark"
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {FIT_ITEMS.map(item => (
            <article className="rounded-lg border border-white/10 bg-white/5 p-6" key={item}>
              <h3 className="font-bold text-h3 text-white">{t(`pages.payments.fit.items.${item}.title`)}</h3>
              <p className="mt-3 text-blue-100 text-body">{t(`pages.payments.fit.items.${item}.body`)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function RoutesSection() {
  const { t } = useTranslation();

  return (
    <section
      aria-labelledby="payments-routes-title"
      className="container mx-auto grid gap-12 px-4 py-20 md:px-10 lg:grid-cols-2 lg:py-28"
    >
      <div>
        <SectionHeading
          align="left"
          eyebrow={t("pages.payments.routes.eyebrow")}
          id="payments-routes-title"
          title={t("pages.payments.routes.title")}
        />
        <p className="mt-5 text-body-lg text-gray-600">{t("pages.payments.routes.description")}</p>
        <ChipSet items={CURRENCIES} label={t("pages.payments.routes.currencyRoutes")} />
        <ChipSet
          items={LOCAL_RAILS.map(item => t(`pages.payments.routes.localRails.${item}`))}
          label={t("pages.payments.routes.localPayoutRails")}
          muted
        />
      </div>
      <div className="rounded-lg border border-gray-100 bg-white p-5 shadow-card">
        <div className="rounded-lg bg-blue-950 p-4 text-white">
          <p className="font-semibold text-blue-200 text-sm">{t("pages.payments.routes.preview.eyebrow")}</p>
          <h3 className="mt-1 font-bold text-h3">{t("pages.payments.routes.preview.title")}</h3>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <AmountCard
            detail={t("pages.payments.routes.preview.fromDetail")}
            label={t("pages.payments.routes.preview.from")}
            value="10,000 USDT"
          />
          <div
            aria-hidden="true"
            className="mx-auto h-10 w-10 rounded-full bg-primary/10 text-center font-bold text-primary leading-10"
          >
            →
          </div>
          <AmountCard
            detail={t("pages.payments.routes.preview.toDetail")}
            label={t("pages.payments.routes.preview.to")}
            value={t("pages.payments.routes.preview.toValue")}
          />
        </div>
        <ol className="mt-5 grid gap-3">
          {(["kyb", "quote", "settlement"] as const).map((item, index) => (
            <li className="flex items-center gap-3 rounded-lg bg-blue-50 p-3 text-gray-700" key={item}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-sm text-white">
                {index + 1}
              </span>
              {t(`pages.payments.routes.preview.steps.${item}`)}
            </li>
          ))}
        </ol>
        <p className="mt-5 text-gray-500 text-sm">{t("pages.payments.routes.preview.disclaimer")}</p>
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
  const { t } = useTranslation();

  return (
    <section aria-labelledby="payments-finance-title" className="bg-blue-50 px-4 py-20 md:px-10 lg:py-28">
      <div className="container mx-auto">
        <SectionHeading
          eyebrow={t("pages.payments.finance.eyebrow")}
          id="payments-finance-title"
          title={t("pages.payments.finance.title")}
        />
        <div className="mt-12 overflow-hidden rounded-lg bg-white shadow-card">
          <div className="grid bg-blue-950 px-5 py-4 font-semibold text-white md:grid-cols-3">
            <span>{t("pages.payments.finance.headers.question")}</span>
            <span className="hidden md:block">{t("pages.payments.finance.headers.traditional")}</span>
            <span className="hidden md:block">{t("pages.payments.finance.headers.vortex")}</span>
          </div>
          {COMPARISON_ROWS.map(row => (
            <div className="grid gap-3 border-gray-100 border-t px-5 py-5 md:grid-cols-3" key={row}>
              <div>
                <p className="font-semibold text-blue-950">{t(`pages.payments.finance.rows.${row}.question`)}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-400 text-xs uppercase md:hidden">
                  {t("pages.payments.finance.headers.traditional")}
                </p>
                <p className="text-gray-600">{t(`pages.payments.finance.rows.${row}.traditional`)}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-400 text-xs uppercase md:hidden">
                  {t("pages.payments.finance.headers.vortex")}
                </p>
                <p className="text-gray-600">{t(`pages.payments.finance.rows.${row}.vortex`)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LeadSection() {
  const { t } = useTranslation();

  return (
    <section
      aria-labelledby="payments-lead-title"
      className="container mx-auto grid gap-10 px-4 py-20 md:px-10 lg:grid-cols-[0.8fr_1fr] lg:py-28"
      id="payments-lead-form"
    >
      <div>
        <SectionHeading
          align="left"
          eyebrow={t("pages.payments.lead.eyebrow")}
          id="payments-lead-title"
          title={t("pages.payments.lead.title")}
        />
        <p className="mt-5 text-body-lg text-gray-600">{t("pages.payments.lead.description")}</p>
        <p className="mt-6 text-gray-500 text-sm">
          {t("pages.payments.lead.preferDirectNote")}{" "}
          <Link
            className="font-semibold text-primary underline decoration-primary/30 underline-offset-2"
            to="/{-$locale}/contact"
          >
            {t("pages.payments.lead.contactTeam")}
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
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const schema = createPaymentsLeadSchema(t);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isValid, touchedFields }
  } = useForm<PaymentsLeadFormData>({
    defaultValues: {
      companyEmail: "",
      companyName: "",
      country: "",
      payoutCurrency: "",
      privacyPolicyAccepted: false,
      receiveCurrency: "",
      useCase: "",
      volume: ""
    },
    mode: "onChange",
    resolver: standardSchemaResolver(schema)
  });
  const mutation = useMutation({
    mutationFn: submitContactForm,
    onError: () => setStatus("error"),
    onSuccess: () => {
      reset();
      setStatus("success");
    }
  });

  useEffect(() => {
    if (status === "success" || status === "error") {
      const timeout = setTimeout(() => setStatus("idle"), 5000);
      return () => clearTimeout(timeout);
    }
  }, [status]);

  const onSubmit = handleSubmit(data => {
    mutation.mutate({
      email: data.companyEmail,
      fullName: data.companyName,
      inquiry: buildPaymentsInquiry(data),
      projectName: data.companyName,
      timestamp: new Date().toISOString()
    });
  });

  const disabled = mutation.isPending || isSubmitting || status === "success";

  return (
    <form className="rounded-lg bg-white p-6 shadow-card md:p-8" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          error={touchedFields.companyName ? errors.companyName?.message : undefined}
          htmlFor={`${formId}-company`}
          label={t("pages.payments.form.companyName")}
        >
          <Field
            autoComplete="organization"
            className={inputClassName}
            disabled={disabled}
            error={touchedFields.companyName && !!errors.companyName}
            id={`${formId}-company`}
            register={register("companyName")}
          />
        </FormField>
        <FormField
          error={touchedFields.companyEmail ? errors.companyEmail?.message : undefined}
          htmlFor={`${formId}-email`}
          label={t("pages.payments.form.companyEmail")}
        >
          <Field
            autoComplete="email"
            className={inputClassName}
            disabled={disabled}
            error={touchedFields.companyEmail && !!errors.companyEmail}
            id={`${formId}-email`}
            register={register("companyEmail")}
            type="email"
          />
        </FormField>
        <FormField
          error={touchedFields.volume ? errors.volume?.message : undefined}
          htmlFor={`${formId}-volume`}
          label={t("pages.payments.form.monthlyVolume")}
        >
          <select className={selectClassName} disabled={disabled} id={`${formId}-volume`} {...register("volume")}>
            <option value="">{t("pages.payments.form.selectRange")}</option>
            {VOLUME_OPTIONS.map(option => (
              <option key={option} value={t(`pages.payments.form.volumeOptions.${option}`)}>
                {t(`pages.payments.form.volumeOptions.${option}`)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          error={touchedFields.receiveCurrency ? errors.receiveCurrency?.message : undefined}
          htmlFor={`${formId}-receive`}
          label={t("pages.payments.form.receiveCurrency")}
        >
          <select className={selectClassName} disabled={disabled} id={`${formId}-receive`} {...register("receiveCurrency")}>
            <option value="">{t("pages.payments.form.selectCurrency")}</option>
            {RECEIVE_CURRENCY_OPTIONS.map(option => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </FormField>
        <FormField
          error={touchedFields.payoutCurrency ? errors.payoutCurrency?.message : undefined}
          htmlFor={`${formId}-payout`}
          label={t("pages.payments.form.payoutCurrency")}
        >
          <select className={selectClassName} disabled={disabled} id={`${formId}-payout`} {...register("payoutCurrency")}>
            <option value="">{t("pages.payments.form.selectCurrency")}</option>
            {PAYOUT_CURRENCY_OPTIONS.map(option => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </FormField>
        <FormField
          error={touchedFields.country ? errors.country?.message : undefined}
          htmlFor={`${formId}-country`}
          label={t("pages.payments.form.country")}
        >
          <Field
            className={inputClassName}
            disabled={disabled}
            error={touchedFields.country && !!errors.country}
            id={`${formId}-country`}
            placeholder={t("pages.payments.form.countryPlaceholder")}
            register={register("country")}
          />
        </FormField>
        <FormField
          className="md:col-span-2"
          error={touchedFields.useCase ? errors.useCase?.message : undefined}
          htmlFor={`${formId}-use-case`}
          label={t("pages.payments.form.useCase")}
        >
          <select className={selectClassName} disabled={disabled} id={`${formId}-use-case`} {...register("useCase")}>
            <option value="">{t("pages.payments.form.selectUseCase")}</option>
            {USE_CASE_OPTIONS.map(option => (
              <option key={option} value={t(`pages.payments.form.useCaseOptions.${option}`)}>
                {t(`pages.payments.form.useCaseOptions.${option}`)}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="mt-4 flex items-start gap-2">
        <input
          {...register("privacyPolicyAccepted")}
          className="checkbox checkbox-primary checkbox-sm mt-0.5"
          disabled={disabled}
          id={`${formId}-privacy`}
          type="checkbox"
        />
        <label className="text-gray-500 text-sm" htmlFor={`${formId}-privacy`}>
          {t("pages.contact.form.privacyPolicy")}{" "}
          <a
            className="text-primary underline hover:text-primary/80"
            href={`/${i18n.language}/privacy-policy`}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("pages.contact.form.privacyPolicyLink")}
          </a>
        </label>
      </div>
      {touchedFields.privacyPolicyAccepted && errors.privacyPolicyAccepted?.message && (
        <p className="mt-1 text-error text-xs">{errors.privacyPolicyAccepted.message}</p>
      )}
      <button className="btn btn-vortex-primary mt-6 w-full rounded-3xl" disabled={disabled || !isValid} type="submit">
        {mutation.isPending
          ? t("pages.payments.form.sending")
          : status === "success"
            ? t("pages.payments.form.requestSent")
            : t("pages.payments.form.submit")}
      </button>
      <AnimatePresence>
        {status === "success" && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 text-sm"
            exit={{ opacity: 0, y: -4 }}
            initial={{ opacity: 0, y: -4 }}
            role="status"
          >
            <p className="font-semibold">{t("pages.payments.form.successTitle")}</p>
            <p className="mt-1">{t("pages.payments.form.successBody")}</p>
          </motion.div>
        )}
        {status === "error" && (
          <motion.p animate={{ opacity: 1 }} className="mt-3 text-error text-sm" exit={{ opacity: 0 }} initial={{ opacity: 0 }}>
            {t("pages.payments.form.error")}
          </motion.p>
        )}
      </AnimatePresence>
      <p className="mt-4 text-gray-500 text-sm">{t("pages.payments.form.disclaimer")}</p>
    </form>
  );
}

function FormField({
  children,
  className,
  error,
  htmlFor,
  label
}: {
  children: React.ReactNode;
  className?: string;
  error?: string;
  htmlFor: string;
  label: string;
}) {
  return (
    <label className={cn("block", className)} htmlFor={htmlFor}>
      <span className="mb-1 block font-medium text-gray-600 text-xs">{label}</span>
      {children}
      {error && <span className="mt-1 block text-error text-xs">{error}</span>}
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
  id,
  title,
  variant = "light"
}: {
  align?: "center" | "left";
  eyebrow: string;
  id: string;
  title: string;
  variant?: "dark" | "light";
}) {
  const isDark = variant === "dark";

  return (
    <div className={cn(align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-2xl")}>
      <p className="font-semibold text-primary text-sm uppercase tracking-[0.18em]">{eyebrow}</p>
      <h2
        className={cn("mt-3 font-bold text-4xl leading-tight md:text-5xl", isDark ? "text-white" : "text-blue-950")}
        id={id}
        style={{ textWrap: "balance" }}
      >
        {title}
      </h2>
    </div>
  );
}
