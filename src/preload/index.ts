import { contextBridge, ipcRenderer } from 'electron';
import type { InferredState } from '../main/types';
import type { StationState, ApplyPlan } from '../main/station/types';

contextBridge.exposeInMainWorld('station', {
  getState: (): Promise<InferredState> => ipcRenderer.invoke('station:getState'),
  loadDesired: (): Promise<StationState> => ipcRenderer.invoke('station:loadDesired'),
  assign: (p: string, id: string): Promise<StationState> => ipcRenderer.invoke('station:assign', p, id),
  unassign: (p: string, id: string): Promise<StationState> => ipcRenderer.invoke('station:unassign', p, id),
  plan: (paths: string[]): Promise<ApplyPlan> => ipcRenderer.invoke('station:plan', paths),
  apply: (paths: string[]): Promise<StationState> => ipcRenderer.invoke('station:apply', paths),
});
