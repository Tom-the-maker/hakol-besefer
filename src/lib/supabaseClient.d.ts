import { SupabaseClient } from '@supabase/supabase-js';
export declare const isSupabaseConfigured: () => boolean;
declare let supabase: SupabaseClient | null;
export { supabase };
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
export declare const MODEL_PRICING: {
    readonly 'text-core-v1': {
        readonly input: 0.1;
        readonly output: 0.4;
    };
    readonly 'story-crafter-v1': {
        readonly input: 2;
        readonly output: 12;
    };
    readonly 'scene-render-v1': {
        readonly input: 0;
        readonly output: 0;
        readonly perImage: 0.101;
    };
    readonly 'scene-render-mock-v1': {
        readonly input: 0;
        readonly output: 0;
        readonly perImage: 0;
    };
    readonly 'gemini-2.0-flash': {
        readonly input: 0.1;
        readonly output: 0.4;
    };
    readonly 'gemini-3.1-pro-preview': {
        readonly input: 2;
        readonly output: 12;
    };
    readonly 'gemini-3.1-flash-image-preview': {
        readonly input: 0;
        readonly output: 0;
        readonly perImage: 0.101;
    };
    readonly 'gemini-3.1-flash-image-preview-mock': {
        readonly input: 0;
        readonly output: 0;
        readonly perImage: 0;
    };
    readonly 'gemini-3-pro-image-preview': {
        readonly input: 0;
        readonly output: 0;
        readonly perImage: 0.134;
    };
    readonly 'gemini-3-pro-image-preview-mock': {
        readonly input: 0;
        readonly output: 0;
        readonly perImage: 0;
    };
};
export declare function calculateCost(model: string, inputTokens: number, outputTokens: number, isImageGeneration?: boolean): number;
export declare function logActivity(log: SystemLog): Promise<boolean>;
export declare function getSessionLogs(sessionId: string): Promise<SystemLog[]>;
export declare function getTotalStats(): Promise<{
    totalSessions: number;
    totalCost: number;
    totalCalls: number;
} | null>;
