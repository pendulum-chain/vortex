import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { ApiClientEventsFilters, fetchApiClientEvents } from "./api/apiClientEvents";
import { cn } from "./helpers/cn";

const tokenStorageKey = "vortex-dashboard-metrics-token";

const defaultFilters: ApiClientEventsFilters = {
  limit: 50,
  offset: 0
};

const operations = [
  "auth_api_key",
  "auth_public_key",
  "auth_dual",
  "auth_ownership",
  "quote_create",
  "quote_create_best",
  "quote_get",
  "ramp_register",
  "ramp_update",
  "ramp_start",
  "ramp_status",
  "ramp_errors"
];

function readStoredToken(): string {
  return window.sessionStorage.getItem(tokenStorageKey) ?? "";
}

export function App() {
  const queryClient = useQueryClient();
  const [metricsToken, setMetricsToken] = useState(readStoredToken);
  const [tokenDraft, setTokenDraft] = useState(metricsToken);
  const [filters, setFilters] = useState<ApiClientEventsFilters>(defaultFilters);

  const eventsQuery = useQuery({
    enabled: metricsToken.length > 0,
    queryFn: () => fetchApiClientEvents(filters, metricsToken),
    queryKey: ["api-client-events", filters, metricsToken]
  });

  const failureRate = useMemo(() => {
    const summary = eventsQuery.data?.summary;
    if (!summary || summary.sampleSize === 0) return "0.0%";

    const failures = summary.byStatus.failure ?? 0;
    return `${((failures / summary.sampleSize) * 100).toFixed(1)}%`;
  }, [eventsQuery.data]);

  function handleTokenSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedToken = tokenDraft.trim();
    window.sessionStorage.setItem(tokenStorageKey, trimmedToken);
    setMetricsToken(trimmedToken);
  }

  function handleFiltersSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFilters({
      apiKeyPrefix: stringValue(formData, "apiKeyPrefix"),
      endDate: stringValue(formData, "endDate"),
      errorType: stringValue(formData, "errorType"),
      limit: numberValue(formData, "limit", 50),
      offset: 0,
      operation: stringValue(formData, "operation"),
      partnerName: stringValue(formData, "partnerName"),
      quoteId: stringValue(formData, "quoteId"),
      rampId: stringValue(formData, "rampId"),
      requestId: stringValue(formData, "requestId"),
      startDate: stringValue(formData, "startDate"),
      status: stringValue(formData, "status")
    });
  }

  function handleClearToken() {
    window.sessionStorage.removeItem(tokenStorageKey);
    setMetricsToken("");
    setTokenDraft("");
  }

  function movePage(direction: -1 | 1) {
    setFilters(currentFilters => ({
      ...currentFilters,
      offset: Math.max(0, currentFilters.offset + direction * currentFilters.limit)
    }));
  }

  return (
    <main className="dashboard-shell px-6 py-8 text-emerald-50 lg:px-10">
      <section className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-4 border-emerald-400/20 border-b pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 font-mono text-emerald-300 text-xs uppercase tracking-[0.35em]">Internal observability</p>
            <h1 className="font-semibold text-4xl tracking-tight">API client events</h1>
            <p className="mt-3 max-w-2xl text-emerald-100/70">
              Sanitized partner API activity, protected by a dedicated metrics dashboard bearer token. Tokens are kept in
              session storage only.
            </p>
          </div>
          <form className="flex w-full flex-col gap-3 md:w-[28rem]" onSubmit={handleTokenSubmit}>
            <label className="font-mono text-emerald-200/80 text-xs uppercase tracking-[0.24em]" htmlFor="metrics-token">
              Metrics dashboard token
            </label>
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-emerald-300/20 bg-black/30 px-3 py-2 text-sm outline-none ring-emerald-300/40 transition focus:ring-2"
                id="metrics-token"
                onChange={event => setTokenDraft(event.target.value)}
                placeholder="Bearer token value"
                type="password"
                value={tokenDraft}
              />
              <button
                className="rounded-lg bg-emerald-300 px-4 py-2 font-medium text-emerald-950 text-sm shadow-emerald-300/10 shadow-sm hover:bg-emerald-200 hover:shadow-emerald-300/20 hover:shadow-md active:bg-emerald-100"
                type="submit"
              >
                Unlock
              </button>
              <button
                className="rounded-lg border border-emerald-300/20 px-3 py-2 text-emerald-100/80 text-sm hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-50 active:bg-emerald-300/15"
                onClick={handleClearToken}
                type="button"
              >
                Clear
              </button>
            </div>
          </form>
        </header>

        <form
          className="grid gap-3 rounded-2xl border border-emerald-400/15 bg-black/20 p-4 md:grid-cols-4"
          onSubmit={handleFiltersSubmit}
        >
          <FilterInput name="partnerName" placeholder="Partner" />
          <FilterSelect name="status" options={["success", "failure"]} placeholder="Any status" />
          <FilterSelect name="operation" options={operations} placeholder="Any operation" />
          <FilterInput name="errorType" placeholder="Error type" />
          <FilterInput name="apiKeyPrefix" placeholder="API key prefix" />
          <FilterInput name="requestId" placeholder="Request ID" />
          <FilterInput name="quoteId" placeholder="Quote ID" />
          <FilterInput name="rampId" placeholder="Ramp ID" />
          <FilterInput name="startDate" type="datetime-local" />
          <FilterInput name="endDate" type="datetime-local" />
          <FilterSelect name="limit" options={["25", "50", "100", "200"]} placeholder="50 rows" />
          <button
            className="rounded-lg bg-emerald-300 px-4 py-2 font-semibold text-emerald-950 text-sm shadow-emerald-300/10 shadow-sm hover:bg-emerald-200 hover:shadow-emerald-300/20 hover:shadow-md active:bg-emerald-100"
            type="submit"
          >
            Apply filters
          </button>
        </form>

        <section className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Total matching rows" value={eventsQuery.data?.summary.total ?? 0} />
          <MetricCard label="Summary sample" value={eventsQuery.data?.summary.sampleSize ?? 0} />
          <MetricCard label="Failures in sample" value={eventsQuery.data?.summary.byStatus.failure ?? 0} />
          <MetricCard label="Failure rate" value={failureRate} />
        </section>

        <section className="overflow-hidden rounded-2xl border border-emerald-400/15 bg-black/25">
          <div className="flex flex-col gap-3 border-emerald-400/15 border-b p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-semibold text-lg">Recent events</h2>
              <p className="text-emerald-100/60 text-sm">
                Showing {eventsQuery.data?.events.length ?? 0} rows from offset {filters.offset}.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-lg border border-emerald-300/20 px-3 py-2 text-sm hover:border-emerald-300/40 hover:bg-emerald-300/10 active:bg-emerald-300/15 disabled:opacity-40"
                disabled={filters.offset === 0}
                onClick={() => movePage(-1)}
                type="button"
              >
                Previous
              </button>
              <button
                className="rounded-lg border border-emerald-300/20 px-3 py-2 text-sm hover:border-emerald-300/40 hover:bg-emerald-300/10 active:bg-emerald-300/15 disabled:opacity-40"
                disabled={!eventsQuery.data || filters.offset + filters.limit >= eventsQuery.data.total}
                onClick={() => movePage(1)}
                type="button"
              >
                Next
              </button>
              <button
                className="rounded-lg bg-emerald-300/10 px-3 py-2 text-emerald-100 text-sm hover:bg-emerald-300/20 active:bg-emerald-300/25"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["api-client-events"] })}
                type="button"
              >
                Refresh
              </button>
            </div>
          </div>

          {eventsQuery.isError ? <ErrorState message={eventsQuery.error.message} /> : null}
          {eventsQuery.isLoading ? <EmptyState message="Loading event data…" /> : null}
          {!metricsToken ? <EmptyState message="Enter the metrics dashboard token to load protected dashboard data." /> : null}
          {eventsQuery.data ? <EventsTable events={eventsQuery.data.events} /> : null}
        </section>
      </section>
    </main>
  );
}

function stringValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function numberValue(formData: FormData, key: string, fallback: number): number {
  const value = stringValue(formData, key);
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function FilterInput({ name, placeholder, type = "text" }: { name: string; placeholder?: string; type?: string }) {
  return (
    <input
      className="rounded-lg border border-emerald-300/15 bg-black/30 px-3 py-2 text-sm outline-none ring-emerald-300/40 transition placeholder:text-emerald-100/35 focus:ring-2"
      name={name}
      placeholder={placeholder}
      type={type}
    />
  );
}

function FilterSelect({ name, options, placeholder }: { name: string; options: string[]; placeholder: string }) {
  return (
    <select
      className="rounded-lg border border-emerald-300/15 bg-black/30 px-3 py-2 text-sm outline-none ring-emerald-300/40 transition focus:ring-2"
      name={name}
    >
      <option value="">{placeholder}</option>
      {options.map(option => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-emerald-400/15 bg-black/25 p-5">
      <p className="font-mono text-emerald-200/60 text-xs uppercase tracking-[0.24em]">{label}</p>
      <p className="mt-3 font-semibold text-3xl">{value}</p>
    </div>
  );
}

function EventsTable({ events }: { events: Awaited<ReturnType<typeof fetchApiClientEvents>>["events"] }) {
  if (events.length === 0) {
    return <EmptyState message="No events matched the selected filters." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-emerald-950/40 text-emerald-100/60">
          <tr>
            <HeaderCell>Created</HeaderCell>
            <HeaderCell>Status</HeaderCell>
            <HeaderCell>Operation</HeaderCell>
            <HeaderCell>Partner</HeaderCell>
            <HeaderCell>HTTP</HeaderCell>
            <HeaderCell>Error</HeaderCell>
            <HeaderCell>Duration</HeaderCell>
            <HeaderCell>Ramp / Quote</HeaderCell>
          </tr>
        </thead>
        <tbody>
          {events.map(event => (
            <tr className="border-emerald-400/10 border-t" key={event.id}>
              <BodyCell>{new Date(event.createdAt).toLocaleString()}</BodyCell>
              <BodyCell>
                <span
                  className={cn(
                    "rounded-full px-2 py-1 font-medium text-xs",
                    event.status === "success" ? "bg-emerald-300/15 text-emerald-200" : "bg-red-400/15 text-red-200"
                  )}
                >
                  {event.status}
                </span>
              </BodyCell>
              <BodyCell>{event.operation}</BodyCell>
              <BodyCell>{event.partnerName ?? "—"}</BodyCell>
              <BodyCell>{event.httpStatus ?? "—"}</BodyCell>
              <BodyCell>
                <div>{event.errorType ?? "—"}</div>
                {event.errorMessage ? <div className="mt-1 max-w-xs text-emerald-100/45">{event.errorMessage}</div> : null}
              </BodyCell>
              <BodyCell>{event.durationMs ? `${event.durationMs}ms` : "—"}</BodyCell>
              <BodyCell>
                <div>{event.rampId ?? "—"}</div>
                <div className="mt-1 text-emerald-100/45">{event.quoteId ?? "—"}</div>
              </BodyCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeaderCell({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 font-mono font-normal text-xs uppercase tracking-[0.18em]">{children}</th>;
}

function BodyCell({ children }: { children: ReactNode }) {
  return <td className="px-4 py-3 align-top text-emerald-50/85">{children}</td>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="p-8 text-center text-emerald-100/60">{message}</div>;
}

function ErrorState({ message }: { message: string }) {
  return <div className="border-red-300/20 border-b bg-red-950/30 p-4 text-red-100 text-sm">{message}</div>;
}
