import { describe, expect, it } from "vitest";

import { participantColor } from "./participant-color";

describe("participantColor", () => {
  it("keeps a user's default avatar color stable", () => {
    expect(participantColor("user-123")).toBe(participantColor("user-123"));
  });

  it("gives the seeded users visibly different default colors", () => {
    const users = [
      "seek-dev-owner",
      "seek-dev-admin",
      "seek-dev-platform-editor",
      "seek-dev-algorithm-editor",
      "seek-dev-commenter",
      "seek-dev-viewer",
      "seek-dev-guest",
    ];

    expect(new Set(users.map(participantColor)).size).toBe(users.length);
  });
});
