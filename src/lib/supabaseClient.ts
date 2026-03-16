// Supabase Client for System Logging
// Uses the existing 'system_logs' table for all API call tracking

import { createClient, SupabaseClient } from '@supabase/supabase-js';

function cleanEnv(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.replace(/\\n|\\r/g, '').replace(/\r?\n/g, '').trim();
}

// Get Supabase credentials from environment
const supabaseUrl = cleanEnv(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);

// Check if Supabase is configured
export const isSupabaseConfigured = (): boolean => {
    return Boolean(supabaseUrl && supabaseAnonKey);
};

// Create and export the Supabase client
let supabase: SupabaseClient | null = null;

if (isSupabaseConfigured()) {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    // console.debug('✅ Supabase client initialized');
} else {
    console.warn('⚠️ Supabase not configured. Logging will be local-only.');
}

export { supabase };

async function getServerApiHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!supabase) return headers;

    try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) {
            headers.Authorization = `Bearer ${data.session.access_token}`;
        }
    } catch {
        // Ignore auth lookup failures and continue without Authorization.
    }

    return headers;
}

// Type definition matching the existing system_logs table
export interface SystemLog {
    id?: number;
    created_at?: string;
    session_id: string;
    user_id?: string;
    action_type: string;
    model_name: string;
    input_tokens: number;
    output_tokens: number;
    status: 'success' | 'error' | 'pending';
    // New product-level columns for analytics
    child_name?: string;
    topic?: string;
    art_style?: string;
    hero_gender?: string;
    hero_age?: number;
    book_title?: string;
    extra_char_1?: string;
    extra_char_2?: string;
    metadata?: {
        estimated_cost?: number;
        duration_ms?: number;
        error_message?: string;
        [key: string]: unknown;
    };
}

export const SYSTEM_LOG_COLUMNS = [
    'id',
    'created_at',
    'session_id',
    'user_id',
    'action_type',
    'model_name',
    'input_tokens',
    'output_tokens',
    'status',
    'child_name',
    'topic',
    'art_style',
    'hero_gender',
    'hero_age',
    'book_title',
    'extra_char_1',
    'extra_char_2',
    'metadata',
].join(', ');

// Pricing per 1M tokens (as of Jan 2026 - UPDATED to actual Google rates)
export const MODEL_PRICING = {
    // Current internal aliases (masked in client/dev UI)
    'text-core-v1': { input: 0.10, output: 0.40 },
    'story-crafter-v1': { input: 2.00, output: 12.00 },
    'scene-render-v1': { input: 0.00, output: 0.00, perImage: 0.101 },
    'scene-render-mock-v1': { input: 0.00, output: 0.00, perImage: 0.00 },
    // Legacy keys kept for historical records
    'gemini-2.0-flash': { input: 0.10, output: 0.40 },
    'gemini-3.1-flash-lite-preview': { input: 0.25, output: 1.50 },
    'gemini-3-pro-preview': { input: 2.00, output: 12.00 },
    'gemini-3.1-pro-preview': { input: 2.00, output: 12.00 },
    'gemini-3.1-flash-image-preview': { input: 0.00, output: 0.00, perImage: 0.101 },
    'gemini-3.1-flash-image-preview-mock': { input: 0.00, output: 0.00, perImage: 0.00 },
    'gemini-3-pro-image-preview': { input: 0.00, output: 0.00, perImage: 0.134 },
    'gemini-3-pro-image-preview-mock': { input: 0.00, output: 0.00, perImage: 0.00 },
} as const;

type PricingModelKey = keyof typeof MODEL_PRICING;

function normalizeModelName(model: string): string {
    return String(model || '').trim().toLowerCase();
}

