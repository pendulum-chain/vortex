import { TenantName } from '../../models/Tenant';

export type AppConfig = {
  tenants: TenantName[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} & Partial<Record<TenantName, any>>;
