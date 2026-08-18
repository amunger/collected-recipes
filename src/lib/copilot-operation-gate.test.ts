import { afterEach, describe, expect, test } from "vitest";
import {
  COPILOT_BUSY_MESSAGE,
  tryAcquireCopilotOperation,
  type CopilotOperationLease,
} from "@/lib/copilot-operation-gate";

let activeLease: CopilotOperationLease | null = null;

afterEach(() => {
  activeLease?.release();
  activeLease = null;
});

describe("tryAcquireCopilotOperation", () => {
  test("rejects concurrent work instead of queuing it", () => {
    activeLease = tryAcquireCopilotOperation();

    expect(activeLease).not.toBeNull();
    expect(tryAcquireCopilotOperation()).toBeNull();
  });

  test("release is idempotent and permits the next operation", () => {
    activeLease = tryAcquireCopilotOperation();
    expect(activeLease).not.toBeNull();

    activeLease?.release();
    activeLease?.release();
    activeLease = tryAcquireCopilotOperation();

    expect(activeLease).not.toBeNull();
  });

  test("busy responses are actionable and tell clients when to retry", async () => {
    const { createCopilotBusyResponse } = await import(
      "@/lib/copilot-operation-gate"
    );
    const response = createCopilotBusyResponse("request-1");

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("5");
    await expect(response.json()).resolves.toEqual({
      error: COPILOT_BUSY_MESSAGE,
      requestId: "request-1",
    });
  });
});
