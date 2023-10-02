import { TenantName } from './Tenant';

export const enum ThemeName {
  Amplitude = TenantName.Amplitude,
  Pendulum = TenantName.Pendulum,
}

export const tenantTheme: Record<ThemeName, 'light' | 'dark'> = {
  [ThemeName.Amplitude]: 'dark',
  [ThemeName.Pendulum]: 'light',
};
