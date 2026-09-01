import { describe, expect, it } from "vitest";

import { resolveCollaborationUrl } from "./collaboration-url";

describe("collaboration URL resolution", () => {
  it("uses the current page hostname and the configured development port", () => {
    expect(resolveCollaborationUrl({
      pageUrl: "http://192.168.1.20:3000/documents/example?source=sidebar",
      port: "1234",
    })).toBe("ws://192.168.1.20:1234/");
  });

  it("keeps localhost when the page is opened locally", () => {
    expect(resolveCollaborationUrl({
      pageUrl: "http://localhost:3000/documents/example",
      port: "1234",
    })).toBe("ws://localhost:1234/");
  });

  it("keeps 127.0.0.1 when the page is opened through 127.0.0.1", () => {
    expect(resolveCollaborationUrl({
      pageUrl: "http://127.0.0.1:3000/documents/example",
      port: "1234",
    })).toBe("ws://127.0.0.1:1234/");
  });

  it("selects wss when the page uses https", () => {
    expect(resolveCollaborationUrl({
      pageUrl: "https://seek.internal/documents/example",
      port: "1234",
    })).toBe("wss://seek.internal:1234/");
  });

  it("rewrites a legacy loopback URL for LAN clients", () => {
    expect(resolveCollaborationUrl({
      pageUrl: "http://192.168.1.20:3000/documents/example",
      explicitUrl: "ws://localhost:1234",
    })).toBe("ws://192.168.1.20:1234/");
  });

  it("rewrites a legacy localhost URL to the loopback address used by the page", () => {
    expect(resolveCollaborationUrl({
      pageUrl: "http://127.0.0.1:3000/documents/example",
      explicitUrl: "ws://localhost:1234",
    })).toBe("ws://127.0.0.1:1234/");
  });

  it("preserves an explicitly configured remote collaboration endpoint", () => {
    expect(resolveCollaborationUrl({
      pageUrl: "http://192.168.1.20:3000/documents/example",
      explicitUrl: "ws://collaboration.internal:4321/socket",
    })).toBe("ws://collaboration.internal:4321/socket");
  });

  it("disables collaboration for missing or invalid configuration", () => {
    expect(resolveCollaborationUrl({ pageUrl: "http://localhost:3000/documents/example" })).toBeNull();
    expect(resolveCollaborationUrl({ pageUrl: "http://localhost:3000", port: "70000" })).toBeNull();
    expect(resolveCollaborationUrl({ pageUrl: "http://localhost:3000", explicitUrl: "http://localhost:1234" })).toBeNull();
  });

});
