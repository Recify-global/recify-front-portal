import "@testing-library/jest-dom";
import { beforeEach } from "vitest";
import { resetClientSession } from "@/auth/storage";
import { markAuthSessionActive } from "@/auth/session-cleanup";

beforeEach(() => {
  resetClientSession();
  markAuthSessionActive();
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
