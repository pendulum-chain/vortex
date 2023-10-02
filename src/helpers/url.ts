import { TenantName } from '../models/Tenant';

export function buildTenantPath(current: TenantName | undefined, next: TenantName, location: string) {
  return current ? location.replace(current, next) : location;
}
