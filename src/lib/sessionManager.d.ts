import { SystemLog } from './supabaseClient';
export declare function generateSessionId(): string;
interface SessionState {
    sessionId: string;
    startedAt: Date;
    logs: SystemLog[];
    isDevMode: boolean;
    totalStats: {
        totalSessions: number;
        totalCost: number;
        totalCalls: number;
    } | null;
    resetSession: () => void;
    addLog: (log: SystemLog) => void;
    setLogs: (logs: SystemLog[]) => void;
    loadSessionLogs: () => Promise<void>;
    loadTotalStats: () => Promise<void>;
    getSessionCost: () => number;
}
export declare const useSessionStore: import("zustand").UseBoundStore<import("zustand").StoreApi<SessionState>>;
export declare function getCurrentSessionId(): string;
export declare function addLogEntry(log: SystemLog): void;
export {};
