import type { CircleApi } from "../shared/api";

declare global {
  interface Window {
    circle: CircleApi;
  }
}

export {};
