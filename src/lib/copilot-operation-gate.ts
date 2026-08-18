export const COPILOT_BUSY_MESSAGE =
  "Another recipe operation is already running. Wait for it to finish, then try again.";
export const COPILOT_RETRY_AFTER_SECONDS = 5;

interface CopilotOperationGateState {
  active: boolean;
}

interface CopilotOperationGlobal {
  __collectedRecipesCopilotOperationGate?: CopilotOperationGateState;
}

export interface CopilotOperationLease {
  release(): void;
}

function getGateState(): CopilotOperationGateState {
  const globalState = globalThis as typeof globalThis &
    CopilotOperationGlobal;
  globalState.__collectedRecipesCopilotOperationGate ??= {
    active: false,
  };
  return globalState.__collectedRecipesCopilotOperationGate;
}

export function tryAcquireCopilotOperation(): CopilotOperationLease | null {
  const state = getGateState();
  if (state.active) {
    return null;
  }

  state.active = true;
  let released = false;
  return {
    release() {
      if (!released) {
        released = true;
        state.active = false;
      }
    },
  };
}

export function createCopilotBusyResponse(requestId: string): Response {
  return Response.json(
    { error: COPILOT_BUSY_MESSAGE, requestId },
    {
      headers: {
        "Retry-After": String(COPILOT_RETRY_AFTER_SECONDS),
      },
      status: 429,
    },
  );
}
