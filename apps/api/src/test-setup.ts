import { mock } from 'bun:test';

mock.module('../index', () => ({
  default: {},
  eventPoller: {
    start: () => {
      console.log('start');
    },
    stop: () => {
      console.log('stop');
    },
  },
  initializeApp: () => {
    console.log('initializeApp');
  },
}));