export function resolveBillingModel(model: string, isImageGeneration = false): PricingModelKey | null {
    const normalized = normalizeModelName(model);
    if (!normalized) return null;

    if (normalized in MODEL_PRICING) {
        return normalized as PricingModelKey;
    }

    if (normalized.includes('scene-render-mock') || (normalized.includes('image') && normalized.includes('mock'))) {
        return 'scene-render-mock-v1';
    }

    if (normalized.includes('scene-render')) {
        return 'scene-render-v1';
    }

    if (normalized.includes('3-pro-image-preview')) {
        return 'gemini-3-pro-image-preview';
    }

    if (normalized.includes('3.1-flash-image-preview')) {
        return 'gemini-3.1-flash-image-preview';
    }

    if (normalized.includes('image')) {
        return isImageGeneration ? 'scene-render-v1' : 'text-core-v1';
    }

    if (normalized.includes('story-crafter') || normalized.includes('pro')) {
        return 'story-crafter-v1';
    }

    if (normalized.includes('flash-lite')) {
        return 'gemini-3.1-flash-lite-preview';
    }

    if (normalized.includes('text-core') || normalized.includes('flash')) {
        return 'text-core-v1';
    }

    if (isImageGeneration) {
        return 'scene-render-v1';
    }

    return null;
}

// Calculate cost based on tokens and model
export function calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    isImageGeneration = false
): number {
    const billingModel = resolveBillingModel(model, isImageGeneration);
    const pricing = billingModel ? MODEL_PRICING[billingModel] : null;

    if (!pricing) {
        console.warn(`Unknown model for pricing: ${model}`);
        return 0;
    }

    if (isImageGeneration && 'perImage' in pricing) {
        return pricing.perImage;
    }

    const normalizedInput = Number.isFinite(Number(inputTokens)) ? Number(inputTokens) : 0;
    const normalizedOutput = Number.isFinite(Number(outputTokens)) ? Number(outputTokens) : 0;
    const inputCost = (normalizedInput / 1_000_000) * pricing.input;
    const outputCost = (normalizedOutput / 1_000_000) * pricing.output;
    return inputCost + outputCost;
}

function isImageModelName(model: string): boolean {
    const normalized = String(model || '').toLowerCase();
    return normalized.includes('image') || normalized.includes('scene-render');
}

// Log an activity to Supabase system_logs table
export async function logActivity(log: SystemLog): Promise<boolean> {
    // Calculate cost if not provided
    if (!log.metadata?.estimated_cost) {
        const isImage = isImageModelName(log.model_name);
        const cost = calculateCost(log.model_name, log.input_tokens, log.output_tokens, isImage);
        log.metadata = { ...log.metadata, estimated_cost: cost };
    }

    // Always log to console for dev visibility
    // console.debug(`📊 [${log.action_type}] ${log.model_name} - In: ${log.input_tokens}, Out: ${log.output_tokens} - $${log.metadata.estimated_cost?.toFixed(4)}`);

    try {
        const response = await fetch('/api/system-log', {
            method: 'POST',
            headers: await getServerApiHeaders(),
            body: JSON.stringify(log),
        });

        if (!response.ok) {
            console.error('❌ Failed to log to server:', response.status);
            return false;
        }

        return true;
    } catch (err) {
        console.error('❌ System log request error:', err);
        return false;
    }
}

// Get session logs from Supabase
export async function getSessionLogs(sessionId: string): Promise<SystemLog[]> {
    try {
        const response = await fetch(`/api/system-logs?sessionId=${encodeURIComponent(sessionId)}`, {
            headers: await getServerApiHeaders(),
        });

        if (!response.ok) {
            console.error('❌ Failed to get session logs:', response.status);
            return [];
        }

        const payload = await response.json().catch(() => null);
        return Array.isArray(payload?.logs) ? payload.logs : [];
    } catch (err) {
        console.error('❌ System log fetch error:', err);
        return [];
    }
}

// Get total stats from all sessions (recalculates costs using current pricing)
export async function getTotalStats(): Promise<{ totalSessions: number; totalCost: number; totalCalls: number } | null> {
    try {
        const response = await fetch('/api/system-logs-stats', {
            headers: await getServerApiHeaders(),
        });

        if (!response.ok) {
            console.error('❌ Failed to get stats:', response.status);
            return null;
        }

        const payload = await response.json().catch(() => null);
        if (!payload || typeof payload !== 'object') {
            return null;
        }

        return {
            totalSessions: Number((payload as any).totalSessions) || 0,
            totalCost: Number((payload as any).totalCost) || 0,
            totalCalls: Number((payload as any).totalCalls) || 0,
        };
    } catch (err) {
        console.error('❌ System log stats error:', err);
        return null;
    }
}
