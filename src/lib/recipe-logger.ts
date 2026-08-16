export type RecipeLogDetails = Readonly<
  Record<string, boolean | number | string | null | undefined>
>;

export interface RecipeLogger {
  info(event: string, details?: RecipeLogDetails): void;
  error(event: string, error: unknown, details?: RecipeLogDetails): void;
}

function errorDetails(error: unknown): RecipeLogDetails {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    };
  }

  return { errorMessage: String(error) };
}

export function createRecipeLogger(requestId: string): RecipeLogger {
  return {
    info(event, details = {}) {
      console.info(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "info",
          requestId,
          event,
          ...details,
        }),
      );
    },
    error(event, error, details = {}) {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "error",
          requestId,
          event,
          ...details,
          ...errorDetails(error),
        }),
      );
    },
  };
}

export const silentRecipeLogger: RecipeLogger = {
  info() {},
  error() {},
};
