import type { PmApi } from "../shared/api";

declare global {
  interface Window {
    pm: PmApi;
  }
}

export {};
