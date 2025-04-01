// @ts-ignore - Bun types are installed globally
import { mock } from 'bun:test';

// Mock the index.ts file to prevent app initialization during tests
mock.module('../index', () => ({
  default: {},
  eventPoller: { start: () => {}, stop: () => {} },
  initializeApp: () => {},
}));
