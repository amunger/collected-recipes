import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  silentRecipeLogger,
  type RecipeLogger,
} from "@/lib/recipe-logger";

const DEFAULT_MAX_PAGE_BYTES = 2_000_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export class InvalidRecipeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRecipeUrlError";
  }
}

export class RecipePageFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipePageFetchError";
  }
}

export interface RecipePage {
  readonly url: string;
  readonly text: string;
}

interface LookupAddress {
  readonly address: string;
}

export interface RecipePageLoaderOptions {
  readonly fetchImplementation?: typeof fetch;
  readonly lookupHostname?: (
    hostname: string,
  ) => Promise<ReadonlyArray<LookupAddress>>;
  readonly logger?: RecipeLogger;
  readonly maxPageBytes?: number;
  readonly maxRedirects?: number;
  readonly timeoutMs?: number;
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const [first, second] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

export function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");

  if (isIP(normalized) === 4) {
    return isPrivateIpv4(normalized);
  }

  if (isIP(normalized) === 6) {
    if (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized)
    ) {
      return true;
    }

    const ipv4MappedAddress = normalized.match(
      /::ffff:(\d+\.\d+\.\d+\.\d+)$/,
    );
    return ipv4MappedAddress
      ? isPrivateIpv4(ipv4MappedAddress[1])
      : false;
  }

  return false;
}

async function defaultLookupHostname(
  hostname: string,
): Promise<ReadonlyArray<LookupAddress>> {
  return lookup(hostname, { all: true, verbatim: true });
}

export async function validatePublicRecipeUrl(
  value: string,
  options: Pick<RecipePageLoaderOptions, "logger" | "lookupHostname"> = {},
): Promise<URL> {
  const logger = options.logger ?? silentRecipeLogger;
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    logger.info("url.validation.rejected", { reason: "malformed" });
    throw new InvalidRecipeUrlError("Enter a complete, valid recipe URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    logger.info("url.validation.rejected", { reason: "unsupported_protocol" });
    throw new InvalidRecipeUrlError("Only HTTP and HTTPS URLs are supported.");
  }

  if (url.username || url.password) {
    logger.info("url.validation.rejected", { reason: "credentials" });
    throw new InvalidRecipeUrlError(
      "URLs containing credentials are not supported.",
    );
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    isPrivateIp(hostname)
  ) {
    logger.info("url.validation.rejected", { reason: "private_hostname" });
    throw new InvalidRecipeUrlError(
      "Local and private URLs are not supported.",
    );
  }

  let addresses: ReadonlyArray<LookupAddress>;
  try {
    addresses = await (
      options.lookupHostname ?? defaultLookupHostname
    )(hostname);
  } catch (error: unknown) {
    logger.error("url.dns.failed", error, { hostname });
    throw new InvalidRecipeUrlError("The recipe website could not be found.");
  }

  logger.info("url.dns.resolved", {
    hostname,
    addressCount: addresses.length,
  });

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateIp(address))
  ) {
    logger.info("url.validation.rejected", {
      reason: "private_dns_result",
      hostname,
    });
    throw new InvalidRecipeUrlError(
      "Local and private URLs are not supported.",
    );
  }

  logger.info("url.validation.accepted", {
    hostname,
    protocol: url.protocol,
  });
  return url;
}

export async function fetchRecipePage(
  value: string,
  options: RecipePageLoaderOptions = {},
): Promise<RecipePage> {
  const logger = options.logger ?? silentRecipeLogger;
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const maxPageBytes = options.maxPageBytes ?? DEFAULT_MAX_PAGE_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const validationOptions = {
    logger,
    lookupHostname: options.lookupHostname,
  };
  let currentUrl = await validatePublicRecipeUrl(value, validationOptions);

  for (
    let redirectCount = 0;
    redirectCount <= maxRedirects;
    redirectCount += 1
  ) {
    const fetchStartedAt = performance.now();
    let response: Response;

    try {
      response = await fetchImplementation(currentUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
          "User-Agent": "CollectedRecipes/0.1",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error: unknown) {
      logger.error("page.fetch.failed", error, {
        hostname: currentUrl.hostname,
        durationMs: Math.round(performance.now() - fetchStartedAt),
      });
      const detail = error instanceof Error ? `: ${error.message}` : "";
      throw new RecipePageFetchError(
        `The recipe page could not be loaded${detail}`,
      );
    }

    logger.info("page.fetch.response", {
      hostname: currentUrl.hostname,
      status: response.status,
      redirectCount,
      durationMs: Math.round(performance.now() - fetchStartedAt),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirectCount === maxRedirects) {
        throw new RecipePageFetchError(
          "The recipe page redirected too many times.",
        );
      }
      currentUrl = await validatePublicRecipeUrl(
        new URL(location, currentUrl).toString(),
        validationOptions,
      );
      continue;
    }

    if (!response.ok) {
      throw new RecipePageFetchError(
        `The recipe website returned HTTP ${response.status}.`,
      );
    }

    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml") &&
      !contentType.includes("text/plain")
    ) {
      throw new RecipePageFetchError(
        "The URL did not return a readable web page.",
      );
    }

    const contentLength = Number(
      response.headers.get("content-length") ?? 0,
    );
    if (contentLength > maxPageBytes) {
      throw new RecipePageFetchError(
        "The recipe page is too large to process.",
      );
    }

    if (!response.body) {
      throw new RecipePageFetchError(
        "The recipe page returned no content.",
      );
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += chunk.byteLength;
      if (totalBytes > maxPageBytes) {
        await reader.cancel();
        throw new RecipePageFetchError(
          "The recipe page is too large to process.",
        );
      }
      chunks.push(chunk);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    logger.info("page.fetch.completed", {
      hostname: currentUrl.hostname,
      contentType,
      byteCount: totalBytes,
    });

    return {
      url: currentUrl.toString(),
      text: new TextDecoder().decode(bytes),
    };
  }

  throw new RecipePageFetchError("The recipe page could not be loaded.");
}
