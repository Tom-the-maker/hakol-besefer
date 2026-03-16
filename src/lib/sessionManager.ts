// Session Manager for Developer Testing
// Handles session ID generation and state management with localStorage persistence

import { create } from 'zustand';
import { SystemLog, getSessionLogs, getTotalStats } from './supabaseClient';

const SESSION_STORAGE_KEY = 'dev_session';

// Get or create session ID from localStorage
function getOrCreateSessionId(): string {
    try {
        const stored = localStorage.getItem(SESSION_STORAGE_KEY);
        if (stored) {
            const data = JSON.parse(stored);
            // Check if session is less than 24 hours old
            if (data.sessionId && data.startedAt) {
                const age = Date.now() - new Date(data.startedAt).getTime();
                if (age < 24 * 60 * 60 * 1000) { // 24 hours
                    return data.sessionId;
                }
            }
        }
    } catch (e) {
        console.warn('Could not read session from localStorage:', e);
    }
    // Generate new session ID
    return generateSessionId();
}

// Generate a unique session ID
export function generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `sess_${timestamp}_${random}`;
}

// Save session to localStorage
function saveSessionToStorage(sessionId: string, startedAt: Date) {
    try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
            sessionId,
            startedAt: startedAt.toISOString()
        }));
    } catch (e) {
        console.warn('Could not save session to localStorage:', e);
    }
}

// Session state interface
interface SessionState {
    sessionId: string;
    startedAt: Date;
    logs: SystemLog[];
    isDevMode: boolean;
    totalStats: { totalSessions: number; totalCost: number; totalCalls: number } | null;

    // Actions
    resetSession: () => void;
    addLog: (log: SystemLog) => void;
    setLogs: (logs: SystemLog[]) => void;
    loadSessionLogs: () => Promise<void>;
    loadTotalStats: () => Promise<void>;
    getSessionCost: () => number;
}

// Initialize session
const initialSessionId = getOrCreateSessionId();
const initialStartedAt = new Date();
saveSessionToStorage(initialSessionId, initialStartedAt);

// Create session store using Zustand
export const useSessionStore = create<SessionState>((set, get) => ({
    sessionId: initialSessionId,
    startedAt: initialStartedAt,
    logs: [],
    isDevMode: import.meta.env.DEV,
    totalStats: null,

    resetSession: () => {
        const newSessionId = generateSessionId();
        const newStartedAt = new Date();
        // console.debug('🔄 Session reset. New ID:', newSessionId);
        saveSessionToStorage(newSessionId, newStartedAt);
        set({
            sessionId: newSessionId,
            startedAt: newStartedAt,
            logs: []
        });
    },

    addLog: (log: SystemLog) => {
        set(state => ({
            logs: [...state.logs, log]
        }));
    },

    setLogs: (logs: SystemLog[]) => {
        set({ logs });
    },

    loadSessionLogs: async () => {
        const { sessionId } = get();
        const logs = await getSessionLogs(sessionId);
        set({ logs });
    },

    loadTotalStats: async () => {
        const stats = await getTotalStats();
        set({ totalStats: stats });
    },

    getSessionCost: () => {
        const { logs } = get();
        return logs.reduce((sum, log) => sum + (log.metadata?.estimated_cost || 0), 0);
    }
}));

// Helper to get current session ID (for use in API calls)
export function getCurrentSessionId(): string {
    return useSessionStore.getState().sessionId;
}

// Helper to add a log entry
export function addLogEntry(log: SystemLog): void {
    useSessionStore.getState().addLog(log);
}
