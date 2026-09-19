import {
  type MoneriumAddress,
  MoneriumApiError,
  MoneriumApiService,
  type MoneriumChain,
  type MoneriumIban,
  type MoneriumProfile
} from "@vortexfi/shared";

/**
 * Fake Monerium white-label app. Profiles, linked addresses, and IBANs live in
 * memory; the active EUR onramp only reads them (registration resolves exactly
 * one IBAN/address pair), while the wallet-link routes add or move them.
 */
export class FakeMonerium {
  readonly profiles = new Map<string, MoneriumProfile>();
  readonly addresses: MoneriumAddress[] = [];
  readonly ibans: MoneriumIban[] = [];
  /** Profile ids the white-label app cannot see (answered with 404 like an OAuth-only profile). */
  readonly invisibleProfiles = new Set<string>();

  /** Registers an approved profile whose IBAN already points to `address` on `chain`. */
  provisionApprovedProfile(profileId: string, address: string, chain: MoneriumChain, iban = "DE89370400440532013000"): void {
    this.profiles.set(profileId, {
      details: { state: "approved" },
      form: { state: "approved" },
      id: profileId,
      kind: "personal",
      name: "Ada Example",
      state: "approved",
      verifications: []
    });
    this.addresses.push({ address, chains: [chain], profile: profileId });
    this.ibans.push({ address, bic: "DEUTDEFF", chain, iban, name: "Monerium EMI", profile: profileId });
  }

  private matches(
    entryProfile: string,
    entryChain: MoneriumChain | MoneriumChain[],
    filters: { chain?: MoneriumChain; profile?: string }
  ) {
    const chains = Array.isArray(entryChain) ? entryChain : [entryChain];
    return (!filters.profile || entryProfile === filters.profile) && (!filters.chain || chains.includes(filters.chain));
  }

  async getProfile(profileId: string): Promise<MoneriumProfile> {
    const profile = this.profiles.get(profileId);
    if (!profile || this.invisibleProfiles.has(profileId)) {
      throw new MoneriumApiError({ endpoint: "/profiles/:profile", method: "GET", status: 404 });
    }
    return profile;
  }

  async listAddresses(filters: { chain?: MoneriumChain; profile?: string } = {}) {
    return { addresses: this.addresses.filter(entry => this.matches(entry.profile, entry.chains, filters)) };
  }

  async listIbans(filters: { chain?: MoneriumChain; profile?: string } = {}) {
    return { ibans: this.ibans.filter(entry => this.matches(entry.profile, entry.chain, filters)) };
  }

  async linkAddress(request: { address: string; chain: MoneriumChain; profile: string }) {
    this.addresses.push({ address: request.address, chains: [request.chain], profile: request.profile });
    return { httpStatus: 201 as const };
  }

  async requestIban(request: { address: string; chain: MoneriumChain }) {
    const owner = this.addresses.find(entry => entry.address.toLowerCase() === request.address.toLowerCase());
    if (!owner) throw new MoneriumApiError({ endpoint: "/ibans", method: "POST", status: 400 });
    this.ibans.push({
      address: request.address,
      bic: "DEUTDEFF",
      chain: request.chain,
      iban: `DE${String(this.ibans.length + 1).padStart(20, "0")}`,
      name: "Monerium EMI",
      profile: owner.profile
    });
    return { httpStatus: 202 as const };
  }

  async updateIbanDestination(iban: string, request: { address: string; chain: MoneriumChain }): Promise<void> {
    const entry = this.ibans.find(candidate => candidate.iban === iban);
    if (!entry) throw new MoneriumApiError({ endpoint: "/ibans/:iban", method: "PATCH", status: 404 });
    entry.address = request.address;
    entry.chain = request.chain;
  }

  asService(): MoneriumApiService {
    return new Proxy(this, {
      get: (obj, prop) => {
        if (prop in obj) return (obj as Record<string | symbol, unknown>)[prop];
        if (prop === "then") return undefined;
        throw new Error(`FakeMonerium.${String(prop)} is not implemented — extend src/test-utils/fake-world/fake-monerium.ts.`);
      }
    }) as unknown as MoneriumApiService;
  }
}

export function installFakeMonerium(): { fakeMonerium: FakeMonerium; restore: () => void } {
  const original = MoneriumApiService.getInstance;
  const fakeMonerium = new FakeMonerium();
  MoneriumApiService.getInstance = () => fakeMonerium.asService();
  return {
    fakeMonerium,
    restore: () => {
      MoneriumApiService.getInstance = original;
    }
  };
}
