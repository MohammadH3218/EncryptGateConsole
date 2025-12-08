// lib/copilotkit-runtime.ts - CopilotKit runtime adapter for existing agent system
import { CopilotRuntime, copilotRuntimeNextJSAppRouterEndpoint } from "@copilotkit/runtime";

/**
 * Create a CopilotKit runtime that uses our existing agent streaming system
 */
export const runtime = copilotRuntimeNextJSAppRouterEndpoint({
  serviceAdapter: {
    // This will be handled by our custom API route
    // We'll create a custom service adapter that uses our existing agent
  },
});

