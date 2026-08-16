import { afterEach, describe, expect, test, vi } from "vitest";
import { createRecipeLogger } from "@/lib/recipe-logger";

describe("createRecipeLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("emits structured request-correlated stage logs", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const logger = createRecipeLogger("request-123");

    logger.info("page.fetch.completed", { byteCount: 42 });

    expect(info).toHaveBeenCalledOnce();
    expect(JSON.parse(String(info.mock.calls[0][0]))).toMatchObject({
      level: "info",
      requestId: "request-123",
      event: "page.fetch.completed",
      byteCount: 42,
    });
  });

  test("logs error identity without serializing arbitrary objects", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createRecipeLogger("request-456");

    logger.error("copilot.operation.failed", new TypeError("bad output"));

    expect(JSON.parse(String(error.mock.calls[0][0]))).toMatchObject({
      level: "error",
      requestId: "request-456",
      event: "copilot.operation.failed",
      errorName: "TypeError",
      errorMessage: "bad output",
    });
  });
});
