/// <reference types="vite/client" />
import type { InferredState } from '../main/types';
import type { StationState, ApplyPlan } from '../main/station/types';

declare global {
  interface Window {
    station: {
      getState: () => Promise<InferredState>;
      loadDesired: () => Promise<StationState>;
      assign: (projectPath: string, mcpId: string) => Promise<StationState>;
      unassign: (projectPath: string, mcpId: string) => Promise<StationState>;
      plan: (projectPaths: string[]) => Promise<ApplyPlan>;
      apply: (projectPaths: string[]) => Promise<StationState>;
    };
  }
}
export {};
