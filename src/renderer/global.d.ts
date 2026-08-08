import type { DriftfieldAPI } from '../shared/electron-api';

declare global {
  interface Window {
    driftfield: DriftfieldAPI;
  }
}

export {};

