import { describe, expect, test, vi } from "vitest";
import {
  fetchRecipePage,
  InvalidRecipeUrlError,
  isPrivateIp,
  RecipePageFetchError,
  validatePublicRecipeUrl,
} from "@/lib/recipe-page";

const publicLookup = async () => [{ address: "93.184.216.34" }];

describe("isPrivateIp", () => {
  test.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.1.2",
    "::1",
    "fd00::1",
    "::ffff:127.0.0.1",
  ])("recognizes private address %s", (address) => {
    expect(isPrivateIp(address)).toBe(true);
  });

  test.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"])(
    "allows public address %s",
    (address) => {
      expect(isPrivateIp(address)).toBe(false);
    },
  );
});

describe("validatePublicRecipeUrl", () => {
  test("accepts an HTTP public host resolved by DNS", async () => {
    await expect(
      validatePublicRecipeUrl("https://example.com/recipe", {
        lookupHostname: publicLookup,
      }),
    ).resolves.toEqual(new URL("https://example.com/recipe"));
  });

  test.each([
    ["not a URL", "complete, valid"],
    ["ftp://example.com/recipe", "Only HTTP and HTTPS"],
    ["https://user:pass@example.com", "credentials"],
    ["http://localhost/recipe", "Local and private"],
    ["http://127.0.0.1/recipe", "Local and private"],
  ])("rejects %s", async (value, message) => {
    await expect(
      validatePublicRecipeUrl(value, { lookupHostname: publicLookup }),
    ).rejects.toThrow(message);
  });

  test("rejects private DNS results", async () => {
    await expect(
      validatePublicRecipeUrl("https://example.com", {
        lookupHostname: async () => [{ address: "10.0.0.2" }],
      }),
    ).rejects.toBeInstanceOf(InvalidRecipeUrlError);
  });

  test("reports DNS lookup failures as invalid URLs", async () => {
    await expect(
      validatePublicRecipeUrl("https://missing.example", {
        lookupHostname: async () => {
          throw new Error("ENOTFOUND");
        },
      }),
    ).rejects.toThrow("could not be found");
  });
});

describe("fetchRecipePage", () => {
  test("downloads a bounded HTML page", async () => {
    const fetchImplementation: typeof fetch = vi.fn(async () => {
      return new Response("<html>recipe</html>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });

    await expect(
      fetchRecipePage("https://example.com/recipe", {
        fetchImplementation,
        lookupHostname: publicLookup,
      }),
    ).resolves.toEqual({
      url: "https://example.com/recipe",
      text: "<html>recipe</html>",
    });
  });

  test("validates every redirect target", async () => {
    const fetchImplementation: typeof fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
        }),
      );

    await expect(
      fetchRecipePage("https://example.com/recipe", {
        fetchImplementation,
        lookupHostname: publicLookup,
      }),
    ).rejects.toBeInstanceOf(InvalidRecipeUrlError);
  });

  test("rejects unreadable content types", async () => {
    const fetchImplementation: typeof fetch = vi.fn(async () => {
      return new Response("binary", {
        headers: { "content-type": "application/octet-stream" },
      });
    });

    await expect(
      fetchRecipePage("https://example.com/recipe", {
        fetchImplementation,
        lookupHostname: publicLookup,
      }),
    ).rejects.toThrow("readable web page");
  });

  test("rejects declared and streamed oversized pages", async () => {
    const declaredLargeFetch: typeof fetch = vi.fn(async () => {
      return new Response("small", {
        headers: {
          "content-type": "text/html",
          "content-length": "100",
        },
      });
    });
    const streamedLargeFetch: typeof fetch = vi.fn(async () => {
      return new Response("six bytes", {
        headers: { "content-type": "text/html" },
      });
    });

    await expect(
      fetchRecipePage("https://example.com", {
        fetchImplementation: declaredLargeFetch,
        lookupHostname: publicLookup,
        maxPageBytes: 10,
      }),
    ).rejects.toBeInstanceOf(RecipePageFetchError);
    await expect(
      fetchRecipePage("https://example.com", {
        fetchImplementation: streamedLargeFetch,
        lookupHostname: publicLookup,
        maxPageBytes: 5,
      }),
    ).rejects.toThrow("too large");
  });

  test("adds network failure details", async () => {
    const fetchImplementation: typeof fetch = vi.fn(async () => {
      throw new Error("connection reset");
    });

    await expect(
      fetchRecipePage("https://example.com", {
        fetchImplementation,
        lookupHostname: publicLookup,
      }),
    ).rejects.toThrow("connection reset");
  });
});
