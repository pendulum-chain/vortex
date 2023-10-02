/* eslint-disable @typescript-eslint/no-explicit-any */
import { nablaConfig } from './nabla';
import { AppConfig } from './types';

export const apps = 'nabla';
export type Apps = typeof apps;

export const appsConfigs = {
  nabla: nablaConfig,
} satisfies Record<Apps, AppConfig>;

export type AppsConfig = typeof appsConfigs;
