import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
    AlertTriangle,
    BarChart3,
    BookOpen,
    ChevronDown,
    ChevronUp,
    Copy,
    Download,
    ExternalLink,
    FileText,
    Languages,
    Home,
    Image as ImageIcon,
    Maximize2,
    MessageSquare,
    Network,
    Plus,
    RefreshCw,
    Search,
    ScrollText,
    Sparkles,
    Trash2,
    Type,
} from 'lucide-react';
import { Story } from '../../types';
import { useSessionStore } from '../../lib/sessionManager';
import { calculateCost, resolveBillingModel, supabase, SystemLog, SYSTEM_LOG_COLUMNS } from '../../lib/supabaseClient';
import { clearMockMode, isMockMode, setMockMode } from '../../lib/mockMode';
import { createPdfBackupBlob } from '../../lib/pdfBackup';
import { getBookToken, removeBookOwnership } from '../../lib/bookService';

interface SessionFlow {
    session_id: string;
    started_at: string;
    logs: SystemLog[];
    chat: SystemLog[];
    titleSuggestions: SystemLog[];
    storyGeneration: SystemLog[];
    imageGeneration: SystemLog[];
    alternativeTitles: SystemLog[];
    total_cost_usd: number;
    total_tokens: number;
    productInfo?: {
        childName?: string;
        topic?: string;
        artStyle?: string;
        bookTitle?: string;
        gender?: string;
        age?: number;
        extraChars?: string[];
        parentName?: string;
        parentRole?: string;
        thirdRole?: string;
    };
    bookAssets?: {
        bookId?: string;
        slug?: string;
        title?: string;
        previewImageUrl?: string;
        compositeImageUrl?: string;
        segments?: string[];
        pdfUrl?: string;
        pdfFileName?: string;
        parentCharacter?: string;
        parentName?: string;
        paymentStatus?: string;
        isUnlocked?: boolean;
        email?: string;
        childName?: string;
        topic?: string;
        artStyle?: string;
        updated_at?: string;
        created_at?: string;
    };
    analyticsEvents?: {
        loaded: boolean;
        counts: Record<string, number>;
        lastAt?: string;
        events: AnalyticsEventRecord[];
        ui: SessionUiTelemetrySummary;
    };
    forensics?: SessionForensics;
}

interface AnalyticsEventRecord {
    event_name: string;
    created_at?: string;
    page?: string;
    device_type?: string;
    event_data?: Record<string, unknown>;
}

interface SessionUiTelemetrySummary {
    totalClicks: number;
    uniqueClickTargets: number;
    totalInputs: number;
    totalScrollEvents: number;
    maxWindowScrollMilestone: number;
    maxChatScrollMilestone: number;
    topClickTargets: Array<{ label: string; count: number }>;
}

interface RuntimeModelSnapshot {
    modelName?: string;
    requestedModel?: string;
    providerModel?: string;
    providerModelSource?: string;
    billingModel?: string;
}

interface NormalizedGridSummary {
    sourceWidth?: number;
    sourceHeight?: number;
    targetWidth?: number;
    targetHeight?: number;
    panelSize?: number;
    left?: number;
    top?: number;
    columns?: number;
    rows?: number;
    wasNormalized?: boolean;
}

interface ReferenceProfileSummary {
    slot: string;
    characterType?: string;
    subjectType?: string;
    summary?: string;
    hair?: string;
    glasses?: string;
    facialHair?: string;
    identityAnchors: string[];
    accessories: string[];
    model?: string;
}

interface SessionCostBreakdown {
    chat: number;
    story: number;
    image: number;
    reference: number;
    total: number;
}

interface SessionStoryboardArtifacts {
    storySegments: string[];
    panelPlan: string[];
    segmentVisualMap: string[];
    panelCastMap: string[];
    imagePromptToken?: string;
}

interface SessionForensics {
    costBreakdown: SessionCostBreakdown;
    referenceTokens: number;
    normalizedGrid?: NormalizedGridSummary;
    referenceProfiles: ReferenceProfileSummary[];
    artifacts: SessionStoryboardArtifacts;
    runtime: {
        chat?: RuntimeModelSnapshot;
        story?: RuntimeModelSnapshot;
        image?: RuntimeModelSnapshot;
    };
}

interface JourneySnapshot {
    counts: Record<string, number>;
    reachedLabel: string;
    missingLabels: string[];
    isComplete: boolean;
    sourceLabel: string;
    analyticsCount: number;
    inferredCount: number;
    hasUiTelemetry: boolean;
}

type LogCategory = 'chat' | 'titleSuggestions' | 'storyGeneration' | 'imageGeneration' | 'alternativeTitles';

interface SitemapNode {
    id: string;
    title: string;
    subtitle: string;
    href?: string;
    type: 'page' | 'popup';
}

interface SitemapBranch {
    id: string;
    title: string;
    description: string;
    nodes: SitemapNode[];
}

type DashboardSection = 'sitemap' | 'kpis' | 'sessions';
type VerificationLevel = 'ok' | 'warn' | 'error';
type SessionTraceFilter = 'all' | 'mismatch' | 'fallback';

interface VerificationResult {
    level: VerificationLevel;
    message: string;
}

interface DashboardSessionsCache {
    version: number;
    cachedAt: string;
    sessions: SessionFlow[];
    hasMoreSessions: boolean;
}

const USD_TO_ILS = 3.7;
const DASHBOARD_SESSIONS_CACHE_KEY = 'dev_dashboard_sessions_cache_v2';
const DASHBOARD_SESSIONS_CACHE_VERSION = 3;
const DASHBOARD_COVER_CACHE_KEY = 'dev_dashboard_loaded_covers_v1';
const DASHBOARD_INITIAL_VISIBLE_SESSIONS = 5;
const DASHBOARD_LOAD_MORE_STEP = 5;
const DASHBOARD_MAX_LOADED_COVERS = 120;
const DASHBOARD_MODEL_DEFAULTS = {
    chat: {
        primary: 'gemini-3.1-flash-lite-preview',
        fallback: 'gemini-2.0-flash',
    },
    story: {
        primary: 'gemini-3.1-pro-preview',
        fallback: 'כבוי כברירת מחדל',
    },
    image: {
        primary: 'gemini-3.1-flash-image-preview',
        fallback: 'gemini-3.1-flash-image-preview',
    },
} as const;

const JOURNEY_STEPS = [
    { key: 'chat_start', label: 'התחלת צ׳אט' },
    { key: 'book_generated', label: 'ספר נוצר' },
    { key: 'register_start', label: 'תחילת הרשמה' },
    { key: 'register_complete', label: 'הרשמה הושלמה' },
    { key: 'payment_start', label: 'תחילת תשלום' },
    { key: 'payment_complete', label: 'תשלום הושלם' },
] as const;

const categoryConfig: Record<LogCategory, { icon: React.ElementType; label: string }> = {
    chat: { icon: MessageSquare, label: 'שיחה' },
    titleSuggestions: { icon: Sparkles, label: 'הצעות כותרת' },
    storyGeneration: { icon: BookOpen, label: 'כתיבת סיפור' },
    imageGeneration: { icon: ImageIcon, label: 'יצירת תמונה' },
    alternativeTitles: { icon: Sparkles, label: 'כותרות חלופיות' },
};

const branchData: SitemapBranch[] = [
    {
        id: 'branch-create',
        title: 'יצירה ורכישה',
        description: 'הזרימה הראשית של מוצר הספר',
        nodes: [
            { id: 'chat', title: 'צ׳אט יצירה', subtitle: 'איסוף פרטים והעלאות', href: '/?devPhase=chat', type: 'page' },
            { id: 'thinking', title: 'שלב חשיבה', subtitle: 'מסך עיבוד/טעינה', href: '/?devPhase=thinking', type: 'page' },
            { id: 'pre-purchase', title: 'לפני רכישה', subtitle: 'תצוגה מקדימה נעולה', href: '/?devPhase=view&devBookState=locked', type: 'page' },
            { id: 'register', title: 'רישום', subtitle: 'איסוף אימייל', href: '/?devPhase=register&devBookState=locked', type: 'page' },
            { id: 'payment', title: 'תשלום', subtitle: 'Checkout בתוך עמוד', href: '/?devPhase=payment&devBookState=locked', type: 'page' },
            { id: 'post-purchase', title: 'אחרי רכישה', subtitle: 'עריכת ספר פתוח', href: '/?devPhase=view&devBookState=unlocked', type: 'page' },
        ],
    },
    {
        id: 'branch-gallery',
        title: 'בית, גלריה והשראה',
        description: 'כניסת משתמש וגילוי תכנים',
        nodes: [
            { id: 'home', title: 'דף בית', subtitle: 'Hero + Sections', href: '/', type: 'page' },
            { id: 'gallery-army', title: 'גלריה (צבא)', subtitle: 'קטגוריה לדוגמה', href: '/?devPhase=gallery&devCategory=army', type: 'page' },
            { id: 'gallery-couples', title: 'גלריה (זוגות)', subtitle: 'קטגוריה לדוגמה', href: '/?devPhase=gallery&devCategory=couples', type: 'page' },
            { id: 'gallery-kids', title: 'גלריה (ילדים)', subtitle: 'קטגוריה לדוגמה', href: '/?devPhase=gallery&devCategory=kids', type: 'page' },
            { id: 'gallery-farewell', title: 'גלריה (פרידה)', subtitle: 'קטגוריה לדוגמה', href: '/?devPhase=gallery&devCategory=farewell', type: 'page' },
        ],
    },
    {
        id: 'branch-account-legal',
        title: 'אזור אישי ומשפטי',
        description: 'עמודי חשבון, חוקיות ושקיפות',
        nodes: [
            { id: 'my-books', title: 'הספרים שלי', subtitle: 'ניהול ספרים קיימים', href: '/my-books', type: 'page' },
            { id: 'not-found', title: 'עמוד 404', subtitle: 'נתיב לא קיים', href: '/?devPhase=not-found', type: 'page' },
            { id: 'terms', title: 'תנאי שימוש', subtitle: 'עמוד משפטי', href: '/terms', type: 'page' },
            { id: 'privacy', title: 'מדיניות פרטיות', subtitle: 'עמוד משפטי', href: '/privacy', type: 'page' },
            { id: 'contact', title: 'צור קשר', subtitle: 'פנייה לתמיכה', href: '/contact', type: 'page' },
            { id: 'accessibility', title: 'נגישות', subtitle: 'הצהרת נגישות', href: '/accessibility', type: 'page' },
            { id: 'cancellation', title: 'ביטול עסקה', subtitle: 'מדיניות ביטול', href: '/cancellation', type: 'page' },
        ],
    },
    {
        id: 'branch-popups',
        title: 'פופאפים ותצוגות',
        description: 'כל פופאפ פתוח בכפתור ישיר',
        nodes: [
            { id: 'popup-auth', title: 'פופאפ התחברות', subtitle: 'Magic Link (AuthModal)', href: '/?devPopup=auth', type: 'popup' },
            { id: 'popup-cookie', title: 'פופאפ עוגיות', subtitle: 'Cookie Consent', href: '/?devPopup=cookie', type: 'popup' },
            { id: 'popup-cookie-details', title: 'פופאפ העדפות עוגיות', subtitle: 'Cookie Details', href: '/?devPopup=cookie-details', type: 'popup' },
            { id: 'popup-save', title: 'פופאפ נשמר לגלריה', subtitle: 'לפני רכישה', href: '/?devPhase=view&devBookState=locked&devPopup=before-save-modal', type: 'popup' },
            { id: 'popup-notify-sales', title: 'פופאפ עדכנו אותי (לפני)', subtitle: 'לפני רכישה', href: '/?devPhase=view&devBookState=locked&devPopup=before-notify-modal', type: 'popup' },
            { id: 'popup-mobile-before', title: 'פופאפ מוביל מסך מלא (לפני)', subtitle: 'לפני רכישה', href: '/?devPhase=view&devBookState=locked&devPopup=before-mobile-fullscreen', type: 'popup' },
            { id: 'popup-approve', title: 'פופאפ אישור סופי', subtitle: 'אחרי רכישה', href: '/?devPhase=view&devBookState=unlocked&devPopup=after-approve-screen', type: 'popup' },
            { id: 'popup-notify-editor', title: 'פופאפ דפוס בעורך (אחרי)', subtitle: 'אחרי רכישה', href: '/?devPhase=view&devBookState=unlocked&devPopup=after-notify-modal', type: 'popup' },
            { id: 'popup-mobile-after', title: 'פופאפ מוביל מסך מלא (אחרי)', subtitle: 'אחרי רכישה', href: '/?devPhase=view&devBookState=unlocked&devPopup=after-mobile-fullscreen', type: 'popup' },
            { id: 'popup-support-chat', title: 'צ׳אט תמיכה פתוח', subtitle: 'Support Widget', href: '/?devPopup=support-chat', type: 'popup' },
            { id: 'popup-error', title: 'פופאפ שגיאה גלובלי', subtitle: 'Error Boundary', href: '/?devPopup=error-boundary', type: 'popup' },
        ],
    },
];

const navSections: { id: DashboardSection; label: string; icon: React.ElementType; hint: string }[] = [
    { id: 'sitemap', label: 'מפת אתר', hint: 'ניווט לכל דף ופופאפ', icon: Network },
    { id: 'kpis', label: 'סקירה וסטטוס', hint: 'מדדים כלליים ועלויות', icon: BarChart3 },
    { id: 'sessions', label: 'לוגים וסשנים', hint: 'פירוט קריאות API', icon: ScrollText },
];

const DASHBOARD_CHARACTER_LABELS: Record<string, string> = {
    father: 'אבא',
    mother: 'אמא',
    grandmother: 'סבתא',
    grandfather: 'סבא',
    partner: 'בן/בת זוג',
    friend: 'חבר/ה',
    child: 'ילד/ה',
    brother: 'אח',
    sister: 'אחות',
    pet: 'חיית מחמד',
};

function readDashboardSessionsCache(): DashboardSessionsCache | null {
    if (typeof window === 'undefined') return null;

    try {
        const raw = window.localStorage.getItem(DASHBOARD_SESSIONS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as DashboardSessionsCache | null;
        if (!parsed || parsed.version !== DASHBOARD_SESSIONS_CACHE_VERSION) return null;
        if (!Array.isArray(parsed.sessions)) return null;
        if (typeof parsed.hasMoreSessions !== 'boolean') return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeDashboardSessionsCache(sessions: SessionFlow[], hasMoreSessions: boolean): string | null {
    if (typeof window === 'undefined') return null;

    try {
        const cachedAt = new Date().toISOString();
        const payload: DashboardSessionsCache = {
            version: DASHBOARD_SESSIONS_CACHE_VERSION,
            cachedAt,
            sessions,
            hasMoreSessions,
        };
        window.localStorage.setItem(DASHBOARD_SESSIONS_CACHE_KEY, JSON.stringify(payload));
        return cachedAt;
    } catch {
        return null;
    }
}

function clearDashboardSessionsCache(): void {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.removeItem(DASHBOARD_SESSIONS_CACHE_KEY);
    } catch {
        // Ignore storage errors.
    }
}

function normalizeLoadedCoverSessionIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    return [...new Set(
        value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
    )].slice(0, DASHBOARD_MAX_LOADED_COVERS);
}

function readLoadedCoverSessionIds(): string[] {
    if (typeof window === 'undefined') return [];

    try {
        return normalizeLoadedCoverSessionIds(JSON.parse(window.localStorage.getItem(DASHBOARD_COVER_CACHE_KEY) || '[]'));
    } catch {
        return [];
    }
}

function writeLoadedCoverSessionIds(sessionIds: Iterable<string>): void {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.setItem(
            DASHBOARD_COVER_CACHE_KEY,
            JSON.stringify(normalizeLoadedCoverSessionIds(Array.from(sessionIds)))
        );
    } catch {
        // Ignore storage errors.
    }
}

function clearLoadedCoverSessionIds(): void {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.removeItem(DASHBOARD_COVER_CACHE_KEY);
    } catch {
        // Ignore storage errors.
    }
}

function normalizeCompanionValue(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const lower = trimmed.toLowerCase();
    const blocked = new Set(['skip', 'none', 'null', 'undefined', 'n/a', 'na', 'unknown', 'other', 'אחר', 'דמות נוספת']);
    if (blocked.has(lower)) return undefined;
    return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | undefined {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : undefined;
}

function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function toCompanionDisplay(value: string): string {
    const lower = value.trim().toLowerCase();
    return DASHBOARD_CHARACTER_LABELS[lower] || value.trim();
}

function normalizeImageAssetUrl(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;

    const legacyMockSuffix = '/Books/Book1/composite.jpg';
    if (trimmed === legacyMockSuffix) {
        return '/Books/Book1/grid.jpg';
    }
    if (trimmed.endsWith(legacyMockSuffix)) {
        return `${trimmed.slice(0, -legacyMockSuffix.length)}/Books/Book1/grid.jpg`;
    }

    return trimmed;
}

function isKnownBrokenImageAssetUrl(value: string): boolean {
    const normalized = value.toLowerCase();
    if (normalized.startsWith('data:image/')) return false;
    if (normalized.startsWith('blob:')) return false;

    try {
        const parsedUrl = new URL(value, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
        const pathname = parsedUrl.pathname.toLowerCase();
        return pathname.endsWith('.html') || pathname.endsWith('.htm');
    } catch {
        const withoutQuery = normalized.split('?')[0]?.split('#')[0] || normalized;
        return withoutQuery.endsWith('.html') || withoutQuery.endsWith('.htm');
    }
}

function pickBestImageAssetUrl(...values: Array<unknown>): string | undefined {
    const candidates = [...new Set(values.map(normalizeImageAssetUrl).filter(Boolean) as string[])];
    return candidates.find((value) => !isKnownBrokenImageAssetUrl(value)) || candidates[0];
}

function getSessionPreferredImageUrl(bookAssets?: SessionFlow['bookAssets']): string | undefined {
    return pickBestImageAssetUrl(bookAssets?.compositeImageUrl, bookAssets?.previewImageUrl);
}

function getSessionPreviewImageUrl(bookAssets?: SessionFlow['bookAssets']): string | undefined {
    return pickBestImageAssetUrl(bookAssets?.previewImageUrl);
}

function getSessionLogImageUrl(session: SessionFlow): string | undefined {
    const latestImageLog = getLatestLogForCategory(session.logs, 'imageGeneration');
    return pickBestImageAssetUrl(latestImageLog?.metadata?.result_data);
}

function getSessionDownloadImageUrl(session: SessionFlow): string | undefined {
    const latestImageLog = getLatestLogForCategory(session.logs, 'imageGeneration');
    const logImageUrl = pickBestImageAssetUrl(latestImageLog?.metadata?.result_data);
    const preferredBookImageUrl = getSessionPreferredImageUrl(session.bookAssets);
    const previewBookImageUrl = getSessionPreviewImageUrl(session.bookAssets);

    if (latestImageLog?.metadata?.mock_image_mode && logImageUrl) {
        return logImageUrl;
    }

    return pickBestImageAssetUrl(preferredBookImageUrl, previewBookImageUrl, logImageUrl);
}

function collectCompanionNames(values: unknown[]): string[] {
    const dedup = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        const normalized = normalizeCompanionValue(value);
        if (!normalized) continue;
        const display = toCompanionDisplay(normalized);
        const key = display.toLowerCase();
        if (dedup.has(key)) continue;
        dedup.add(key);
        result.push(display);
    }

    return result;
}

function categorizeLog(log: SystemLog): LogCategory {
    switch (log.action_type) {
        case 'validateHebrewName':
            return 'chat';
        case 'generateTitleSuggestions':
            return 'titleSuggestions';
        case 'generateStory':
        case 'generate16GridStory':
            return 'storyGeneration';
        case 'generateGridImage':
        case 'generateCompositeImage':
            return 'imageGeneration';
        case 'generateAlternativeTitles':
            return 'alternativeTitles';
        default:
            return 'chat';
    }
}

function stringifyMetadata(metadata: unknown): string {
    const replacer = (_key: string, value: unknown) => {
        if (typeof value === 'string' && value.startsWith('data:image')) {
            return '[inline-image-redacted]';
        }
        if (typeof value === 'string' && value.length > 500) {
            return `${value.slice(0, 160)}...[truncated ${value.length} chars]`;
        }
        return value;
    };

    try {
        return JSON.stringify(metadata ?? {}, replacer, 2);
    } catch {
        return String(metadata ?? '');
    }
}

function recalculateCost(log: SystemLog): number {
    const normalizedModel = String(log.model_name || '').toLowerCase();
    const isImage = normalizedModel.includes('image') || normalizedModel.includes('scene-render');
    return calculateCost(log.model_name, log.input_tokens, log.output_tokens, isImage);
}

function getReferenceAnalysisEntries(log: SystemLog): Record<string, unknown>[] {
    return Array.isArray(log.metadata?.reference_analysis)
        ? (log.metadata?.reference_analysis as unknown[]).filter(isRecord)
        : [];
}

function getReferenceAnalysisCost(log: SystemLog): number {
    return getReferenceAnalysisEntries(log).reduce((sum, entry) => {
        const usage = isRecord(entry.usage) ? entry.usage : {};
        const model =
            (typeof entry.providerModel === 'string' && entry.providerModel) ||
            (typeof entry.requestedModel === 'string' && entry.requestedModel) ||
            (typeof entry.model === 'string' && entry.model) ||
            '';
        const input = toFiniteNumber(usage.input) || 0;
        const output = toFiniteNumber(usage.output) || 0;
        return sum + calculateCost(model, input, output, false);
    }, 0);
}

function getReferenceAnalysisTokens(log: SystemLog): number {
    return getReferenceAnalysisEntries(log).reduce((sum, entry) => {
        const usage = isRecord(entry.usage) ? entry.usage : {};
        return sum + (toFiniteNumber(usage.input) || 0) + (toFiniteNumber(usage.output) || 0);
    }, 0);
}

function getForensicCost(log: SystemLog): number {
    return recalculateCost(log) + getReferenceAnalysisCost(log);
}

function getForensicTokenCount(log: SystemLog): number {
    return log.input_tokens + log.output_tokens + getReferenceAnalysisTokens(log);
}

function extractNormalizedGrid(log?: SystemLog): NormalizedGridSummary | undefined {
    if (!log || !isRecord(log.metadata?.normalized_grid)) return undefined;
    const grid = log.metadata.normalized_grid;
    return {
        sourceWidth: toFiniteNumber(grid.sourceWidth),
        sourceHeight: toFiniteNumber(grid.sourceHeight),
        targetWidth: toFiniteNumber(grid.targetWidth),
        targetHeight: toFiniteNumber(grid.targetHeight),
        panelSize: toFiniteNumber(grid.panelSize),
        left: toFiniteNumber(grid.left),
        top: toFiniteNumber(grid.top),
        columns: toFiniteNumber(grid.columns),
        rows: toFiniteNumber(grid.rows),
        wasNormalized: typeof grid.wasNormalized === 'boolean' ? grid.wasNormalized : undefined,
    };
}

function extractReferenceProfiles(log?: SystemLog): ReferenceProfileSummary[] {
    return getReferenceAnalysisEntries(log || { metadata: {} } as SystemLog).map((entry) => {
        const profile = isRecord(entry.profile) ? entry.profile : {};
        return {
            slot: typeof entry.slot === 'string' ? entry.slot : 'unknown',
            characterType: typeof entry.characterType === 'string' ? entry.characterType : undefined,
            subjectType: typeof profile.subjectType === 'string' ? profile.subjectType : undefined,
            summary: typeof profile.summary === 'string' ? profile.summary : undefined,
            hair: typeof profile.hair === 'string' ? profile.hair : undefined,
            glasses: typeof profile.glasses === 'string' ? profile.glasses : undefined,
            facialHair: typeof profile.facialHair === 'string' ? profile.facialHair : undefined,
            identityAnchors: toStringArray(profile.identityAnchors),
            accessories: toStringArray(profile.accessories),
            model:
                (typeof entry.providerModel === 'string' && entry.providerModel) ||
                (typeof entry.requestedModel === 'string' && entry.requestedModel) ||
                (typeof entry.model === 'string' && entry.model) ||
                undefined,
        };
    });
}

function getRuntimeModelSnapshot(log?: SystemLog): RuntimeModelSnapshot | undefined {
    if (!log) return undefined;
    return {
        modelName: typeof log.model_name === 'string' ? log.model_name : undefined,
        requestedModel: typeof log.metadata?.requested_model === 'string' ? log.metadata.requested_model : undefined,
        providerModel: typeof log.metadata?.provider_model === 'string' ? log.metadata.provider_model : undefined,
        providerModelSource: typeof log.metadata?.provider_model_source === 'string' ? log.metadata.provider_model_source : undefined,
        billingModel: resolveBillingModel(
            log.model_name,
            String(log.model_name || '').toLowerCase().includes('image') || String(log.model_name || '').toLowerCase().includes('scene-render'),
        ) || undefined,
    };
}

function summarizeSessionCost(logs: SystemLog[]): SessionCostBreakdown {
    const byCategory: SessionCostBreakdown = {
        chat: 0,
        story: 0,
        image: 0,
        reference: 0,
        total: 0,
    };

    logs.forEach((log) => {
        const referenceCost = getReferenceAnalysisCost(log);
        const baseCost = recalculateCost(log);
        const category = categorizeLog(log);
        if (category === 'storyGeneration') byCategory.story += baseCost;
        else if (category === 'imageGeneration') byCategory.image += baseCost;
        else byCategory.chat += baseCost;
        byCategory.reference += referenceCost;
    });

    byCategory.total = byCategory.chat + byCategory.story + byCategory.image + byCategory.reference;
    return byCategory;
}

function getLatestLogForCategory(logs: SystemLog[], category: LogCategory): SystemLog | undefined {
    return [...logs].reverse().find((entry) => categorizeLog(entry) === category && entry.status !== 'pending');
}

function getLatestObservedRuntime(sessions: SessionFlow[], category: LogCategory): RuntimeModelSnapshot | undefined {
    const allLogs = sessions
        .flatMap((session) => session.logs)
        .filter((entry) => entry.status !== 'pending' && categorizeLog(entry) === category)
        .sort((left, right) => new Date(right.created_at || '').getTime() - new Date(left.created_at || '').getTime());
    return getRuntimeModelSnapshot(allLogs[0]);
}

function formatUsdCost(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '0.000000';
    if (value < 0.000001) return value.toExponential(2);
    if (value < 0.01) return value.toFixed(6);
    return value.toFixed(4);
}

function formatIlsCost(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '0.000000';
    if (value < 0.000001) return value.toExponential(2);
    if (value < 0.01) return value.toFixed(6);
    return value.toFixed(3);
}

function normalizeModelForVerification(model: unknown): string {
    if (typeof model !== 'string') return '';
    const trimmed = model.trim().toLowerCase();
    if (!trimmed) return '';
    const withoutPrefix = trimmed.replace(/^models\//, '');

    if (withoutPrefix === 'text-core-v1') return 'gemini-2.0-flash';
    if (withoutPrefix === 'story-crafter-v1') return 'gemini-3.1-pro-preview';
    if (withoutPrefix === 'scene-render-v1') return 'gemini-3.1-flash-image-preview';
    if (withoutPrefix === 'scene-render-mock-v1') return 'gemini-3.1-flash-image-preview-mock';
    return withoutPrefix;
}

function areEquivalentModels(left: unknown, right: unknown): boolean {
    const a = normalizeModelForVerification(left);
    const b = normalizeModelForVerification(right);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.startsWith(`${b}-`) || b.startsWith(`${a}-`)) return true;
    return false;
}

function verifyModelTrace(log: SystemLog): VerificationResult {
    const modelName = normalizeModelForVerification(log.model_name);
    const requestedModel = normalizeModelForVerification(log.metadata?.requested_model);
    const providerModel = normalizeModelForVerification(log.metadata?.provider_model);
    const providerModelSource = typeof log.metadata?.provider_model_source === 'string'
        ? log.metadata.provider_model_source.trim()
        : '';
    const providerResponseId = typeof log.metadata?.provider_response_id === 'string'
        ? log.metadata.provider_response_id.trim()
        : '';

    if (!providerModel && !requestedModel) {
        return { level: 'warn', message: 'אין נתוני provider/requested ברשומה הזו' };
    }

    if (providerModel) {
        if (modelName && !areEquivalentModels(modelName, providerModel)) {
            return { level: 'error', message: `Mismatch: model_name (${log.model_name}) שונה מ-provider_model (${log.metadata?.provider_model})` };
        }
        if (providerModelSource !== 'provider_model_version') {
            return { level: 'warn', message: 'אימות חלקי: provider_model הגיע מ-fallback ולא מ-modelVersion' };
        }
        if (!providerResponseId) {
            return { level: 'warn', message: 'התאמה תקינה, אבל חסר response_id מהספק' };
        }
        return { level: 'ok', message: 'Verified: model_name תואם ל-provider_model מהספק' };
    }

    if (modelName && requestedModel && !areEquivalentModels(modelName, requestedModel)) {
        return { level: 'error', message: `Mismatch: model_name (${log.model_name}) שונה מ-requested_model (${log.metadata?.requested_model})` };
    }

    return { level: 'warn', message: 'אין provider_model מהספק; התאמה חלקית לפי requested_model בלבד' };
}

function matchesTraceFilter(log: SystemLog, filter: SessionTraceFilter): boolean {
    if (filter === 'all') return true;
    if (filter === 'mismatch') return verifyModelTrace(log).level === 'error';
    const source = typeof log.metadata?.provider_model_source === 'string'
        ? log.metadata.provider_model_source.trim()
        : '';
    return source === 'requested_model_fallback';
}

function getPromptTokenFromLog(log?: SystemLog): string {
    if (!log) return '';
    const responseJson = (log.metadata?.response_json && typeof log.metadata.response_json === 'object')
        ? log.metadata.response_json as Record<string, unknown>
        : {};
    const direct = typeof log.metadata?.prompt_token === 'string' ? log.metadata.prompt_token.trim() : '';
    const nested = typeof responseJson?.prompt_token === 'string' ? String(responseJson.prompt_token).trim() : '';
    return direct || nested || '';
}

function getJourneyStatus(counts: Record<string, number>) {
    const reachedIndex = JOURNEY_STEPS.reduce((maxIndex, step, index) => (
        (counts[step.key] || 0) > 0 ? index : maxIndex
    ), -1);

    const reachedLabel = reachedIndex >= 0 ? JOURNEY_STEPS[reachedIndex].label : 'לא התחיל';
    const missingLabels = JOURNEY_STEPS
        .filter((step) => (counts[step.key] || 0) === 0)
        .map((step) => step.label);

    return {
        reachedLabel,
        missingLabels,
        isComplete: missingLabels.length === 0,
    };
}

function markJourneyUpTo(counts: Record<string, number>, stepKey: typeof JOURNEY_STEPS[number]['key']) {
    const targetIndex = JOURNEY_STEPS.findIndex((step) => step.key === stepKey);
    if (targetIndex < 0) return;

    for (let index = 0; index <= targetIndex; index += 1) {
        const step = JOURNEY_STEPS[index];
        counts[step.key] = Math.max(counts[step.key] || 0, 1);
    }
}

function deriveJourneyCounts(session: SessionFlow): Record<string, number> {
    const derived: Record<string, number> = {};
    const completedLogs = session.logs.filter((entry) => entry.status !== 'pending');
    const paymentStatus = String(session.bookAssets?.paymentStatus || '').trim().toLowerCase();
    const hasAnyActivity =
        completedLogs.length > 0
        || !!session.productInfo?.childName
        || !!session.productInfo?.topic
        || !!session.productInfo?.bookTitle;
    const hasStory = session.storyGeneration.some((entry) => entry.status !== 'pending');
    const hasImage = session.imageGeneration.some((entry) => entry.status !== 'pending');
    const hasBook =
        !!session.bookAssets?.bookId
        || !!session.bookAssets?.slug
        || !!session.bookAssets?.title
        || !!session.bookAssets?.previewImageUrl
        || !!session.bookAssets?.compositeImageUrl
        || !!session.bookAssets?.pdfUrl
        || (session.bookAssets?.segments?.length || 0) > 0
        || (hasStory && hasImage);
    const hasPaymentComplete =
        session.bookAssets?.isUnlocked === true
        || ['paid', 'completed', 'success', 'succeeded', 'captured'].some((value) => paymentStatus.includes(value));
    const hasPaymentStarted =
        hasPaymentComplete
        || !!paymentStatus
        || typeof session.bookAssets?.isUnlocked === 'boolean';
    const hasRegistrationComplete =
        !!session.bookAssets?.email
        || hasPaymentStarted;

    if (hasPaymentComplete) markJourneyUpTo(derived, 'payment_complete');
    else if (hasPaymentStarted) markJourneyUpTo(derived, 'payment_start');
    else if (hasRegistrationComplete) markJourneyUpTo(derived, 'register_complete');
    else if (hasBook) markJourneyUpTo(derived, 'book_generated');
    else if (hasAnyActivity) markJourneyUpTo(derived, 'chat_start');

    return derived;
}

function buildJourneySnapshot(session: SessionFlow): JourneySnapshot {
    const analyticsCounts = session.analyticsEvents?.counts || {};
    const derivedCounts = deriveJourneyCounts(session);
    const mergedCounts: Record<string, number> = { ...analyticsCounts };

    Object.entries(derivedCounts).forEach(([key, count]) => {
        mergedCounts[key] = Math.max(mergedCounts[key] || 0, count);
    });

    const analyticsCount = Object.values(analyticsCounts).reduce((sum, count) => sum + count, 0);
    const inferredCount = Object.keys(derivedCounts).filter((key) => (derivedCounts[key] || 0) > (analyticsCounts[key] || 0)).length;
    const status = getJourneyStatus(mergedCounts);
    const sourceLabel = analyticsCount > 0
        ? (inferredCount > 0 ? 'שילוב אנליטיקה, לוגים וספר' : 'אנליטיקה מלאה')
        : 'לוגים וספר בלבד';

    return {
        ...status,
        counts: mergedCounts,
        sourceLabel,
        analyticsCount,
        inferredCount,
        hasUiTelemetry: !!session.analyticsEvents?.events?.length,
    };
}

function getModelRoleLabel(actionType: string): string {
    switch (actionType) {
        case 'validateHebrewName':
        case 'refineConcept':
        case 'validatePhoto':
        case 'analyzeFeatures':
            return 'שיחה / עיבוד קלט';
        case 'generateTitleSuggestions':
        case 'generateAlternativeTitles':
        case 'generateStory':
        case 'generate16GridStory':
            return 'כתיבת ספר';
        case 'generateGridImage':
        case 'generateCompositeImage':
            return 'יצירת תמונה';
        default:
            return 'כללי';
    }
}

function getActionDisplayLabel(actionType: string): string {
    switch (actionType) {
        case 'validateHebrewName':
            return 'אימות שם';
        case 'refineConcept':
            return 'שדרוג רעיון';
        case 'validatePhoto':
            return 'אימות תמונה';
        case 'analyzeFeatures':
            return 'ניתוח מאפייני דמות';
        case 'generateTitleSuggestions':
            return 'הצעות כותרת';
        case 'generateAlternativeTitles':
            return 'כותרות חלופיות';
        case 'generateStory':
        case 'generate16GridStory':
            return 'כתיבת סיפור';
        case 'generateGridImage':
        case 'generateCompositeImage':
            return 'יצירת תמונת ספר';
        default:
            return actionType || 'פעולה לא מזוהה';
    }
}

function getBaseSessionId(sessionId: string): string {
    return sessionId.split('_split_')[0];
}

function getOptionalTrimmedString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseStringSegments(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    }
    return [];
}

function parseAnalyticsEventData(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

function emptySessionUiTelemetrySummary(): SessionUiTelemetrySummary {
    return {
        totalClicks: 0,
        uniqueClickTargets: 0,
        totalInputs: 0,
        totalScrollEvents: 0,
        maxWindowScrollMilestone: 0,
        maxChatScrollMilestone: 0,
        topClickTargets: [],
    };
}

function createSessionAnalyticsState(loaded = false): NonNullable<SessionFlow['analyticsEvents']> {
    return {
        loaded,
        counts: {},
        events: [],
        ui: emptySessionUiTelemetrySummary(),
    };
}

function emptySessionForensics(): SessionForensics {
    return {
        costBreakdown: {
            chat: 0,
            story: 0,
            image: 0,
            reference: 0,
            total: 0,
        },
        referenceTokens: 0,
        referenceProfiles: [],
        artifacts: {
            storySegments: [],
            panelPlan: [],
            segmentVisualMap: [],
            panelCastMap: [],
        },
        runtime: {},
    };
}

function getTrimmedString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}

function buildSummarySessionFromBook(book: any): SessionFlow {
    const sessionKey = getTrimmedString(book?.session_id) || `book:${getTrimmedString(book?.slug) || getTrimmedString(book?.bookId) || crypto.randomUUID()}`;
    const previewImageUrl = getTrimmedString(book?.previewImageUrl);
    const compositeImageUrl = getTrimmedString(book?.compositeImageUrl);
    const title = getTrimmedString(book?.title);
    const childName = getTrimmedString(book?.childName);
    const topic = getTrimmedString(book?.topic);
    const artStyle = getTrimmedString(book?.artStyle);
    const createdAt = getTrimmedString(book?.created_at) || getTrimmedString(book?.updated_at) || new Date().toISOString();

    return {
        session_id: sessionKey,
        started_at: createdAt,
        logs: [],
        chat: [],
        titleSuggestions: [],
        storyGeneration: [],
        imageGeneration: [],
        alternativeTitles: [],
        total_cost_usd: 0,
        total_tokens: 0,
        productInfo: {
            childName,
            topic,
            artStyle,
            bookTitle: title,
            extraChars: [],
        },
        bookAssets: {
            bookId: getTrimmedString(book?.bookId),
            slug: getTrimmedString(book?.slug),
            title,
            previewImageUrl,
            compositeImageUrl,
            segments: parseStringSegments(book?.segments),
            pdfUrl: getTrimmedString(book?.pdfUrl),
            pdfFileName: getTrimmedString(book?.pdfFileName),
            parentCharacter: getTrimmedString(book?.parentCharacter),
            parentName: getTrimmedString(book?.parentName),
            paymentStatus: getTrimmedString(book?.paymentStatus),
            isUnlocked: typeof book?.isUnlocked === 'boolean' ? book.isUnlocked : undefined,
            email: getTrimmedString(book?.email),
            childName,
            topic,
            artStyle,
            updated_at: getTrimmedString(book?.updated_at),
            created_at: getTrimmedString(book?.created_at),
        },
        analyticsEvents: createSessionAnalyticsState(false),
        forensics: emptySessionForensics(),
    };
}

function buildSessionUiTelemetrySummary(events: AnalyticsEventRecord[]): SessionUiTelemetrySummary {
    const clickTargets = new Map<string, number>();
    let totalClicks = 0;
    let totalInputs = 0;
    let totalScrollEvents = 0;
    let maxWindowScrollMilestone = 0;
    let maxChatScrollMilestone = 0;

    events.forEach((event) => {
        const data = parseAnalyticsEventData(event.event_data);
        if (event.event_name === 'ui_click') {
            totalClicks += 1;
            const rawLabel = data.target_label || data.target_track_id || data.target_id || data.target_tag || 'unknown-target';
            const label = String(rawLabel || 'unknown-target').trim().slice(0, 120);
            clickTargets.set(label, (clickTargets.get(label) || 0) + 1);
        }

        if (event.event_name === 'ui_input' || event.event_name === 'chat_input') {
            totalInputs += 1;
        }

        if (event.event_name === 'ui_scroll') {
            totalScrollEvents += 1;
            const milestoneRaw = Number(data.milestone_percent);
            const milestone = Number.isFinite(milestoneRaw) ? milestoneRaw : 0;
            const scope = typeof data.scope === 'string' ? data.scope : '';
            if (scope === 'chat_messages') {
                maxChatScrollMilestone = Math.max(maxChatScrollMilestone, milestone);
            } else {
                maxWindowScrollMilestone = Math.max(maxWindowScrollMilestone, milestone);
            }
        }
    });

    const topClickTargets = [...clickTargets.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, count]) => ({ label, count }));

    return {
        totalClicks,
        uniqueClickTargets: clickTargets.size,
        totalInputs,
        totalScrollEvents,
        maxWindowScrollMilestone,
        maxChatScrollMilestone,
        topClickTargets,
    };
}

function parseTraceList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => {
            if (typeof item === 'string') return item.trim();
            if (!item || typeof item !== 'object') return '';
            const asObject = item as Record<string, unknown>;
            const panel = Number(asObject.panel || asObject.panel_index || 0);
            const stage = typeof asObject.stage === 'string' ? asObject.stage.trim() : '';
            const summary = typeof asObject.summary === 'string'
                ? asObject.summary.trim()
                : typeof asObject.description === 'string'
                    ? asObject.description.trim()
                    : typeof asObject.text === 'string'
                        ? asObject.text.trim()
                        : '';
            const segmentIndex = Number(asObject.segment_index || asObject.story_segment_index || 0);
            const visual = typeof asObject.visual_focus === 'string' ? asObject.visual_focus.trim() : '';
            const parts = [];
            if (Number.isFinite(panel) && panel > 0) parts.push(`Panel ${panel}`);
            if (stage) parts.push(stage);
            if (summary) parts.push(summary);
            if (Number.isFinite(segmentIndex) && segmentIndex > 0) parts.push(`segment ${segmentIndex}`);
            if (visual) parts.push(`visual: ${visual}`);
            return parts.join(' | ');
        })
        .filter((item): item is string => item.length > 0);
}

function extractResponseJson(log?: SystemLog): Record<string, unknown> {
    return log?.metadata?.response_json && typeof log.metadata.response_json === 'object'
        ? log.metadata.response_json as Record<string, unknown>
        : {};
}

function extractStorySegments(log?: SystemLog): string[] {
    if (!log) return [];

    const rawSegments = log.metadata?.segments as unknown;
    if (Array.isArray(rawSegments)) {
        return rawSegments
            .map((segment) => {
                if (typeof segment === 'string') return segment.trim();
                if (segment && typeof segment === 'object' && typeof (segment as { text?: unknown }).text === 'string') {
                    return String((segment as { text: string }).text).trim();
                }
                return '';
            })
            .filter((segment): segment is string => segment.length > 0);
    }

    const responseJson = extractResponseJson(log);
    return Array.isArray(responseJson.segments)
        ? (responseJson.segments as unknown[])
            .filter((segment): segment is string => typeof segment === 'string' && segment.trim().length > 0)
        : [];
}

function extractStoryboardArtifacts(log?: SystemLog): SessionStoryboardArtifacts {
    const responseJson = extractResponseJson(log);
    return {
        storySegments: extractStorySegments(log),
        panelPlan: parseTraceList(responseJson.panel_plan),
        segmentVisualMap: parseTraceList(responseJson.segment_visual_map),
        panelCastMap: parseTraceList(responseJson.panel_cast_map),
        imagePromptToken: getPromptTokenFromLog(log) || undefined,
    };
}

function extractReferenceFeatures(log?: SystemLog): Record<string, unknown> | undefined {
    if (!log || !isRecord(log.metadata?.reference_features)) return undefined;
    return log.metadata.reference_features;
}

function extractRawImageMetadata(log?: SystemLog, normalizedGrid?: NormalizedGridSummary): Record<string, unknown> | undefined {
    if (!log) return undefined;
    if (isRecord(log.metadata?.raw_image_metadata)) {
        return log.metadata.raw_image_metadata;
    }

    const fallbackMetadata: Record<string, unknown> = {
        imageResolution: log.metadata?.image_resolution || log.metadata?.imageResolution || null,
        pricingModel: log.metadata?.pricing_model || null,
        pricingRule: log.metadata?.pricing_rule || null,
        estimatedCost: log.metadata?.estimated_cost || null,
        providerResponseId: log.metadata?.provider_response_id || null,
        providerRequestId: log.metadata?.provider_request_id || null,
        providerModel: log.metadata?.provider_model || null,
        requestedModel: log.metadata?.requested_model || null,
        providerModelSource: log.metadata?.provider_model_source || null,
        sourceWidth: normalizedGrid?.sourceWidth || null,
        sourceHeight: normalizedGrid?.sourceHeight || null,
        targetWidth: normalizedGrid?.targetWidth || null,
        targetHeight: normalizedGrid?.targetHeight || null,
        panelSize: normalizedGrid?.panelSize || null,
        columns: normalizedGrid?.columns || null,
        rows: normalizedGrid?.rows || null,
        wasNormalized: normalizedGrid?.wasNormalized ?? null,
        hasResultData: typeof log.metadata?.result_data === 'string' && log.metadata.result_data.length > 0,
    };

    const hasAnyData = Object.values(fallbackMetadata).some((value) => value !== null && value !== false);
    return hasAnyData ? fallbackMetadata : undefined;
}

function buildStoryPagesDocument(title: string, artifacts: SessionStoryboardArtifacts): string {
    if (!artifacts.storySegments.length) return '';

    const lines: string[] = [];
    lines.push(`Title: ${title || '-'}`);
    lines.push('');
    lines.push('Pages / Panels:');

    const panelPlan = artifacts.panelPlan;
    const coverWithTitle = panelPlan[0] || 'Panel 1: Cover with title';
    const coverClean = panelPlan[1] || 'Panel 2: Same cover without title';
    lines.push(coverWithTitle);
    lines.push(coverClean);

    artifacts.storySegments.forEach((segment, segmentIndex) => {
        const panelLine = artifacts.segmentVisualMap[segmentIndex] || `Panel ${segmentIndex + 3}`;
        const planLine = panelPlan[segmentIndex + 2] || '';
        const castLine = artifacts.panelCastMap[segmentIndex] || '';

        lines.push('');
        lines.push(`${panelLine}:`);
        lines.push(`Story text: ${segment}`);
        if (planLine) lines.push(`Plan: ${planLine}`);
        lines.push(`Map: ${panelLine}`);
        if (castLine) lines.push(`Cast: ${castLine}`);
    });

    return lines.join('\n');
}

function summarizeEventData(eventData: Record<string, unknown>): string {
    if (!eventData || Object.keys(eventData).length === 0) return '-';
    const preferredKeys = [
        'scope',
        'target_label',
        'target_track_id',
        'target_id',
        'field_name',
        'field_id',
        'milestone_percent',
        'step',
        'phase',
        'route',
        'parsed_age',
        'extracted_name',
        'text_preview',
        'text_length',
        'source',
    ];
    const chunks = preferredKeys
        .filter((key) => key in eventData)
        .slice(0, 6)
        .map((key) => `${key}: ${String(eventData[key])}`);
    if (chunks.length > 0) return chunks.join(' | ');
    const first = Object.entries(eventData).slice(0, 4).map(([key, value]) => `${key}: ${String(value)}`);
    return first.join(' | ') || '-';
}

const DevDashboard: React.FC = () => {
    const { sessionId, resetSession } = useSessionStore();
    const initialSessionsCacheRef = useRef<DashboardSessionsCache | null>(readDashboardSessionsCache());
    const initialLoadedCoverSessionsRef = useRef<string[]>(readLoadedCoverSessionIds());
    const initialDashboardLoadStartedRef = useRef(false);
    const [sessions, setSessions] = useState<SessionFlow[]>(() => initialSessionsCacheRef.current?.sessions || []);
    const [isLoading, setIsLoading] = useState(() => !initialSessionsCacheRef.current?.sessions?.length);
    const [hasMoreSessions, setHasMoreSessions] = useState(() => initialSessionsCacheRef.current?.hasMoreSessions ?? true);
    const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set([sessionId]));
    const [loadedCoverSessions, setLoadedCoverSessions] = useState<Set<string>>(
        () => new Set([sessionId, ...initialLoadedCoverSessionsRef.current].filter(Boolean))
    );
    const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
    const [verificationByLogKey, setVerificationByLogKey] = useState<Record<string, VerificationResult>>({});
    const [decryptedPromptByLogKey, setDecryptedPromptByLogKey] = useState<Record<string, string>>({});
    const [promptErrorByLogKey, setPromptErrorByLogKey] = useState<Record<string, string>>({});
    const [promptLoadingByLogKey, setPromptLoadingByLogKey] = useState<Record<string, boolean>>({});
    const [sessionCopyStatus, setSessionCopyStatus] = useState<Record<string, 'ok' | 'error'>>({});
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
    const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);
    const [adminPromptKey, setAdminPromptKey] = useState<string>(() => {
        if (typeof window === 'undefined') return '';
        try {
            return window.localStorage.getItem('dev_prompt_admin_key') || '';
        } catch {
            return '';
        }
    });

    const toggleLog = (logId: string) => {
        setExpandedLogs(prev => {
            const newSet = new Set(prev);
            if (newSet.has(logId)) newSet.delete(logId);
            else newSet.add(logId);
            return newSet;
        });
    };

    const copyToClipboard = async (text: string): Promise<boolean> => {
        if (!text) return false;
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch {
            return false;
        }
        return false;
    };

    const verifyAndCopyLog = async (logKey: string, log: SystemLog) => {
        const verify = verifyModelTrace(log);
        const responseId = typeof log.metadata?.provider_response_id === 'string' ? log.metadata.provider_response_id.trim() : '';
        const requestId = typeof log.metadata?.provider_request_id === 'string' ? log.metadata.provider_request_id.trim() : '';
        const idToCopy = responseId || requestId;

        let message = verify.message;
        if (idToCopy) {
            const copied = await copyToClipboard(idToCopy);
            const copiedLabel = responseId ? 'response_id' : 'request_id';
            message = `${message} | ${copied ? `${copiedLabel} הועתק` : `לא הצלחתי להעתיק ${copiedLabel}`}`;
        }

        setVerificationByLogKey((prev) => ({
            ...prev,
            [logKey]: {
                level: verify.level,
                message,
            },
        }));
    };

    const clearAdminPromptKey = () => {
        setAdminPromptKey('');
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.removeItem('dev_prompt_admin_key');
        } catch {
            // ignore storage errors
        }
    };

    const revealImagePrompt = async (logKey: string, promptToken: string) => {
        if (!promptToken) {
            setPromptErrorByLogKey((prev) => ({ ...prev, [logKey]: 'לא נמצא prompt_token בלוג הזה' }));
            return;
        }

        let adminKey = adminPromptKey.trim();
        if (!adminKey) {
            const entered = typeof window !== 'undefined'
                ? window.prompt('הזן DEV_DASHBOARD_PROMPT_KEY להצגת image_prompt') || ''
                : '';
            adminKey = entered.trim();
            if (!adminKey) return;
            setAdminPromptKey(adminKey);
            if (typeof window !== 'undefined') {
                try {
                    window.localStorage.setItem('dev_prompt_admin_key', adminKey);
                } catch {
                    // ignore storage errors
                }
            }
        }

        setPromptLoadingByLogKey((prev) => ({ ...prev, [logKey]: true }));
        setPromptErrorByLogKey((prev) => ({ ...prev, [logKey]: '' }));

        try {
            const response = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    action: 'debugDecryptPrompt',
                    promptToken,
                    adminKey,
                })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const errorCode = String(data?.error || `HTTP_${response.status}`);
                if (errorCode === 'UNAUTHORIZED_DEBUG_KEY') clearAdminPromptKey();
                setPromptErrorByLogKey((prev) => ({ ...prev, [logKey]: errorCode }));
                return;
            }

            const imagePrompt = typeof data?.imagePrompt === 'string' ? data.imagePrompt : '';
            if (!imagePrompt) {
                setPromptErrorByLogKey((prev) => ({ ...prev, [logKey]: 'לא התקבל image_prompt מהשרת' }));
                return;
            }

            setDecryptedPromptByLogKey((prev) => ({ ...prev, [logKey]: imagePrompt }));
        } catch (error: any) {
            setPromptErrorByLogKey((prev) => ({ ...prev, [logKey]: String(error?.message || 'FAILED_TO_DECRYPT_PROMPT') }));
        } finally {
            setPromptLoadingByLogKey((prev) => ({ ...prev, [logKey]: false }));
        }
    };

    const revealImagePromptForLog = async (logKey: string, log: SystemLog) => {
        const promptToken = getPromptTokenFromLog(log);
        await revealImagePrompt(logKey, promptToken);
    };

    const [error, setError] = useState<string | null>(null);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState<DashboardSection>('sessions');
    const [mockModeEnabled, setMockModeEnabled] = useState<boolean>(isMockMode());
    const [sessionTraceFilter, setSessionTraceFilter] = useState<SessionTraceFilter>('all');
    const [sessionsViewMode, setSessionsViewMode] = useState<'simple' | 'forensics'>('simple');
    const [showAllCovers, setShowAllCovers] = useState(false);
    const [visibleSessionCount, setVisibleSessionCount] = useState(DASHBOARD_INITIAL_VISIBLE_SESSIONS);
    const [refreshMode, setRefreshMode] = useState<'recent' | 'full' | 'more' | null>(null);
    const [refreshingSessionId, setRefreshingSessionId] = useState<string | null>(null);
    const [sessionsCachedAt, setSessionsCachedAt] = useState<string | null>(initialSessionsCacheRef.current?.cachedAt || null);
    const [isUsingCachedSessions, setIsUsingCachedSessions] = useState(() => Boolean(initialSessionsCacheRef.current?.sessions?.length));

    const sessionsTokenTotal = useMemo(
        () => sessions.reduce((sum, item) => sum + item.total_tokens, 0),
        [sessions]
    );
    const totalCostUsd = useMemo(
        () => sessions.reduce((sum, item) => sum + item.total_cost_usd, 0),
        [sessions]
    );
    const observedRuntimeModels = useMemo(() => ({
        chat: getLatestObservedRuntime(sessions, 'chat'),
        story: getLatestObservedRuntime(sessions, 'storyGeneration'),
        image: getLatestObservedRuntime(sessions, 'imageGeneration'),
    }), [sessions]);
    const filteredSessions = useMemo(
        () => sessions.filter((session) => {
            const completedLogs = session.logs.filter((log) => log.status !== 'pending');
            if (completedLogs.length === 0) {
                return sessionTraceFilter === 'all';
            }
            return completedLogs.some((log) => matchesTraceFilter(log, sessionTraceFilter));
        }),
        [sessions, sessionTraceFilter]
    );
    const mismatchSessionCount = useMemo(
        () => sessions.filter((session) => session.logs.some((log) => log.status !== 'pending' && matchesTraceFilter(log, 'mismatch'))).length,
        [sessions]
    );
    const fallbackSessionCount = useMemo(
        () => sessions.filter((session) => session.logs.some((log) => log.status !== 'pending' && matchesTraceFilter(log, 'fallback'))).length,
        [sessions]
    );
    const displayedSessions = useMemo(
        () => filteredSessions.slice(0, visibleSessionCount),
        [filteredSessions, visibleSessionCount]
    );
    const remainingSessionsCount = Math.max(filteredSessions.length - displayedSessions.length, 0);

    const getApiHeaders = async (): Promise<Record<string, string>> => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };

        if (!supabase) return headers;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
                headers.Authorization = `Bearer ${session.access_token}`;
            }
        } catch {
            // Keep the dashboard usable even if auth lookup fails.
        }

        return headers;
    };

    const persistDashboardSessions = (nextSessions: SessionFlow[], options?: { hasMoreSessions?: boolean }) => {
        const nextHasMoreSessions = options?.hasMoreSessions ?? hasMoreSessions;
        const cachedAt = writeDashboardSessionsCache(nextSessions, nextHasMoreSessions);
        setSessions(nextSessions);
        setHasMoreSessions(nextHasMoreSessions);
        setSessionsCachedAt(cachedAt);
        setIsUsingCachedSessions(false);
    };

    const mergeSummarySessions = (currentSessions: SessionFlow[], nextSummarySessions: SessionFlow[]) => {
        const mergedByBaseSessionId = new Map<string, SessionFlow>();

        currentSessions.forEach((session) => {
            mergedByBaseSessionId.set(getBaseSessionId(session.session_id), session);
        });

        nextSummarySessions.forEach((summarySession) => {
            const baseSessionId = getBaseSessionId(summarySession.session_id);
            const existingSession = mergedByBaseSessionId.get(baseSessionId);

            if (!existingSession) {
                mergedByBaseSessionId.set(baseSessionId, summarySession);
                return;
            }

            mergedByBaseSessionId.set(baseSessionId, {
                ...summarySession,
                logs: existingSession.logs,
                chat: existingSession.chat,
                titleSuggestions: existingSession.titleSuggestions,
                storyGeneration: existingSession.storyGeneration,
                imageGeneration: existingSession.imageGeneration,
                alternativeTitles: existingSession.alternativeTitles,
                total_cost_usd: existingSession.logs.length > 0 ? existingSession.total_cost_usd : summarySession.total_cost_usd,
                total_tokens: existingSession.logs.length > 0 ? existingSession.total_tokens : summarySession.total_tokens,
                productInfo: {
                    ...summarySession.productInfo,
                    ...existingSession.productInfo,
                    childName: existingSession.productInfo?.childName || summarySession.productInfo?.childName,
                    topic: existingSession.productInfo?.topic || summarySession.productInfo?.topic,
                    artStyle: existingSession.productInfo?.artStyle || summarySession.productInfo?.artStyle,
                    bookTitle: existingSession.productInfo?.bookTitle || summarySession.productInfo?.bookTitle,
                },
                bookAssets: {
                    ...summarySession.bookAssets,
                    ...existingSession.bookAssets,
                    previewImageUrl: summarySession.bookAssets?.previewImageUrl || existingSession.bookAssets?.previewImageUrl,
                    compositeImageUrl: summarySession.bookAssets?.compositeImageUrl || existingSession.bookAssets?.compositeImageUrl,
                },
                analyticsEvents: existingSession.analyticsEvents?.loaded
                    ? existingSession.analyticsEvents
                    : summarySession.analyticsEvents,
                forensics: existingSession.logs.length > 0
                    ? existingSession.forensics
                    : summarySession.forensics,
            });
        });

        return [...mergedByBaseSessionId.values()].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    };

    const fetchRecentDashboardSessions = async (offset: number, limit: number) => {
        const response = await fetch('/api/book', {
            method: 'POST',
            headers: await getApiHeaders(),
            body: JSON.stringify({
                action: 'list_recent_dashboard',
                offset,
                limit,
            }),
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(typeof payload?.error === 'string' ? payload.error : 'שגיאה בטעינת ספרים אחרונים');
        }

        const payload = await response.json().catch(() => null);
        const books = Array.isArray(payload?.books) ? payload.books : [];
        return {
            sessions: books.map((book) => buildSummarySessionFromBook(book)),
            hasMoreSessions: Boolean(payload?.hasMore),
        };
    };

    const groupLogsBySession = (logs: SystemLog[]) => {
        const groupedBySession: Record<string, SystemLog[]> = {};

        for (const log of logs) {
            if (!log.session_id) continue;
            if (!groupedBySession[log.session_id]) groupedBySession[log.session_id] = [];
            groupedBySession[log.session_id].push(log);
        }

        return groupedBySession;
    };

    const splitGroupedSessions = (groupedBySession: Record<string, SystemLog[]>) => {
        const groupedWithSplit: Record<string, SystemLog[]> = {};

        Object.entries(groupedBySession).forEach(([originalId, logs]) => {
            logs.sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());
            let splitIndex = 0;
            let currentBatch: SystemLog[] = [];
            let previousTime = new Date(logs[0]?.created_at || '').getTime();

            logs.forEach((log) => {
                const logTime = new Date(log.created_at || '').getTime();
                if (logTime - previousTime > 15 * 60 * 1000) {
                    const splitId = splitIndex === 0 ? originalId : `${originalId}_split_${splitIndex}`;
                    groupedWithSplit[splitId] = [...currentBatch];
                    splitIndex += 1;
                    currentBatch = [log];
                } else {
                    currentBatch.push(log);
                }
                previousTime = logTime;
            });

            if (currentBatch.length > 0) {
                const splitId = splitIndex === 0 ? originalId : `${originalId}_split_${splitIndex}`;
                groupedWithSplit[splitId] = currentBatch;
            }
        });

        return groupedWithSplit;
    };

    const fetchSessionSupportData = async (
        baseSessionIds: string[],
        { includeAnalytics = false }: { includeAnalytics?: boolean } = {}
    ) => {
        const sessionAssetMap: Record<string, SessionFlow['bookAssets']> = {};
        const sessionAnalyticsMap: Record<string, SessionFlow['analyticsEvents']> = {};

        if (baseSessionIds.length === 0) {
            return { sessionAssetMap, sessionAnalyticsMap };
        }

        if (includeAnalytics) {
            const analyticsResponse = await fetch('/api/analytics-events', {
                method: 'POST',
                headers: await getApiHeaders(),
                body: JSON.stringify({
                    session_ids: baseSessionIds,
                }),
            }).catch(() => null);

            const analyticsPayload = analyticsResponse && analyticsResponse.ok
                ? await analyticsResponse.json().catch(() => null)
                : null;
            const analyticsData = Array.isArray(analyticsPayload?.events) ? analyticsPayload.events : [];

            if (analyticsData.length > 0) {
                for (const event of analyticsData) {
                    const sid = typeof event.session_id === 'string' ? event.session_id : '';
                    if (!sid) continue;
                    if (!sessionAnalyticsMap[sid]) {
                        sessionAnalyticsMap[sid] = createSessionAnalyticsState(true);
                        sessionAnalyticsMap[sid]!.lastAt = event.created_at || undefined;
                    }
                    const key = String(event.event_name || '').trim();
                    if (key) {
                        sessionAnalyticsMap[sid]!.counts[key] = (sessionAnalyticsMap[sid]!.counts[key] || 0) + 1;
                    }

                    sessionAnalyticsMap[sid]!.events.push({
                        event_name: key,
                        created_at: event.created_at || undefined,
                        page: typeof event.page === 'string' ? event.page : undefined,
                        device_type: typeof event.device_type === 'string' ? event.device_type : undefined,
                        event_data: parseAnalyticsEventData(event.event_data),
                    });

                    const currentLast = sessionAnalyticsMap[sid]!.lastAt;
                    if (!currentLast || (event.created_at && new Date(event.created_at).getTime() > new Date(currentLast).getTime())) {
                        sessionAnalyticsMap[sid]!.lastAt = event.created_at || currentLast;
                    }
                }
            }

            baseSessionIds.forEach((baseSessionId) => {
                if (!sessionAnalyticsMap[baseSessionId]) {
                    sessionAnalyticsMap[baseSessionId] = createSessionAnalyticsState(true);
                }
            });

            Object.values(sessionAnalyticsMap).forEach((sessionAnalytics) => {
                sessionAnalytics.ui = buildSessionUiTelemetrySummary(sessionAnalytics.events);
            });
        }

        const booksResponse = await fetch('/api/book', {
            method: 'POST',
            headers: await getApiHeaders(),
            body: JSON.stringify({
                action: 'list_by_session_ids',
                session_ids: baseSessionIds,
            }),
        }).catch(() => null);

        const booksPayload = booksResponse && booksResponse.ok
            ? await booksResponse.json().catch(() => null)
            : null;
        const booksData = Array.isArray(booksPayload?.books) ? booksPayload.books : [];

        for (const book of booksData) {
            const baseSessionId = typeof book?.session_id === 'string' ? book.session_id : '';
            if (!baseSessionId || sessionAssetMap[baseSessionId]) continue;

            sessionAssetMap[baseSessionId] = {
                bookId: typeof book?.bookId === 'string' ? book.bookId : undefined,
                slug: typeof book?.slug === 'string' ? book.slug : undefined,
                title: typeof book?.title === 'string' ? book.title : undefined,
                previewImageUrl: typeof book?.previewImageUrl === 'string' ? book.previewImageUrl : undefined,
                compositeImageUrl: typeof book?.compositeImageUrl === 'string' ? book.compositeImageUrl : undefined,
                segments: parseStringSegments(book?.segments),
                pdfUrl: typeof book?.pdfUrl === 'string' ? book.pdfUrl : undefined,
                pdfFileName: typeof book?.pdfFileName === 'string' ? book.pdfFileName : undefined,
                parentCharacter: typeof book?.parentCharacter === 'string' ? book.parentCharacter : undefined,
                parentName: typeof book?.parentName === 'string' ? book.parentName : undefined,
                paymentStatus: typeof book?.paymentStatus === 'string' ? book.paymentStatus : undefined,
                isUnlocked: typeof book?.isUnlocked === 'boolean' ? book.isUnlocked : undefined,
                email: typeof book?.email === 'string' ? book.email : undefined,
                childName: typeof book?.childName === 'string' ? book.childName : undefined,
                topic: typeof book?.topic === 'string' ? book.topic : undefined,
                artStyle: typeof book?.artStyle === 'string' ? book.artStyle : undefined,
                updated_at: typeof book?.updated_at === 'string' ? book.updated_at : undefined,
                created_at: typeof book?.created_at === 'string' ? book.created_at : undefined,
            };
        }

        return { sessionAssetMap, sessionAnalyticsMap };
    };

    const buildFlowsFromLogs = async (
        logs: SystemLog[],
        { includeAnalytics = false }: { includeAnalytics?: boolean } = {}
    ): Promise<SessionFlow[]> => {
        const groupedBySession = groupLogsBySession(logs);
        const groupedWithSplit = splitGroupedSessions(groupedBySession);
        const baseSessionIds = Object.keys(groupedBySession).filter(Boolean);
        const { sessionAssetMap, sessionAnalyticsMap } = await fetchSessionSupportData(baseSessionIds, { includeAnalytics });

        const flows: SessionFlow[] = Object.entries(groupedWithSplit).map(([id, sessionLogs]) => {
            const sortedLogs = sessionLogs.sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());
            const storyLog = [...sortedLogs].reverse().find((entry) => entry.action_type === 'generateStory' || entry.action_type === 'generate16GridStory');
            const baseSessionId = getBaseSessionId(id);
            const metadata = (storyLog?.metadata ?? {}) as Record<string, unknown>;
            const requestJson = (metadata.request_json && typeof metadata.request_json === 'object'
                ? metadata.request_json
                : {}) as Record<string, unknown>;
            const metadataInputs = (metadata.inputs && typeof metadata.inputs === 'object'
                ? metadata.inputs
                : {}) as Record<string, unknown>;

            const parentName = normalizeCompanionValue(requestJson.parentName)
                || normalizeCompanionValue(metadataInputs.parentName)
                || normalizeCompanionValue(sessionAssetMap[baseSessionId]?.parentName);
            const parentRole = normalizeCompanionValue(requestJson.parentCharacterRole)
                || normalizeCompanionValue(metadataInputs.parentCharacterRole);
            const parentCharacter = normalizeCompanionValue(requestJson.parentCharacter)
                || normalizeCompanionValue(metadataInputs.parentCharacter)
                || normalizeCompanionValue(sessionAssetMap[baseSessionId]?.parentCharacter)
                || normalizeCompanionValue(storyLog?.extra_char_1);

            const thirdCharacter = normalizeCompanionValue(requestJson.thirdCharacter)
                || normalizeCompanionValue(metadataInputs.thirdCharacter)
                || normalizeCompanionValue(storyLog?.extra_char_2);
            const thirdRole = normalizeCompanionValue(requestJson.thirdCharacterRole)
                || normalizeCompanionValue(metadataInputs.thirdCharacterRole);

            const extraChars = collectCompanionNames([
                parentName || parentCharacter || parentRole,
                thirdCharacter || thirdRole,
                storyLog?.extra_char_1,
                storyLog?.extra_char_2,
                requestJson.parentCharacter,
                requestJson.thirdCharacter,
                metadataInputs.parentCharacter,
                metadataInputs.thirdCharacter,
                sessionAssetMap[baseSessionId]?.parentName,
                sessionAssetMap[baseSessionId]?.parentCharacter,
            ]);

            const productInfo = storyLog
                ? {
                    childName: storyLog.child_name,
                    topic: storyLog.topic,
                    artStyle: storyLog.art_style,
                    bookTitle: storyLog.book_title,
                    gender: storyLog.hero_gender,
                    age: storyLog.hero_age,
                    extraChars,
                    parentName,
                    parentRole,
                    thirdRole,
                }
                : {
                    childName: sessionAssetMap[baseSessionId]?.childName,
                    topic: sessionAssetMap[baseSessionId]?.topic,
                    artStyle: sessionAssetMap[baseSessionId]?.artStyle,
                    bookTitle: sessionAssetMap[baseSessionId]?.title,
                    extraChars,
                    parentName,
                    parentRole,
                    thirdRole,
                };

            const costBreakdown = summarizeSessionCost(sortedLogs);
            const latestChatLog = getLatestLogForCategory(sortedLogs, 'chat');
            const latestStoryGenerationLog = getLatestLogForCategory(sortedLogs, 'storyGeneration');
            const latestImageGenerationLog = getLatestLogForCategory(sortedLogs, 'imageGeneration');
            const storyboardArtifacts = extractStoryboardArtifacts(latestStoryGenerationLog);
            const forensics: SessionForensics = {
                costBreakdown,
                referenceTokens: sortedLogs.reduce((sum, entry) => sum + getReferenceAnalysisTokens(entry), 0),
                normalizedGrid: extractNormalizedGrid(latestImageGenerationLog),
                referenceProfiles: extractReferenceProfiles(latestImageGenerationLog),
                artifacts: {
                    ...storyboardArtifacts,
                    storySegments: sessionAssetMap[baseSessionId]?.segments?.length
                        ? sessionAssetMap[baseSessionId]!.segments!
                        : storyboardArtifacts.storySegments,
                },
                runtime: {
                    chat: getRuntimeModelSnapshot(latestChatLog),
                    story: getRuntimeModelSnapshot(latestStoryGenerationLog),
                    image: getRuntimeModelSnapshot(latestImageGenerationLog),
                },
            };

            return {
                session_id: id,
                started_at: sortedLogs[0]?.created_at || '',
                logs: sortedLogs,
                chat: sortedLogs.filter((entry) => categorizeLog(entry) === 'chat'),
                titleSuggestions: sortedLogs.filter((entry) => categorizeLog(entry) === 'titleSuggestions'),
                storyGeneration: sortedLogs.filter((entry) => categorizeLog(entry) === 'storyGeneration'),
                imageGeneration: sortedLogs.filter((entry) => categorizeLog(entry) === 'imageGeneration'),
                alternativeTitles: sortedLogs.filter((entry) => categorizeLog(entry) === 'alternativeTitles'),
                total_cost_usd: costBreakdown.total,
                total_tokens: sortedLogs.reduce((sum, entry) => sum + getForensicTokenCount(entry), 0),
                productInfo,
                bookAssets: sessionAssetMap[baseSessionId],
                analyticsEvents: includeAnalytics
                    ? (sessionAnalyticsMap[baseSessionId] || createSessionAnalyticsState(true))
                    : createSessionAnalyticsState(false),
                forensics,
            };
        });

        return flows.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    };

    const replaceSessionsByBaseSessionId = (currentSessions: SessionFlow[], nextSessions: SessionFlow[]) => {
        const affectedBaseSessionIds = new Set(nextSessions.map((item) => getBaseSessionId(item.session_id)));
        const nextSessionsWithPreservedAnalytics = nextSessions.map((item) => {
            if (item.analyticsEvents?.loaded) {
                return item;
            }

            const preservedAnalytics = currentSessions.find(
                (currentItem) => getBaseSessionId(currentItem.session_id) === getBaseSessionId(item.session_id) && currentItem.analyticsEvents?.loaded
            )?.analyticsEvents;

            return preservedAnalytics
                ? {
                    ...item,
                    analyticsEvents: preservedAnalytics,
                }
                : item;
        });

        const merged = currentSessions
            .filter((item) => !affectedBaseSessionIds.has(getBaseSessionId(item.session_id)))
            .concat(nextSessionsWithPreservedAnalytics);
        return merged.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    };

    const loadAllSessions = async ({
        showLoading = true,
        limit = DASHBOARD_INITIAL_VISIBLE_SESSIONS,
    }: { showLoading?: boolean; limit?: number } = {}) => {
        if (showLoading) {
            setIsLoading(true);
        }
        setRefreshMode('full');
        setError(null);

        try {
            const { sessions: recentSessions, hasMoreSessions: nextHasMoreSessions } = await fetchRecentDashboardSessions(0, limit);
            const mergedSessions = mergeSummarySessions(sessions, recentSessions).slice(0, Math.max(limit, recentSessions.length));
            persistDashboardSessions(mergedSessions, { hasMoreSessions: nextHasMoreSessions });
            setVisibleSessionCount(Math.min(Math.max(limit, DASHBOARD_INITIAL_VISIBLE_SESSIONS), Math.max(mergedSessions.length, DASHBOARD_INITIAL_VISIBLE_SESSIONS)));
        } catch (err: any) {
            setError(err?.message || 'שגיאה בטעינת נתונים');
        } finally {
            setIsLoading(false);
            setRefreshMode(null);
        }
    };

    const loadRecentSessions = async () => {
        setError(null);

        if (sessions.length === 0) {
            await loadAllSessions();
            return;
        }

        setRefreshMode('recent');

        try {
            const { sessions: recentSessions, hasMoreSessions: nextHasMoreSessions } = await fetchRecentDashboardSessions(0, DASHBOARD_INITIAL_VISIBLE_SESSIONS);
            const mergedSessions = mergeSummarySessions(sessions, recentSessions);
            persistDashboardSessions(mergedSessions, {
                hasMoreSessions: nextHasMoreSessions || mergedSessions.length > DASHBOARD_INITIAL_VISIBLE_SESSIONS,
            });
        } catch (err: any) {
            setError(err?.message || 'שגיאה בבדיקת סשנים חדשים');
        } finally {
            setRefreshMode(null);
        }
    };

    const loadMoreSessions = async () => {
        if (displayedSessions.length < filteredSessions.length) {
            setVisibleSessionCount((prev) => Math.min(prev + DASHBOARD_LOAD_MORE_STEP, filteredSessions.length));
            return;
        }

        if (!hasMoreSessions) {
            return;
        }

        setRefreshMode('more');
        setError(null);

        try {
            const { sessions: nextSummarySessions, hasMoreSessions: nextHasMoreSessions } = await fetchRecentDashboardSessions(sessions.length, DASHBOARD_LOAD_MORE_STEP);
            if (nextSummarySessions.length === 0) {
                persistDashboardSessions(sessions, { hasMoreSessions: false });
                return;
            }

            const mergedSessions = mergeSummarySessions(sessions, nextSummarySessions);
            persistDashboardSessions(mergedSessions, { hasMoreSessions: nextHasMoreSessions });
            setVisibleSessionCount((prev) => prev + nextSummarySessions.length);
        } catch (err: any) {
            setError(err?.message || 'שגיאה בטעינת ספרים נוספים');
        } finally {
            setRefreshMode(null);
        }
    };

    const refreshSingleSession = async (session: SessionFlow) => {
        setRefreshingSessionId(session.session_id);
        setError(null);

        try {
            const baseSessionId = getBaseSessionId(session.session_id);
            if (!baseSessionId || baseSessionId.startsWith('book:')) {
                return;
            }
            const response = await fetch(`/api/system-logs?sessionId=${encodeURIComponent(baseSessionId)}`, {
                headers: await getApiHeaders(),
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => null);
                throw new Error(typeof payload?.error === 'string' ? payload.error : 'שגיאה ברענון סשן');
            }

            const payload = await response.json().catch(() => null);
            const refreshedFlows = await buildFlowsFromLogs(Array.isArray(payload?.logs) ? payload.logs : [], { includeAnalytics: true });
            if (refreshedFlows.length === 0) return;

            const detailedSessions = replaceSessionsByBaseSessionId(sessions, refreshedFlows);
            persistDashboardSessions(detailedSessions);
        } catch (err: any) {
            setError(err?.message || 'שגיאה ברענון סשן');
        } finally {
            setRefreshingSessionId(null);
        }
    };

    useEffect(() => {
        if (initialDashboardLoadStartedRef.current) return;
        if (!initialSessionsCacheRef.current?.sessions?.length) {
            initialDashboardLoadStartedRef.current = true;
            void loadAllSessions();
        }
    }, []);

    useEffect(() => {
        setLoadedCoverSessions((prev) => {
            if (prev.has(sessionId)) return prev;
            const next = new Set(prev);
            next.add(sessionId);
            return next;
        });
    }, [sessionId]);

    const revealCoverForSession = (sessionKey: string) => {
        setLoadedCoverSessions((prev) => {
            if (prev.has(sessionKey)) return prev;
            const next = new Set(prev);
            next.add(sessionKey);
            writeLoadedCoverSessionIds(next);
            return next;
        });
    };

    const clearCachedSessions = () => {
        clearDashboardSessionsCache();
        clearLoadedCoverSessionIds();
        setSessions([]);
        setSessionsCachedAt(null);
        setIsUsingCachedSessions(false);
        setHasMoreSessions(true);
        setVisibleSessionCount(DASHBOARD_INITIAL_VISIBLE_SESSIONS);
        setLoadedCoverSessions(new Set([sessionId].filter(Boolean)));
    };

    const toggleSession = (id: string) => {
        const targetSession = sessions.find((session) => session.session_id === id);
        const isOpeningSession = !expandedSessions.has(id);

        setExpandedSessions((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        revealCoverForSession(id);

        if (isOpeningSession && targetSession && targetSession.logs.length === 0 && refreshingSessionId !== id) {
            void refreshSingleSession(targetSession);
        }
    };

    const deleteSessionBook = async (session: SessionFlow) => {
        const slug = getTrimmedString(session.bookAssets?.slug);
        if (!slug) return;

        if (confirmDeleteSessionId !== session.session_id) {
            setConfirmDeleteSessionId(session.session_id);
            return;
        }

        setDeletingSessionId(session.session_id);
        setError(null);

        try {
            const accessToken = getBookToken(slug);
            const response = await fetch('/api/delete-book', {
                method: 'POST',
                headers: await getApiHeaders(),
                body: JSON.stringify({
                    bookSlug: slug,
                    accessToken,
                }),
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(typeof payload?.error === 'string' ? payload.error : 'שגיאה במחיקת הספר');
            }

            removeBookOwnership(slug);
            setExpandedSessions((prev) => {
                const next = new Set(prev);
                next.delete(session.session_id);
                return next;
            });
            setLoadedCoverSessions((prev) => {
                const next = new Set(prev);
                next.delete(session.session_id);
                writeLoadedCoverSessionIds(next);
                return next;
            });

            const nextSessions = sessions.filter((item) => item.session_id !== session.session_id);
            persistDashboardSessions(nextSessions, { hasMoreSessions });
        } catch (err: any) {
            setError(err?.message || 'שגיאה במחיקת הספר');
        } finally {
            setDeletingSessionId(null);
            setConfirmDeleteSessionId(null);
        }
    };

    useEffect(() => {
        setVisibleSessionCount((prev) => {
            const nextVisibleCount = Math.max(DASHBOARD_INITIAL_VISIBLE_SESSIONS, prev);
            return Math.min(nextVisibleCount, Math.max(filteredSessions.length, DASHBOARD_INITIAL_VISIBLE_SESSIONS));
        });
    }, [filteredSessions.length]);

    const formatDateTime = (dateStr: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('he-IL', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatTime = (dateStr: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleTimeString('he-IL', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    const getCategoryTotal = (logs: SystemLog[]) => ({
        cost_usd: logs.reduce((sum, entry) => sum + getForensicCost(entry), 0),
        tokens: logs.reduce((sum, entry) => sum + getForensicTokenCount(entry), 0),
        count: logs.length,
    });

    const buildFullSessionLogText = (session: SessionFlow): string => {
        const lines: string[] = [];
        const journey = buildJourneySnapshot(session);
        const journeyCounts = journey.counts;
        const journeyStatus = journey;
        const analyticsTimeline = session.analyticsEvents?.events || [];
        const uiTelemetry = session.analyticsEvents?.ui || emptySessionUiTelemetrySummary();
        const companionNames = collectCompanionNames([
            ...(session.productInfo?.extraChars || []),
            session.productInfo?.parentName,
            session.productInfo?.parentRole,
            session.productInfo?.thirdRole,
            session.bookAssets?.parentName,
            session.bookAssets?.parentCharacter,
        ]);
        const paymentStatus = `${session.bookAssets?.paymentStatus || 'לא ידוע'}${session.bookAssets?.isUnlocked ? ' · פתוח' : ' · נעול'}`;

        lines.push('Cover Preview');
        lines.push(formatDateTime(session.started_at));
        lines.push('');
        lines.push(`מזהה: ${session.session_id}`);
        lines.push('');

        if (session.productInfo?.topic) {
            lines.push(session.productInfo.topic);
            lines.push('');
        }

        lines.push(`סטטוס תשלום: ${paymentStatus}`);
        lines.push(`מסע משתמש: הגיע עד ${journeyStatus.reachedLabel}${journeyStatus.isComplete ? ' · מלא' : ''}`);
        if (session.productInfo?.childName) {
            lines.push(`${session.productInfo.childName}${session.productInfo.age ? ` (גיל ${session.productInfo.age})` : ''}`);
        }
        if (session.productInfo?.artStyle) lines.push(session.productInfo.artStyle);
        companionNames.forEach((name) => lines.push(name));
        lines.push(' PDF');
        lines.push(' Image');
        lines.push('סגור פירוט');
        lines.push(`${session.logs.length} קריאות • ${session.total_tokens.toLocaleString()} טוקנים`);
        lines.push('');
        lines.push(`₪${formatIlsCost(session.total_cost_usd * USD_TO_ILS)}`);
        lines.push('');
        lines.push(`$${formatUsdCost(session.total_cost_usd)}`);
        lines.push('');
        if (session.forensics) {
            lines.push('Forensics Summary');
            lines.push(
                `Cost breakdown | chat: $${formatUsdCost(session.forensics.costBreakdown.chat)} | story: $${formatUsdCost(session.forensics.costBreakdown.story)} | image: $${formatUsdCost(session.forensics.costBreakdown.image)} | reference: $${formatUsdCost(session.forensics.costBreakdown.reference)} | total: $${formatUsdCost(session.forensics.costBreakdown.total)}`
            );
            lines.push(`Journey source | ${journey.sourceLabel}`);
            if (session.forensics.runtime.chat) {
                lines.push(`Chat runtime | requested: ${session.forensics.runtime.chat.requestedModel || '-'} | provider: ${session.forensics.runtime.chat.providerModel || '-'} | source: ${session.forensics.runtime.chat.providerModelSource || '-'}`);
            }
            if (session.forensics.runtime.story) {
                lines.push(`Story runtime | requested: ${session.forensics.runtime.story.requestedModel || '-'} | provider: ${session.forensics.runtime.story.providerModel || '-'} | source: ${session.forensics.runtime.story.providerModelSource || '-'}`);
            }
            if (session.forensics.runtime.image) {
                lines.push(`Image runtime | requested: ${session.forensics.runtime.image.requestedModel || '-'} | provider: ${session.forensics.runtime.image.providerModel || '-'} | billing: ${session.forensics.runtime.image.billingModel || '-'} | source: ${session.forensics.runtime.image.providerModelSource || '-'}`);
            }
            if (session.forensics.normalizedGrid) {
                const grid = session.forensics.normalizedGrid;
                lines.push(
                    `Grid | raw: ${grid.sourceWidth || '-'}x${grid.sourceHeight || '-'} | final: ${grid.targetWidth || '-'}x${grid.targetHeight || '-'} | layout: ${grid.columns || '-'}x${grid.rows || '-'} | panel: ${grid.panelSize || '-'} | normalized: ${grid.wasNormalized ? 'yes' : 'no'}`
                );
            }
            if (session.forensics.referenceProfiles.length > 0) {
                lines.push(`Reference analysis (${session.forensics.referenceProfiles.length})`);
                session.forensics.referenceProfiles.forEach((profile) => {
                    const detailParts = [
                        profile.characterType ? `type=${profile.characterType}` : '',
                        profile.subjectType ? `subject=${profile.subjectType}` : '',
                        profile.model ? `model=${profile.model}` : '',
                        profile.glasses ? `glasses=${profile.glasses}` : '',
                        profile.facialHair ? `facialHair=${profile.facialHair}` : '',
                    ].filter(Boolean);
                    lines.push(`- ${profile.slot}: ${profile.summary || '-'}${detailParts.length ? ` | ${detailParts.join(' | ')}` : ''}`);
                    if (profile.identityAnchors.length > 0) {
                        lines.push(`  anchors: ${profile.identityAnchors.join(', ')}`);
                    }
                });
            }
            if (session.forensics.artifacts.storySegments.length > 0) {
                lines.push(`Story pages (${session.forensics.artifacts.storySegments.length})`);
                session.forensics.artifacts.storySegments.forEach((segment, segmentIndex) => {
                    lines.push(`${segmentIndex + 1}. ${segment}`);
                });
            }
            if (session.forensics.artifacts.imagePromptToken) {
                lines.push(`Image prompt token | ${session.forensics.artifacts.imagePromptToken}`);
            }
            lines.push('');
        }
        lines.push('אירועי מסע משתמש');
        lines.push('');
        lines.push(
            journeyStatus.isComplete
                ? `הגיע עד: ${journeyStatus.reachedLabel}`
                : `הגיע עד: ${journeyStatus.reachedLabel}|חסר: ${journeyStatus.missingLabels.join(', ')}`
        );

        Object.entries(journeyCounts).forEach(([eventName, count]) => {
            lines.push(`${eventName}: ${count}`);
        });

        lines.push('Clicks');
        lines.push(String(uiTelemetry.totalClicks));
        lines.push('Targets');
        lines.push(String(uiTelemetry.uniqueClickTargets));
        lines.push('Inputs');
        lines.push(String(uiTelemetry.totalInputs));
        lines.push('Scroll Events');
        lines.push(String(uiTelemetry.totalScrollEvents));
        lines.push('Window Scroll Max');
        lines.push(`${uiTelemetry.maxWindowScrollMilestone}%`);
        lines.push('Chat Scroll Max');
        lines.push(`${uiTelemetry.maxChatScrollMilestone}%`);
        lines.push(`כפתורים/יעדים הכי נלחצים (${uiTelemetry.topClickTargets.length})`);
        uiTelemetry.topClickTargets.forEach((target) => {
            lines.push(`${target.label}: ${target.count}`);
        });
        lines.push(`ציר זמן אירועים מלא (${analyticsTimeline.length})`);
        analyticsTimeline.forEach((event, index) => {
            const eventData = parseAnalyticsEventData(event.event_data);
            lines.push(
                `${index + 1}. ${formatTime(event.created_at || '')} | ${event.event_name || '-'} | page=${event.page || '-'} | device=${event.device_type || '-'}`
            );
            lines.push(`summary: ${summarizeEventData(eventData)}`);
            lines.push(stringifyMetadata(eventData));
        });

        const exportCategories: Array<[LogCategory, SystemLog[]]> = [
            ['chat', session.chat],
            ['titleSuggestions', session.titleSuggestions],
            ['storyGeneration', session.storyGeneration],
            ['imageGeneration', session.imageGeneration],
            ['alternativeTitles', session.alternativeTitles],
        ];

        exportCategories.forEach(([category, logs]) => {
            if (!logs.length) return;
            const visibleLogs = logs.filter((entry) => entry.status !== 'pending');
            const pendingCount = logs.length - visibleLogs.length;
            if (!visibleLogs.length && pendingCount === 0) return;

            const totals = getCategoryTotal(visibleLogs);
            lines.push('');
            lines.push(categoryConfig[category].label);
            lines.push(
                `${totals.count} פעולות | ${totals.tokens.toLocaleString()} טוקנים | $${formatUsdCost(totals.cost_usd)}${pendingCount > 0 ? ` | pending ${pendingCount}` : ''}`
            );
            lines.push('לחץ לפתיחה / סגירה');
            lines.push('Time\tModel\tIn\tOut\tCost\tActions');

            visibleLogs.forEach((log) => {
                const requestedModel = typeof log.metadata?.requested_model === 'string' ? log.metadata.requested_model : '';
                const providerModel = typeof log.metadata?.provider_model === 'string' ? log.metadata.provider_model : '';
                const providerModelSource = typeof log.metadata?.provider_model_source === 'string' ? log.metadata.provider_model_source : '';
                const providerResponseId = typeof log.metadata?.provider_response_id === 'string' ? log.metadata.provider_response_id : '';
                const preflight = (log.metadata?.preflight && typeof log.metadata.preflight === 'object')
                    ? log.metadata.preflight as Record<string, unknown>
                    : null;
                const preflightEnabled = !!preflight && preflight.enabled === true;
                const preflightApplied = !!preflight && preflight.applied === true;
                const preflightRiskCount = preflight && Array.isArray(preflight.risk_flags)
                    ? preflight.risk_flags.length
                    : 0;
                const preflightRuleCount = preflight && typeof preflight.hard_constraint_count === 'number'
                    ? Number(preflight.hard_constraint_count)
                    : 0;
                const preflightError = preflight && typeof preflight.error === 'string' ? preflight.error : '';

                lines.push(
                    `${formatTime(log.created_at || '')}\t${log.model_name || '-'}\t${log.input_tokens.toLocaleString()}\t${log.output_tokens.toLocaleString()}\t₪${formatIlsCost(recalculateCost(log) * USD_TO_ILS)}\tVerify`
                );
                lines.push(`פעולה: ${getActionDisplayLabel(log.action_type)}`);
                lines.push(`תפקיד: ${getModelRoleLabel(log.action_type)}`);
                if (requestedModel) lines.push(`requested: ${requestedModel}`);
                if (providerModel) lines.push(`provider: ${providerModel}`);
                if (providerModelSource) lines.push(`provider_source: ${providerModelSource}`);
                if (providerResponseId) lines.push(`response_id: ${providerResponseId}`);
                if (preflightEnabled) {
                    lines.push(
                        `preflight: ${preflightError ? `error (${preflightError})` : (preflightApplied ? `applied | risks:${preflightRiskCount} | rules:${preflightRuleCount}` : 'enabled | no changes')}`
                    );
                }
                lines.push(`חיוב: ${resolveBillingModel(log.model_name, String(log.model_name || '').toLowerCase().includes('image') || String(log.model_name || '').toLowerCase().includes('scene-render')) || 'לא מזוהה'}`);

                const responseJson = (log.metadata?.response_json && typeof log.metadata.response_json === 'object')
                    ? log.metadata.response_json as Record<string, unknown>
                    : {};
                const rawSegments = log.metadata?.segments as unknown;
                const storySegments = Array.isArray(rawSegments)
                    ? rawSegments
                        .map((segment) => {
                            if (typeof segment === 'string') return segment;
                            if (segment && typeof segment === 'object' && typeof (segment as { text?: unknown }).text === 'string') {
                                return (segment as { text: string }).text;
                            }
                            return '';
                        })
                        .filter((segment): segment is string => Boolean(segment && segment.trim().length > 0))
                    : [];
                const panelPlan = parseTraceList(responseJson.panel_plan);
                const segmentVisualMap = parseTraceList(responseJson.segment_visual_map);
                const panelCastMap = parseTraceList(responseJson.panel_cast_map);
                if (storySegments.length > 0) {
                    lines.push('Story Segments:');
                    storySegments.forEach((line, segmentIndex) => lines.push(`${segmentIndex + 1}. ${line}`));
                }
                if (panelPlan.length > 0) {
                    lines.push('Panel Plan (מה תוכנן לכל ריבוע)');
                    panelPlan.forEach((line) => lines.push(line));
                }
                if (segmentVisualMap.length > 0) {
                    lines.push('Segment Visual Map (שורה בסיפור ↔ תמונה)');
                    segmentVisualMap.forEach((line) => lines.push(line));
                }
                if (panelCastMap.length > 0) {
                    lines.push('Panel Cast Map (מי מופיע בכל תמונה)');
                    panelCastMap.forEach((line) => lines.push(line));
                }
                lines.push('מידע');
                lines.push(stringifyMetadata(log.metadata));
            });
        });

        return lines.join('\n');
    };

    const buildFullSessionExportText = (session: SessionFlow): string => {
        const journey = buildJourneySnapshot(session);
        const latestImageLog = getLatestLogForCategory(session.logs, 'imageGeneration');
        const latestStoryLog = getLatestLogForCategory(session.logs, 'storyGeneration');
        const companionNames = collectCompanionNames([
            ...(session.productInfo?.extraChars || []),
            session.productInfo?.parentName,
            session.productInfo?.parentRole,
            session.productInfo?.thirdRole,
            session.bookAssets?.parentName,
            session.bookAssets?.parentCharacter,
        ]);
        const storyTitle = session.productInfo?.bookTitle || session.bookAssets?.title || session.session_id;
        const rawImageCost = toFiniteNumber(latestImageLog?.metadata?.estimated_cost);
        const rawImagePricingModel = typeof latestImageLog?.metadata?.pricing_model === 'string' ? latestImageLog.metadata.pricing_model : undefined;
        const rawImagePricingRule = typeof latestImageLog?.metadata?.pricing_rule === 'string' ? latestImageLog.metadata.pricing_rule : undefined;
        const rawImageProviderResponseId = typeof latestImageLog?.metadata?.provider_response_id === 'string' ? latestImageLog.metadata.provider_response_id : undefined;
        const referenceFeaturesDocument = stringifyMetadata(
            extractReferenceFeatures(latestImageLog) || session.forensics?.referenceProfiles || []
        );
        const normalizedGridDocument = stringifyMetadata(session.forensics?.normalizedGrid || {});
        const rawImageMetadataDocument = stringifyMetadata(
            extractRawImageMetadata(latestImageLog, session.forensics?.normalizedGrid) || {}
        );
        const costBreakdownDocument = stringifyMetadata({
            currency: {
                usdToIls: USD_TO_ILS,
            },
            totals: {
                costUsd: session.forensics?.costBreakdown.total || session.total_cost_usd,
                costIls: Number(((session.forensics?.costBreakdown.total || session.total_cost_usd) * USD_TO_ILS).toFixed(6)),
            },
            byCategory: session.forensics?.costBreakdown || {},
            image: latestImageLog ? {
                pricingModel: rawImagePricingModel || null,
                pricingRule: rawImagePricingRule || null,
                estimatedCostUsd: rawImageCost ?? null,
                providerResponseId: rawImageProviderResponseId || null,
            } : null,
        });
        const storyPagesDocument = buildStoryPagesDocument(storyTitle, session.forensics?.artifacts || {
            storySegments: [],
            panelPlan: [],
            segmentVisualMap: [],
            panelCastMap: [],
        });
        const sessionPromptToken = session.forensics?.artifacts.imagePromptToken || getPromptTokenFromLog(latestImageLog);
        const sessionPromptKey = sessionPromptToken ? `session-prompt:${session.session_id}` : '';
        const decryptedSessionPrompt = sessionPromptKey ? decryptedPromptByLogKey[sessionPromptKey] : '';
        const sessionArtifactBundle = stringifyMetadata({
            sessionId: session.session_id,
            startedAt: session.started_at,
            title: storyTitle,
            topic: session.productInfo?.topic,
            artStyle: session.productInfo?.artStyle,
            characters: {
                primary: session.productInfo?.childName,
                companions: companionNames,
            },
            costBreakdown: session.forensics?.costBreakdown,
            normalizedGrid: session.forensics?.normalizedGrid,
            runtime: session.forensics?.runtime,
            referenceProfiles: session.forensics?.referenceProfiles,
            storyboardArtifacts: session.forensics?.artifacts,
            storyPages: session.forensics?.artifacts.storySegments || [],
            journey: {
                reachedLabel: journey.reachedLabel,
                missingLabels: journey.missingLabels,
                sourceLabel: journey.sourceLabel,
                counts: journey.counts,
            },
            rawImage: latestImageLog ? {
                pricingModel: rawImagePricingModel,
                pricingRule: rawImagePricingRule,
                estimatedCost: rawImageCost,
                providerResponseId: rawImageProviderResponseId,
                rawMetadata: extractRawImageMetadata(latestImageLog, session.forensics?.normalizedGrid) || null,
                requestedModel: latestImageLog.metadata?.requested_model,
                providerModel: latestImageLog.metadata?.provider_model,
                providerModelSource: latestImageLog.metadata?.provider_model_source,
            } : null,
            latestStoryLogMetadata: latestStoryLog?.metadata || null,
            latestImageLogMetadata: latestImageLog?.metadata || null,
        });

        const sections = [
            '=== FULL SESSION LOG ===',
            buildFullSessionLogText(session),
            '',
            '=== STORY-PAGES.TXT ===',
            storyPagesDocument || 'אין נתונים',
            '',
            '=== COST-BREAKDOWN.JSON ===',
            costBreakdownDocument,
            '',
            '=== NORMALIZED-GRID.JSON ===',
            normalizedGridDocument,
            '',
            '=== RAW-IMAGE-METADATA.JSON ===',
            rawImageMetadataDocument,
            '',
            '=== REFERENCE-FEATURES.JSON ===',
            referenceFeaturesDocument,
            '',
            '=== TRACE.JSON / SESSION BUNDLE ===',
            sessionArtifactBundle,
            '',
            '=== IMAGE-PROMPT.TXT ===',
            decryptedSessionPrompt || `Prompt token only: ${session.forensics?.artifacts.imagePromptToken || 'לא נשמר'}`,
        ];

        return sections.join('\n');
    };

    const copyFullSessionLog = async (session: SessionFlow) => {
        const payload = buildFullSessionExportText(session);
        const copied = await copyToClipboard(payload);
        setSessionCopyStatus((prev) => ({
            ...prev,
            [session.session_id]: copied ? 'ok' : 'error',
        }));
        window.setTimeout(() => {
            setSessionCopyStatus((prev) => {
                const next = { ...prev };
                delete next[session.session_id];
                return next;
            });
        }, 2500);
    };

    const downloadFromUrl = (url: string, filename: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const downloadBlob = (blob: Blob, filename: string) => {
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
    };

    const resolveStoryForSessionPdf = (session: SessionFlow): Story | null => {
        const preferredBookImageUrl = getSessionPreferredImageUrl(session.bookAssets);
        const previewBookImageUrl = getSessionPreviewImageUrl(session.bookAssets) || preferredBookImageUrl;
        const imageLog = [...session.imageGeneration].reverse().find((entry) => entry.metadata?.result_data);
        const storyLog = [...session.storyGeneration].reverse().find((entry) => entry.metadata?.segments);
        const logImageUrl = pickBestImageAssetUrl(imageLog?.metadata?.result_data);
        const sourceImageUrl = imageLog?.metadata?.mock_image_mode && logImageUrl
            ? logImageUrl
            : pickBestImageAssetUrl(preferredBookImageUrl, previewBookImageUrl, logImageUrl);
        const displayImageUrl = imageLog?.metadata?.mock_image_mode
            ? pickBestImageAssetUrl(previewBookImageUrl, preferredBookImageUrl, logImageUrl)
            : pickBestImageAssetUrl(previewBookImageUrl, logImageUrl, preferredBookImageUrl);
        const compositeImageUrl = pickBestImageAssetUrl(logImageUrl, preferredBookImageUrl, previewBookImageUrl, sourceImageUrl);

        if (
            typeof sourceImageUrl !== 'string' ||
            !sourceImageUrl ||
            (!sourceImageUrl.startsWith('http') && !sourceImageUrl.startsWith('data:image') && !sourceImageUrl.startsWith('/'))
        ) {
            return null;
        }

        const rawSegments = Array.isArray(session.bookAssets?.segments) && session.bookAssets.segments.length > 0
            ? session.bookAssets.segments
            : storyLog?.metadata?.segments;
        const segments = Array.isArray(rawSegments)
            ? rawSegments.filter((item): item is string => typeof item === 'string')
            : (typeof rawSegments === 'string'
                ? (() => {
                    try {
                        const parsed = JSON.parse(rawSegments);
                        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
                    } catch {
                        return [];
                    }
                })()
                : []);

        if (!segments.length) return null;

        return {
            title: session.bookAssets?.title || session.productInfo?.bookTitle || `story-${session.session_id}`,
            heroName: session.productInfo?.childName || '',
            segments,
            composite_image_url: compositeImageUrl || sourceImageUrl,
            source_image_url: sourceImageUrl,
            display_image_url: displayImageUrl || sourceImageUrl,
            is_unlocked: true,
        };
    };

    const openTarget = (node: SitemapNode) => {
        if (node.href) {
            window.open(node.href, '_blank', 'noopener,noreferrer');
        }
    };

    const toggleMockMode = () => {
        if (mockModeEnabled) {
            clearMockMode();
            setMockModeEnabled(false);
            return;
        }
        setMockMode();
        setMockModeEnabled(true);
    };

    const generatePDFFromSession = async (session: SessionFlow) => {
        setIsGeneratingPDF(session.session_id);

        try {
            const storyForPdf = resolveStoryForSessionPdf(session);
            if (!storyForPdf) {
                alert('חסרים נתונים ליצירת PDF');
                setIsGeneratingPDF(null);
                return;
            }

            const { blob, fileName } = await createPdfBackupBlob(storyForPdf);
            downloadBlob(blob, fileName);
        } catch (e) {
            console.error('PDF generation failed:', e);
            alert('שגיאה ביצירת ה-PDF');
        } finally {
            setIsGeneratingPDF(null);
        }
    };

    const renderCategory = (category: LogCategory, logs: SystemLog[], sessionKey: string) => {
        if (!logs.length) return null;
        const config = categoryConfig[category];
        const Icon = config.icon;
        const relevantLogs = sessionTraceFilter === 'all'
            ? logs
            : logs.filter((entry) => matchesTraceFilter(entry, sessionTraceFilter));
        const visibleLogs = relevantLogs.filter((entry) => entry.status !== 'pending');
        const pendingCount = relevantLogs.length - visibleLogs.length;
        if (!visibleLogs.length && pendingCount === 0) return null;
        const totals = getCategoryTotal(visibleLogs);
        const defaultOpen = sessionsViewMode === 'forensics' && (category === 'storyGeneration' || category === 'imageGeneration');

        return (
            <details
                key={`${sessionKey}-${category}`}
                className="bg-white border border-[#dfe6ec] shadow-sm mb-4 rounded-md overflow-hidden group"
                open={defaultOpen}
            >
                <summary className="dev-collapsible-summary list-none cursor-pointer px-5 py-4 bg-[#f5f7fa] flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <span className="rounded-[4px] bg-white border border-[#dfe6ec] p-2 text-[#409eff]">
                            <Icon size={16} />
                        </span>
                        <div className="text-[18px] font-bold text-[#303133]">{config.label}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[16px] font-semibold text-[#909399] tabular-nums">
                            {totals.count} פעולות | {totals.tokens.toLocaleString()} טוקנים | ${formatUsdCost(totals.cost_usd)}
                            {pendingCount > 0 ? ` | pending ${pendingCount}` : ''}
                        </div>
                        <div className="text-[12px] text-[#b0b3b8]">לחץ לפתיחה / סגירה</div>
                    </div>
                </summary>

                <div className="overflow-x-auto border-t border-[#dfe6ec]">
                    <table className="w-full text-left border-collapse rtl:text-right text-[17px] text-[#606266]">
                        <thead className="text-[#909399] border-b border-[#dfe6ec] bg-[#fafafa]">
                            <tr>
                                <th className="py-3 px-5 font-semibold text-[19px]">שעה</th>
                                <th className="py-3 px-5 font-semibold text-[19px]">מודל</th>
                                <th className="py-3 px-5 font-semibold text-[19px] text-center">קלט</th>
                                <th className="py-3 px-5 font-semibold text-[19px] text-center">פלט</th>
                                <th className="py-3 px-5 font-semibold text-[19px] text-center">עלות</th>
                                <th className="py-3 px-5 font-semibold text-[19px] text-center">פעולות</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleLogs.map((log, index) => {
                                const logKey = `${sessionKey}-${category}-${index}`;
                                const isLogExpanded = expandedLogs.has(logKey);
                                const verification = verificationByLogKey[logKey];
                                const decryptedImagePrompt = decryptedPromptByLogKey[logKey];
                                const promptError = promptErrorByLogKey[logKey];
                                const isPromptLoading = !!promptLoadingByLogKey[logKey];
                                const promptToken = getPromptTokenFromLog(log);
                                const canRevealPrompt =
                                    (log.action_type === 'generateStory' || log.action_type === 'generate16GridStory') &&
                                    !!promptToken;
                                const resultData = log.metadata?.result_data as string | undefined;
                                const hasImage = !!resultData && (resultData.startsWith('data:image') || resultData.startsWith('http'));
                                const requestedModel = typeof log.metadata?.requested_model === 'string' ? log.metadata.requested_model : '';
                                const providerModel = typeof log.metadata?.provider_model === 'string' ? log.metadata.provider_model : '';
                                const providerModelSource = typeof log.metadata?.provider_model_source === 'string' ? log.metadata.provider_model_source : '';
                                const providerResponseId = typeof log.metadata?.provider_response_id === 'string' ? log.metadata.provider_response_id : '';
                                const preflight = (log.metadata?.preflight && typeof log.metadata.preflight === 'object')
                                    ? log.metadata.preflight as Record<string, unknown>
                                    : null;
                                const preflightEnabled = !!preflight && preflight.enabled === true;
                                const preflightApplied = !!preflight && preflight.applied === true;
                                const preflightRiskCount = preflight && Array.isArray(preflight.risk_flags)
                                    ? preflight.risk_flags.length
                                    : 0;
                                const preflightRuleCount = preflight && typeof preflight.hard_constraint_count === 'number'
                                    ? Number(preflight.hard_constraint_count)
                                    : 0;
                                const preflightError = preflight && typeof preflight.error === 'string' ? preflight.error : '';
                                const embeddedReferenceCost = getReferenceAnalysisCost(log);
                                const embeddedReferenceEntries = getReferenceAnalysisEntries(log);
                                const forensicRowCost = getForensicCost(log);

                                const displayTextData = stringifyMetadata(log.metadata);
                                const rawSegments = log.metadata?.segments as unknown;
                                const logSegments = Array.isArray(rawSegments)
                                    ? rawSegments
                                        .map((seg) => {
                                            if (typeof seg === 'string') return seg;
                                            if (seg && typeof seg === 'object' && typeof (seg as { text?: unknown }).text === 'string') {
                                                return (seg as { text: string }).text;
                                            }
                                            return '';
                                        })
                                        .filter((seg): seg is string => typeof seg === 'string' && seg.trim().length > 0)
                                    : [];
                                const responseJson = (log.metadata?.response_json && typeof log.metadata.response_json === 'object')
                                    ? log.metadata.response_json as Record<string, unknown>
                                    : {};
                                const panelPlan = parseTraceList(responseJson.panel_plan);
                                const segmentVisualMap = parseTraceList(responseJson.segment_visual_map);
                                const panelCastMap = parseTraceList(responseJson.panel_cast_map);

                                return (
                                    <React.Fragment key={logKey}>
                                        <tr className="border-b border-[#dfe6ec] hover:bg-[#f5f7fa]">
                                            <td className="py-3 px-5 text-[18px]">{formatTime(log.created_at || '')}</td>
                                            <td className="py-3 px-5 text-[18px]">
                                                <div className="font-semibold text-[#303133]">{log.model_name || '-'}</div>
                                                <div className="text-[13px] text-[#606266]">פעולה: {getActionDisplayLabel(log.action_type)}</div>
                                                <div className="text-[13px] text-[#909399]">תפקיד: {getModelRoleLabel(log.action_type)}</div>
                                                {requestedModel && (
                                                    <div className="text-[12px] text-[#909399] dir-ltr text-left rtl:text-right">requested: {requestedModel}</div>
                                                )}
                                                {providerModel && (
                                                    <div className="text-[12px] text-[#67c23a] dir-ltr text-left rtl:text-right">provider: {providerModel}</div>
                                                )}
                                                {providerModelSource && (
                                                    <div className="text-[11px] text-[#909399] dir-ltr text-left rtl:text-right">provider_source: {providerModelSource}</div>
                                                )}
                                                {providerResponseId && (
                                                    <div className="text-[11px] text-[#b0b3b8] dir-ltr text-left rtl:text-right">response_id: {providerResponseId}</div>
                                                )}
                                                {preflightEnabled && (
                                                    <div className={`text-[11px] dir-ltr text-left rtl:text-right ${preflightError ? 'text-[#f56c6c]' : (preflightApplied ? 'text-[#67c23a]' : 'text-[#909399]')}`}>
                                                        preflight: {preflightError ? `error (${preflightError})` : (preflightApplied ? `applied | risks:${preflightRiskCount} | rules:${preflightRuleCount}` : 'enabled | no changes')}
                                                    </div>
                                                )}
                                                {embeddedReferenceEntries.length > 0 && (
                                                    <div className="text-[11px] text-[#909399] dir-ltr text-left rtl:text-right">
                                                        reference_analysis: {embeddedReferenceEntries.length} slots | +${formatUsdCost(embeddedReferenceCost)}
                                                    </div>
                                                )}
                                                <div className="text-[13px] text-[#909399]">
                                                    חיוב: {resolveBillingModel(log.model_name, String(log.model_name || '').toLowerCase().includes('image') || String(log.model_name || '').toLowerCase().includes('scene-render')) || 'לא מזוהה'}
                                                </div>
                                            </td>
                                            <td className="py-3 px-5 text-center text-[18px]">{log.input_tokens.toLocaleString()}</td>
                                            <td className="py-3 px-5 text-center text-[18px]">{log.output_tokens.toLocaleString()}</td>
                                            <td className="py-3 px-5 text-center tabular-nums font-bold text-[#303133] text-[18px]">
                                                <div>₪{formatIlsCost(forensicRowCost * USD_TO_ILS)}</div>
                                                {embeddedReferenceCost > 0 && (
                                                    <div className="text-[11px] font-medium text-[#909399]">כולל ref</div>
                                                )}
                                            </td>
                                            <td className="py-3 px-5 text-center">
                                                <div className="flex items-center justify-center gap-3">
                                                    {hasImage && (
                                                        <>
                                                            <button onClick={() => window.open(resultData, '_blank')} className="text-[#1890ff] hover:text-[#46a6ff] transition-colors"><ExternalLink size={18} /></button>
                                                            <button onClick={() => void downloadFromUrl(resultData as string, `img_${sessionKey}_${index}.png`)} className="text-[#1890ff] hover:text-[#46a6ff] transition-colors"><Download size={18} /></button>
                                                        </>
                                                    )}
                                                    <button
                                                        onClick={() => { void verifyAndCopyLog(logKey, log); }}
                                                        className="text-[#67c23a] hover:text-[#85ce61] font-semibold transition-colors text-[15px]"
                                                    >
                                                        Verify
                                                    </button>
                                                    {canRevealPrompt && (
                                                        <button
                                                            onClick={() => { void revealImagePromptForLog(logKey, log); }}
                                                            className="text-[#e6a23c] hover:text-[#ebb563] font-semibold transition-colors text-[15px]"
                                                        >
                                                            {isPromptLoading ? 'טוען...' : 'image_prompt'}
                                                        </button>
                                                    )}
                                                    <button onClick={() => toggleLog(logKey)} className="text-[#1890ff] hover:text-[#46a6ff] font-semibold flex items-center gap-1 transition-colors text-[17px]">
                                                        {isLogExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                        מידע
                                                    </button>
                                                </div>
                                                {verification && (
                                                    <div
                                                        className={`mt-2 text-[12px] leading-snug ${
                                                            verification.level === 'ok'
                                                                ? 'text-[#67c23a]'
                                                                : verification.level === 'warn'
                                                                    ? 'text-[#e6a23c]'
                                                                    : 'text-[#f56c6c]'
                                                        }`}
                                                    >
                                                        {verification.message}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                        {isLogExpanded && (
                                            <tr className="bg-[#fafafa]">
                                                <td colSpan={6} className="p-0 border-b border-[#dfe6ec]">
                                                    <div className="p-5 overflow-x-auto text-[18px]">
                                                        {logSegments.length > 0 && (
                                                            <div className="mb-4">
                                                                <strong className="text-[#303133] text-[19px]">קטעי הסיפור</strong>
                                                                <ul className="list-decimal list-inside mt-2 space-y-2 text-[#606266] leading-relaxed">
                                                                    {logSegments.map((seg, i) => (
                                                                        <li key={i}>{seg}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                        {panelPlan.length > 0 && (
                                                            <div className="mb-4">
                                                                <strong className="text-[#303133] text-[19px]">Panel Plan (מה תוכנן לכל ריבוע)</strong>
                                                                <ul className="list-decimal list-inside mt-2 space-y-2 text-[#606266] leading-relaxed">
                                                                    {panelPlan.map((line, i) => (
                                                                        <li key={i}>{line}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                        {segmentVisualMap.length > 0 && (
                                                            <div className="mb-4">
                                                                <strong className="text-[#303133] text-[19px]">Segment Visual Map (שורה בסיפור ↔ תמונה)</strong>
                                                                <ul className="list-decimal list-inside mt-2 space-y-2 text-[#606266] leading-relaxed">
                                                                    {segmentVisualMap.map((line, i) => (
                                                                        <li key={i}>{line}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                        {panelCastMap.length > 0 && (
                                                            <div className="mb-4">
                                                                <strong className="text-[#303133] text-[19px]">Panel Cast Map (מי מופיע בכל תמונה)</strong>
                                                                <ul className="list-decimal list-inside mt-2 space-y-2 text-[#606266] leading-relaxed">
                                                                    {panelCastMap.map((line, i) => (
                                                                        <li key={i}>{line}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                        {decryptedImagePrompt && (
                                                            <div className="mb-4">
                                                                <strong className="text-[#303133] text-[19px]">`image_prompt` למנהלים</strong>
                                                                <pre className="whitespace-pre-wrap mt-2 text-[15px] bg-[#fff7e6] text-[#8a5a00] p-4 rounded-md border border-[#f5dab1] text-left" dir="ltr">
                                                                    {decryptedImagePrompt}
                                                                </pre>
                                                            </div>
                                                        )}
                                                        {promptError && (
                                                            <div className="mb-4 text-[14px] text-[#f56c6c] font-semibold">
                                                                שגיאת `image_prompt`: {promptError}
                                                            </div>
                                                        )}
                                                        <pre className="whitespace-pre-wrap text-[17px] bg-[#2b2f3a] text-[#a9b7c6] p-4 rounded-md shadow-inner text-left" dir="ltr">
                                                            {displayTextData}
                                                        </pre>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </details>
        );
    };

    const activeSectionMeta = navSections.find((section) => section.id === activeSection);
    return (
        <div className="flex min-h-screen text-[#606266] dev-dashboard-root" dir="rtl">
            <style>{`
                .dev-dashboard-root {
                    --dev-bg: linear-gradient(180deg, #eef3ff 0%, #f7f1e6 100%);
                    --dev-surface: rgba(255, 255, 255, 0.92);
                    --dev-surface-strong: #ffffff;
                    --dev-border: rgba(91, 111, 142, 0.16);
                    --dev-shadow: 0 18px 48px rgba(37, 52, 77, 0.12);
                    --dev-shadow-soft: 0 8px 22px rgba(37, 52, 77, 0.08);
                    --dev-ink: #22324a;
                    --dev-muted: #72829b;
                    --dev-accent: #2f74ff;
                    background: var(--dev-bg);
                    color: var(--dev-ink);
                    font-family: 'Heebo', 'Assistant', sans-serif;
                }
                .dev-dashboard-root * { font-family: inherit; }
                .sidebar-menu-item {
                    border-right: 4px solid transparent;
                    transition: background-color .2s ease, color .2s ease, border-color .2s ease, transform .2s ease;
                }
                .sidebar-menu-item:hover {
                    background-color: rgba(255,255,255,0.06) !important;
                    transform: translateX(-2px);
                }
                .sidebar-menu-item.active {
                    color: #8eb7ff !important;
                    background: linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(47,116,255,0.18) 100%) !important;
                    border-right-color: #8eb7ff;
                }
                .panel-group-card {
                    min-height: 108px;
                    cursor: pointer;
                    background: linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(244,247,255,0.92) 100%);
                    border: 1px solid var(--dev-border);
                    box-shadow: var(--dev-shadow-soft);
                    border-radius: 18px;
                    transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
                    backdrop-filter: blur(8px);
                }
                .panel-group-card:hover {
                    transform: translateY(-2px);
                    box-shadow: var(--dev-shadow);
                    border-color: rgba(47,116,255,0.18);
                }
                .panel-group-card:hover .icon-people { background: #40c9c6; color: #fff !important; }
                .panel-group-card:hover .icon-message { background: #36a3f7; color: #fff !important; }
                .panel-group-card:hover .icon-money { background: #f4516c; color: #fff !important; }
                .panel-group-card:hover .icon-shopping { background: #34bfa3; color: #fff !important; }
                .icon-wrapper {
                    padding: 16px;
                    transition: all 0.38s ease-out;
                    border-radius: 18px;
                    background: rgba(255,255,255,0.84);
                    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.6);
                }
                .el-button {
                    display: inline-block;
                    line-height: 1;
                    white-space: nowrap;
                    cursor: pointer;
                    background: rgba(255, 255, 255, 0.92);
                    border: 1px solid var(--dev-border);
                    color: var(--dev-ink);
                    text-align: center;
                    box-sizing: border-box;
                    outline: none;
                    margin: 0;
                    transition: .18s ease;
                    font-weight: 700;
                    padding: 10px 15px;
                    font-size: 12px;
                    border-radius: 12px;
                    box-shadow: 0 4px 14px rgba(37, 52, 77, 0.05);
                }
                .el-button--primary {
                    color: #fff;
                    background: linear-gradient(135deg, #2f74ff 0%, #63a4ff 100%);
                    border-color: transparent;
                }
                .el-button--primary:hover {
                    background: linear-gradient(135deg, #2067f7 0%, #5f9eff 100%);
                    color: #fff;
                    box-shadow: 0 10px 22px rgba(47, 116, 255, 0.22);
                }
                .el-button--text {
                    border-color: transparent;
                    color: var(--dev-accent);
                    background: transparent;
                    padding-left: 0;
                    padding-right: 0;
                    box-shadow: none;
                }
                .el-button:hover {
                    border-color: rgba(47,116,255,0.28);
                    background: #fff;
                }
                .el-button--text:hover { color: #46a6ff; background: transparent; }
                .app-main {
                    padding: 32px;
                    background:
                        radial-gradient(circle at top left, rgba(47,116,255,0.08), transparent 28%),
                        radial-gradient(circle at top right, rgba(253, 196, 84, 0.10), transparent 26%);
                }
                .dev-collapsible-summary::-webkit-details-marker { display: none; }
                .dev-collapsible-summary::marker { content: ''; }
                .dev-glass-card {
                    background: var(--dev-surface);
                    border: 1px solid var(--dev-border);
                    box-shadow: var(--dev-shadow-soft);
                    backdrop-filter: blur(12px);
                }
                .dev-section-title {
                    font-size: 1.375rem;
                    line-height: 1.2;
                    font-weight: 900;
                    color: var(--dev-ink);
                    letter-spacing: -0.015em;
                }
                .dev-section-copy {
                    font-size: 0.9rem;
                    line-height: 1.7;
                    color: var(--dev-muted);
                }
                .dev-chip {
                    border-radius: 999px;
                    padding: 0.45rem 0.9rem;
                    font-size: 0.9rem;
                    font-weight: 700;
                    line-height: 1;
                }
                .dev-soft-button {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.4rem;
                    border-radius: 999px;
                    border: 1px solid rgba(91,111,142,0.16);
                    background: rgba(255,255,255,0.82);
                    color: var(--dev-ink);
                    font-weight: 700;
                    transition: .18s ease;
                }
                .dev-soft-button:hover {
                    border-color: rgba(47,116,255,0.26);
                    color: var(--dev-accent);
                }
                .dev-soft-button.active-primary {
                    background: rgba(47,116,255,0.12);
                    border-color: rgba(47,116,255,0.3);
                    color: var(--dev-accent);
                }
                .dev-soft-button.active-warn {
                    background: rgba(230,162,60,0.13);
                    border-color: rgba(230,162,60,0.28);
                    color: #b9770e;
                }
                .dev-soft-button.active-danger {
                    background: rgba(245,108,108,0.12);
                    border-color: rgba(245,108,108,0.28);
                    color: #d64545;
                }
                .dev-session-article {
                    border-radius: 24px;
                    background: rgba(255,255,255,0.94);
                    border: 1px solid rgba(91,111,142,0.14);
                    box-shadow: 0 16px 40px rgba(37,52,77,0.08);
                    transition: box-shadow .2s ease, transform .2s ease, border-color .2s ease;
                    backdrop-filter: blur(10px);
                }
                .dev-session-article:hover {
                    box-shadow: 0 18px 46px rgba(37,52,77,0.14);
                    transform: translateY(-1px);
                }
                .dev-session-article.current {
                    border-color: #7aa7ff;
                    box-shadow: 0 18px 46px rgba(64,158,255,0.18);
                }
                .dev-summary-tile {
                    border-radius: 18px;
                    border: 1px solid rgba(91,111,142,0.12);
                    background: rgba(255,255,255,0.78);
                    padding: 1rem 1.1rem;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,0.75);
                }
                .dev-summary-tile-label {
                    font-size: 0.8rem;
                    font-weight: 700;
                    color: #8090a9;
                    margin-bottom: 0.35rem;
                }
                .dev-summary-tile-value {
                    font-size: 1.55rem;
                    font-weight: 900;
                    color: #22324a;
                    line-height: 1;
                }
                .dev-section-eyebrow {
                    font-size: 0.74rem;
                    font-weight: 800;
                    letter-spacing: 0.14em;
                    text-transform: uppercase;
                    color: #7f8ca4;
                    margin-bottom: 0.45rem;
                }
                .dev-metric-pill {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.45rem;
                    border-radius: 999px;
                    border: 1px solid rgba(91,111,142,0.14);
                    background: rgba(255,255,255,0.88);
                    padding: 0.55rem 0.9rem;
                    color: #52647f;
                    font-size: 0.9rem;
                    font-weight: 700;
                }
                .dev-metric-pill strong {
                    color: #1f2d3d;
                    font-weight: 900;
                }
                .dev-cover-preview {
                    position: relative;
                    aspect-ratio: 1 / 1;
                    overflow: hidden;
                    border-radius: 24px;
                    border: 1px solid rgba(91,111,142,0.16);
                    background: linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0)), #eef2fb;
                    box-shadow: 0 18px 38px rgba(37,52,77,0.14);
                }
                .dev-cover-preview::after {
                    content: '';
                    position: absolute;
                    inset: auto 0 0 0;
                    height: 40%;
                    background: linear-gradient(180deg, rgba(16,27,44,0) 0%, rgba(16,27,44,0.3) 100%);
                    pointer-events: none;
                }
                .dev-clamp-3 {
                    display: -webkit-box;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 3;
                    overflow: hidden;
                }
                .dev-meta-card {
                    border-radius: 18px;
                    border: 1px solid rgba(91,111,142,0.12);
                    background: rgba(247,249,253,0.9);
                    padding: 1rem 1.05rem;
                }
                .dev-meta-label {
                    font-size: 0.77rem;
                    font-weight: 800;
                    color: #8a96aa;
                    margin-bottom: 0.35rem;
                }
                .dev-meta-value {
                    font-size: 1rem;
                    line-height: 1.65;
                    color: #22324a;
                    font-weight: 800;
                }
                .dev-action-button {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.4rem;
                    min-height: 40px;
                    padding: 0 14px;
                    border-radius: 12px;
                    border: 1px solid rgba(91,111,142,0.14);
                    background: rgba(255,255,255,0.96);
                    color: #22324a;
                    font-size: 0.88rem;
                    font-weight: 800;
                    transition: .18s ease;
                    box-shadow: 0 6px 14px rgba(37,52,77,0.05);
                }
                .dev-action-button:hover {
                    border-color: rgba(47,116,255,0.22);
                    color: var(--dev-accent);
                    transform: translateY(-1px);
                }
                .dev-action-button.primary {
                    background: linear-gradient(135deg, #2f74ff 0%, #6ea7ff 100%);
                    color: #fff;
                    border-color: transparent;
                    box-shadow: 0 12px 24px rgba(47,116,255,0.2);
                }
                .dev-action-button.primary:hover {
                    color: #fff;
                    border-color: transparent;
                }
                .dev-action-button[disabled] {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none;
                }
                .dev-lab-details {
                    border-radius: 22px;
                    border: 1px solid rgba(91,111,142,0.12);
                    background: rgba(255,255,255,0.76);
                    overflow: hidden;
                }
                .dev-lab-details summary {
                    list-style: none;
                    cursor: pointer;
                }
                .dev-lab-details summary::-webkit-details-marker { display: none; }
                .dev-session-toolbar {
                    border-radius: 24px;
                    border: 1px solid rgba(91,111,142,0.12);
                    background: rgba(255,255,255,0.9);
                    box-shadow: 0 14px 34px rgba(37,52,77,0.08);
                    padding: 18px 20px;
                }
                .dev-session-stat {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.45rem;
                    border-radius: 999px;
                    border: 1px solid rgba(91,111,142,0.14);
                    background: rgba(248,250,255,0.95);
                    padding: 0.5rem 0.85rem;
                    color: #52647f;
                    font-size: 0.88rem;
                    font-weight: 700;
                }
                .dev-session-stat strong {
                    color: #1f2d3d;
                    font-weight: 900;
                }
                .dev-inline-meta {
                    border-radius: 18px;
                    border: 1px solid rgba(91,111,142,0.12);
                    background: rgba(247,249,253,0.9);
                    padding: 1rem 1.05rem;
                }
                .dev-inline-meta dt {
                    font-size: 0.76rem;
                    font-weight: 800;
                    color: #8a96aa;
                    margin-bottom: 0.35rem;
                }
                .dev-inline-meta dd {
                    margin: 0;
                    font-size: 1rem;
                    line-height: 1.7;
                    color: #22324a;
                    font-weight: 800;
                }
                .dev-inline-note {
                    font-size: 0.78rem;
                    line-height: 1.6;
                    color: #8592a8;
                    margin-top: 0.45rem;
                }
                @media (max-width: 767px) {
                    .app-main {
                        padding: 18px 14px 28px;
                    }
                    .panel-group-card {
                        min-height: 88px;
                    }
                }
            `}</style>

            <aside className="hidden lg:flex fixed inset-y-0 right-0 z-30 flex-col w-[224px] bg-[linear-gradient(180deg,#1d2940_0%,#243450_42%,#1c2638_100%)] text-[#d5deef] shadow-[2px_0_18px_rgba(17,28,45,.28)]">
                <div className="flex h-[76px] items-center px-5 border-b border-[rgba(255,255,255,0.08)] text-white">
                    <div>
                        <p className="text-[13px] font-semibold tracking-[0.22em] text-[#8eb7ff] uppercase">Lab Console</p>
                        <p className="text-[22px] font-black truncate leading-none">SofSipur Dev</p>
                    </div>
                </div>
                <div className="px-5 pt-4 pb-2">
                    <p className="text-[13px] leading-6 text-[#99abc8]">
                        מעקב ריצות, השוואת מודלים וחקירת `trace` במקום אחד.
                    </p>
                </div>
                <div className="flex-1 overflow-y-auto pt-2">
                    {navSections.map((section) => {
                        const Icon = section.icon;
                        const isActive = activeSection === section.id;
                        return (
                            <button
                                key={section.id}
                                onClick={() => setActiveSection(section.id)}
                                className={`sidebar-menu-item flex w-full items-center gap-4 px-5 py-4 text-[17px] font-medium text-right ${isActive ? 'active' : ''}`}
                            >
                                <Icon size={16} />
                                <span>{section.label}</span>
                            </button>
                        );
                    })}
                </div>
            </aside>

            <div className="flex-1 h-[100dvh] lg:pr-[224px] flex flex-col overflow-hidden">
                <div className="z-20 flex-shrink-0">
                    <header className="min-h-[76px] py-3 bg-[rgba(255,255,255,0.88)] backdrop-blur border-b border-[rgba(91,111,142,0.14)] shadow-[0_10px_28px_rgba(28,43,65,.06)] flex flex-wrap items-center justify-between px-4 lg:px-8 z-10 relative gap-3">
                        <div className="text-[#72829b] text-[18px] lg:text-[22px] flex items-center gap-2">
                            <span className="hidden sm:inline">מרכז בקרה</span>
                            <span className="hidden sm:inline text-[#bcc7d9]">/</span>
                            <span className="text-[#22324a] font-black">{activeSectionMeta?.label}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <button onClick={toggleMockMode} className="el-button px-4 py-[11px] text-[15px]" style={mockModeEnabled ? { backgroundColor: '#1890ff', color: '#fff', borderColor: '#1890ff' } : {}}>
                                {mockModeEnabled ? 'API אמיתי' : 'דמו'}
                            </button>
                            <button onClick={() => { resetSession(); void loadAllSessions({ limit: Math.max(displayedSessions.length, DASHBOARD_INITIAL_VISIBLE_SESSIONS) }); }} className="el-button el-button--primary px-4 py-[11px] text-[15px]">
                                <Plus size={18} className="hidden sm:inline xl:mr-1" /> סשן חדש
                            </button>
                            <button onClick={() => { void loadRecentSessions(); }} className="el-button px-4 py-[11px] text-[15px]" disabled={isLoading || refreshMode !== null}>
                                <RefreshCw size={18} className={`hidden sm:inline xl:mr-1 ${refreshMode === 'recent' ? 'animate-spin' : ''}`} /> בדוק חדש
                            </button>
                            <a href="/" className="el-button px-4 py-[11px] text-[15px] text-center">
                                חזרה לאתר
                            </a>
                        </div>
                    </header>

                    <div className="lg:hidden bg-[rgba(255,255,255,0.88)] backdrop-blur border-b border-[rgba(91,111,142,0.14)] px-4 py-2 overflow-x-auto flex gap-2 shadow-sm relative z-0 hide-scrollbar">
                        {navSections.map((section) => {
                            const Icon = section.icon;
                            const isActive = activeSection === section.id;
                            return (
                                <button
                                    key={section.id}
                                    onClick={() => setActiveSection(section.id)}
                                    className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[14px] font-bold transition-colors ${isActive ? 'bg-[#ecf5ff] text-[#409eff] border border-[#d9ecff]' : 'bg-[#f4f4f5] text-[#909399] border border-[#e9e9eb]'}`}
                                >
                                    <Icon size={14} />
                                    {section.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <main className="app-main flex-1 overflow-auto">
                    {error && (
                        <div className="bg-[#fef0f0] text-[#f56c6c] px-4 py-3 rounded mb-6 text-[19px] border border-[#fde2e2]">
                            <AlertTriangle size={14} className="inline mr-2" /> {error}
                        </div>
                    )}

                    {activeSection === 'sitemap' && (
                        <div className="bg-white p-6 shadow-sm">
                            <h2 className="text-[18px] text-[#303133] font-bold mb-6">מפת אתר</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                {branchData.map((branch) => (
                                    <div key={branch.id} className="border border-[#dfe6ec]">
                                        <div className="bg-[#f5f7fa] px-4 py-3 border-b border-[#dfe6ec]">
                                            <span className="text-[17px] font-bold text-[#303133]">{branch.title}</span>
                                        </div>
                                        <div className="p-2 space-y-1">
                                            {branch.nodes.map((node) => (
                                                <button
                                                    key={node.id}
                                                    onClick={() => openTarget(node)}
                                                    className="w-full text-right p-2 text-[19px] text-[#606266] hover:bg-[#f0f2f5] hover:text-[#1890ff]"
                                                >
                                                    {node.title} <span className="text-[18px] text-[#909399] mr-2">({node.type})</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeSection === 'kpis' && (
                        <div className="space-y-8">
                            <div className="dev-glass-card rounded-[20px] overflow-hidden">
                                <header className="bg-[#f5f7fa] px-6 py-4 border-b border-[#dfe6ec] flex justify-between items-center">
                                    <div>
                                        <h2 className="text-[21px] text-[#22324a] font-black">מחירי חיוב</h2>
                                        <p className="text-[13px] text-[#72829b] mt-1">שמות החיוב המופיעים כאן הם `billing aliases`, לא בהכרח שם המודל שנצפה בזמן ריצה.</p>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <p className="text-[14px] text-[#909399] font-bold tracking-wide">שער המרה (USD ➜ ILS)</p>
                                        <p className="text-[18px] text-[#1890ff] font-bold tabular-nums relative top-1">₪{USD_TO_ILS}</p>
                                    </div>
                                </header>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left rtl:text-right text-[16px] xl:text-[18px] text-[#606266]">
                                        <thead className="bg-[#fafafa] border-b border-[#dfe6ec] text-[#909399]">
                                            <tr>
                                                <th className="py-4 px-6 font-semibold">מודל</th>
                                                <th className="py-4 px-6 font-semibold">מטרה וניצול</th>
                                                <th className="py-4 px-6 text-center font-semibold">עלות קלט (input)</th>
                                                <th className="py-4 px-6 text-center font-semibold">עלות פלט (output)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr className="border-b border-[#dfe6ec] hover:bg-[#f5f7fa]">
                                                <td className="py-5 px-6 font-bold text-[#303133] dir-ltr text-left rtl:text-right">text-core-v1</td>
                                                <td className="py-5 px-6">ניהול שיחה, לוגיקה, אימות קלט</td>
                                                <td className="py-5 px-6 text-center tabular-nums text-[#1890ff] font-bold">$0.10 <span className="text-[#909399] text-[13px] font-normal">/ 1M Tokens</span></td>
                                                <td className="py-5 px-6 text-center tabular-nums text-[#1890ff] font-bold">$0.40 <span className="text-[#909399] text-[13px] font-normal">/ 1M Tokens</span></td>
                                            </tr>
                                            <tr className="border-b border-[#dfe6ec] hover:bg-[#f5f7fa]">
                                                <td className="py-5 px-6 font-bold text-[#303133] dir-ltr text-left rtl:text-right">story-crafter-v1</td>
                                                <td className="py-5 px-6">הפקת סיפור סופי מלא</td>
                                                <td className="py-5 px-6 text-center tabular-nums text-[#f56c6c] font-bold">$2.00 <span className="text-[#909399] text-[13px] font-normal">/ 1M Tokens</span></td>
                                                <td className="py-5 px-6 text-center tabular-nums text-[#f56c6c] font-bold">$12.00 <span className="text-[#909399] text-[13px] font-normal">/ 1M Tokens</span></td>
                                            </tr>
                                            <tr className="hover:bg-[#f5f7fa]">
                                                <td className="py-5 px-6 font-bold text-[#303133] dir-ltr text-left rtl:text-right">scene-render-v1</td>
                                                <td className="py-5 px-6">יצירת האיורים לספר</td>
                                                <td className="py-5 px-6 text-center tabular-nums font-bold" colSpan={2}>$0.101 <span className="text-[#909399] text-[13px] font-normal">/ Per 1 Image Output</span></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeSection === 'sessions' && (
                        <div>
                            <div className="dev-session-toolbar mb-6">
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                                        <div className="flex flex-wrap gap-2.5">
                                            <span className="dev-session-stat"><strong>{filteredSessions.length}</strong> ספרים במטמון</span>
                                            <span className="dev-session-stat"><strong>{displayedSessions.length}</strong> מוצגים עכשיו</span>
                                            <span className="dev-session-stat"><strong>{sessionsTokenTotal.toLocaleString()}</strong> טוקנים</span>
                                            <span className="dev-session-stat"><strong>₪{(totalCostUsd * USD_TO_ILS).toFixed(2)}</strong> עלות כוללת</span>
                                            <span className="dev-session-stat"><strong>{showAllCovers ? 'פועלות' : 'כבויות'}</strong> כריכות</span>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                onClick={() => setSessionTraceFilter('all')}
                                                className={`dev-soft-button px-4 py-2 text-[14px] ${sessionTraceFilter === 'all' ? 'active-primary' : ''}`}
                                            >
                                                הכל ({sessions.length})
                                            </button>
                                            <button
                                                onClick={() => setSessionTraceFilter('mismatch')}
                                                className={`dev-soft-button px-4 py-2 text-[14px] ${sessionTraceFilter === 'mismatch' ? 'active-danger' : ''}`}
                                            >
                                                רק סטייה ({mismatchSessionCount})
                                            </button>
                                            <button
                                                onClick={() => setSessionTraceFilter('fallback')}
                                                className={`dev-soft-button px-4 py-2 text-[14px] ${sessionTraceFilter === 'fallback' ? 'active-warn' : ''}`}
                                            >
                                                רק גיבוי ({fallbackSessionCount})
                                            </button>
                                            <button
                                                onClick={() => { void loadRecentSessions(); }}
                                                disabled={isLoading || refreshMode !== null}
                                                className={`dev-soft-button px-4 py-2 text-[14px] ${refreshMode === 'recent' ? 'active-primary' : ''}`}
                                            >
                                                {refreshMode === 'recent' ? 'בודק חדש...' : 'בדוק חדש'}
                                            </button>
                                            <button
                                                onClick={() => { void loadAllSessions({ showLoading: false, limit: Math.max(filteredSessions.length, DASHBOARD_INITIAL_VISIBLE_SESSIONS) }); }}
                                                disabled={isLoading || refreshMode !== null}
                                                className={`dev-soft-button px-4 py-2 text-[14px] ${refreshMode === 'full' ? 'active-primary' : ''}`}
                                            >
                                                {refreshMode === 'full' ? 'מרענן...' : 'רענון מלא'}
                                            </button>
                                            <button
                                                onClick={() => setShowAllCovers((prev) => !prev)}
                                                className={`dev-soft-button px-4 py-2 text-[14px] ${showAllCovers ? 'active-warn' : ''}`}
                                            >
                                                {showAllCovers ? 'הסתר כריכות' : 'הצג כריכות'}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    clearCachedSessions();
                                                    void loadAllSessions();
                                                }}
                                                disabled={refreshMode !== null}
                                                className="dev-soft-button px-4 py-2 text-[14px]"
                                            >
                                                נקה מטמון
                                            </button>
                                        </div>
                                    </div>

                                    <div className="rounded-[16px] border border-[rgba(91,111,142,0.12)] bg-white/80 px-4 py-3 text-[13px] text-[#5f6f86]">
                                        <p className="font-semibold text-[#22324a]">מצב טעינת לוח הבקרה</p>
                                        <p className="mt-1">
                                            {isUsingCachedSessions
                                                ? 'המסך מוצג כרגע ממטמון מקומי כדי לא למשוך שוב את כל הנתונים והכריכות.'
                                                : 'המסך מציג נתונים מעודכנים מהשרת.'}
                                        </p>
                                        <p className="mt-1">
                                            {sessionsCachedAt
                                                ? `עדכון אחרון: ${new Date(sessionsCachedAt).toLocaleString('he-IL')}`
                                                : 'עדיין אין מטמון שמור בדפדפן.'}
                                        </p>
                                        <p className="mt-1">
                                            כברירת מחדל נטענים רק 5 הספרים האחרונים, בלי כריכות ובלי פירוט פנימי. כריכה נטענת רק בגרסת כרטיס קטנה, ופירוט פנימי נטען רק כשפותחים ספר.
                                        </p>
                                    </div>

                                    <details className="dev-lab-details">
                                        <summary className="px-4 py-2.5 flex items-center justify-between gap-3 bg-[rgba(245,248,255,0.94)] text-[#22324a]">
                                            <span className="text-[14px] font-black">כלי מעבדה וחקירה</span>
                                            <span className="text-[11px] font-bold text-[#8b96a8]">פתח רק כשצריך</span>
                                        </summary>
                                        <div className="p-4 space-y-4">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-[13px] text-[#909399] font-semibold">תצוגת דשבורד:</span>
                                                <button
                                                    onClick={() => setSessionsViewMode('simple')}
                                                    className={`dev-soft-button px-3 py-1.5 text-[13px] ${sessionsViewMode === 'simple' ? 'active-primary' : ''}`}
                                                >
                                                    פשוטה
                                                </button>
                                                <button
                                                    onClick={() => setSessionsViewMode('forensics')}
                                                    className={`dev-soft-button px-3 py-1.5 text-[13px] ${sessionsViewMode === 'forensics' ? 'active-warn' : ''}`}
                                                >
                                                    חקירה מלאה
                                                </button>
                                            </div>

                                            <div className="rounded-[16px] border border-[rgba(91,111,142,0.12)] bg-white/80 px-4 py-3">
                                                <p className="text-[12px] text-[#909399] mb-1">מפתח צפייה ב־`image_prompt`</p>
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <span className="text-[14px] font-semibold text-[#22324a]">{adminPromptKey ? 'שמורה מקומית בדפדפן' : 'לא הוזן'}</span>
                                                    {adminPromptKey && (
                                                        <button onClick={clearAdminPromptKey} className="text-[12px] text-[#f56c6c] hover:text-[#f78989] font-semibold">
                                                            נקה מפתח
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[13px]">
                                                <div className="rounded-[16px] border border-[#d9ecff] bg-[#ecf5ff] px-4 py-3">
                                                    <p className="font-semibold text-[#303133]">שיחה</p>
                                                    <p className="text-[#909399] mt-1">ברירת מחדל: <span className="dir-ltr text-left rtl:text-right">{DASHBOARD_MODEL_DEFAULTS.chat.primary}</span></p>
                                                    <p className="text-[#909399]">נצפה: <span className="dir-ltr text-left rtl:text-right font-semibold text-[#303133]">{observedRuntimeModels.chat?.providerModel || observedRuntimeModels.chat?.requestedModel || '-'}</span></p>
                                                </div>
                                                <div className="rounded-[16px] border border-[#faecd8] bg-[#fdf6ec] px-4 py-3">
                                                    <p className="font-semibold text-[#303133]">כתיבת ספר</p>
                                                    <p className="text-[#909399] mt-1">ברירת מחדל: <span className="dir-ltr text-left rtl:text-right">{DASHBOARD_MODEL_DEFAULTS.story.primary}</span></p>
                                                    <p className="text-[#909399]">נצפה: <span className="dir-ltr text-left rtl:text-right font-semibold text-[#303133]">{observedRuntimeModels.story?.providerModel || observedRuntimeModels.story?.requestedModel || '-'}</span></p>
                                                </div>
                                                <div className={`rounded-[16px] px-4 py-3 ${observedRuntimeModels.image?.providerModel && observedRuntimeModels.image.providerModel !== DASHBOARD_MODEL_DEFAULTS.image.primary ? 'border border-[#fbc4c4] bg-[#fff3f3]' : 'border border-[#e1f3d8] bg-[#f0f9eb]'}`}>
                                                    <p className="font-semibold text-[#303133]">יצירת תמונה</p>
                                                    <p className="text-[#909399] mt-1">ברירת מחדל: <span className="dir-ltr text-left rtl:text-right">{DASHBOARD_MODEL_DEFAULTS.image.primary}</span></p>
                                                    <p className="text-[#909399]">נצפה: <span className="dir-ltr text-left rtl:text-right font-semibold text-[#303133]">{observedRuntimeModels.image?.providerModel || observedRuntimeModels.image?.requestedModel || '-'}</span></p>
                                                </div>
                                            </div>
                                        </div>
                                    </details>
                                </div>
                            </div>

                            <div className="space-y-6">
                                {isLoading ? (
                                    <div className="py-20 text-center text-[#909399] text-[19px]">טוען סשנים...</div>
                                ) : filteredSessions.length === 0 ? (
                                    <div className="py-20 text-center text-[#909399] text-[19px]">
                                        {sessions.length === 0 ? 'אין עדיין נתונים להצגה' : 'אין סשנים תואמים לפילטר הנוכחי'}
                                    </div>
                                ) : (
                                    displayedSessions.map((session) => {
                                        const isExpanded = expandedSessions.has(session.session_id);
                                        const isCurrent = session.session_id === sessionId;
                                        const preferredBookImageUrl = getSessionDownloadImageUrl(session);
                                        const previewImageUrl = getSessionPreviewImageUrl(session.bookAssets);
                                        const shouldLoadCover = Boolean(
                                            previewImageUrl
                                            && (showAllCovers || isExpanded || isCurrent || loadedCoverSessions.has(session.session_id))
                                        );
                                        const hasBookDataForPdf = !!preferredBookImageUrl && Array.isArray(session.bookAssets?.segments) && session.bookAssets.segments.length > 0;
                                        const hasLogDataForPdf = session.storyGeneration.some((entry) => entry.metadata?.segments) && session.imageGeneration.some((entry) => entry.metadata?.result_data);
                                        const canGeneratePdf = hasBookDataForPdf || hasLogDataForPdf;
                                        const hasCompositeAssetLink = !!preferredBookImageUrl;
                                        const compositeFileName = `${session.bookAssets?.slug || getBaseSessionId(session.session_id)}-composite.png`;
                                        const pdfFileName = session.bookAssets?.pdfFileName || `${session.bookAssets?.slug || getBaseSessionId(session.session_id)}.pdf`;
                                        const journey = buildJourneySnapshot(session);
                                        const journeyCounts = journey.counts;
                                        const journeyStatus = journey;
                                        const analyticsTimeline = session.analyticsEvents?.events || [];
                                        const uiTelemetry = session.analyticsEvents?.ui || emptySessionUiTelemetrySummary();
                                        const analyticsLoaded = session.analyticsEvents?.loaded ?? false;
                                        const hasTelemetry = analyticsTimeline.length > 0;
                                        const companionNames = collectCompanionNames([
                                            ...(session.productInfo?.extraChars || []),
                                            session.productInfo?.parentName,
                                            session.productInfo?.parentRole,
                                            session.productInfo?.thirdRole,
                                            session.bookAssets?.parentName,
                                            session.bookAssets?.parentCharacter,
                                        ]);

                                        const storyTitle = session.productInfo?.bookTitle || session.bookAssets?.title || session.session_id;
                                        const storyPreview = session.productInfo?.topic
                                            || (session.bookAssets?.segments && session.bookAssets.segments.length > 0
                                                ? session.bookAssets.segments.slice(0, 2).join(' ')
                                                : 'אין עדיין תקציר זמין');
                                        const storySegments = session.forensics?.artifacts.storySegments || [];
                                        const latestImageLog = getLatestLogForCategory(session.logs, 'imageGeneration');
                                        const latestStoryLog = getLatestLogForCategory(session.logs, 'storyGeneration');
                                        const sessionPromptToken = session.forensics?.artifacts.imagePromptToken || getPromptTokenFromLog(latestImageLog);
                                        const sessionPromptKey = sessionPromptToken ? `session-prompt:${session.session_id}` : '';
                                        const decryptedSessionPrompt = sessionPromptKey ? decryptedPromptByLogKey[sessionPromptKey] : '';
                                        const sessionPromptError = sessionPromptKey ? promptErrorByLogKey[sessionPromptKey] : '';
                                        const isSessionPromptLoading = sessionPromptKey ? !!promptLoadingByLogKey[sessionPromptKey] : false;
                                        const charactersSummary = [
                                            session.productInfo?.childName
                                                ? `${session.productInfo.childName}${session.productInfo.age ? ` (גיל ${session.productInfo.age})` : ''}`
                                                : null,
                                            ...companionNames,
                                        ].filter((value): value is string => !!value).join(' · ');
                                        const coverPreviewColumns = session.forensics?.normalizedGrid?.columns || 4;
                                        const coverPreviewRows = session.forensics?.normalizedGrid?.rows || 3;
                                        const paymentLabel = `${session.bookAssets?.paymentStatus || 'לא ידוע'}${session.bookAssets?.isUnlocked ? ' · פתוח' : ' · נעול'}`;
                                        const rawImageCost = toFiniteNumber(latestImageLog?.metadata?.estimated_cost);
                                        const rawImagePricingModel = typeof latestImageLog?.metadata?.pricing_model === 'string' ? latestImageLog.metadata.pricing_model : undefined;
                                        const rawImagePricingRule = typeof latestImageLog?.metadata?.pricing_rule === 'string' ? latestImageLog.metadata.pricing_rule : undefined;
                                        const rawImageProviderResponseId = typeof latestImageLog?.metadata?.provider_response_id === 'string' ? latestImageLog.metadata.provider_response_id : undefined;
                                        const referenceFeaturesDocument = stringifyMetadata(
                                            extractReferenceFeatures(latestImageLog) || session.forensics?.referenceProfiles || []
                                        );
                                        const normalizedGridDocument = stringifyMetadata(session.forensics?.normalizedGrid || {});
                                        const rawImageMetadataDocument = stringifyMetadata(
                                            extractRawImageMetadata(latestImageLog, session.forensics?.normalizedGrid) || {}
                                        );
                                        const costBreakdownDocument = stringifyMetadata({
                                            currency: {
                                                usdToIls: USD_TO_ILS,
                                            },
                                            totals: {
                                                costUsd: session.forensics?.costBreakdown.total || session.total_cost_usd,
                                                costIls: Number(((session.forensics?.costBreakdown.total || session.total_cost_usd) * USD_TO_ILS).toFixed(6)),
                                            },
                                            byCategory: session.forensics?.costBreakdown || {},
                                            image: latestImageLog ? {
                                                pricingModel: rawImagePricingModel || null,
                                                pricingRule: rawImagePricingRule || null,
                                                estimatedCostUsd: rawImageCost ?? null,
                                                providerResponseId: rawImageProviderResponseId || null,
                                            } : null,
                                        });
                                        const storyPagesDocument = buildStoryPagesDocument(storyTitle, session.forensics?.artifacts || {
                                            storySegments: [],
                                            panelPlan: [],
                                            segmentVisualMap: [],
                                            panelCastMap: [],
                                        });
                                        const fullSessionTranscript = buildFullSessionLogText(session);
                                        const sessionArtifactBundle = stringifyMetadata({
                                            sessionId: session.session_id,
                                            startedAt: session.started_at,
                                            title: storyTitle,
                                            topic: session.productInfo?.topic,
                                            artStyle: session.productInfo?.artStyle,
                                            characters: {
                                                primary: session.productInfo?.childName,
                                                companions: companionNames,
                                            },
                                            costBreakdown: session.forensics?.costBreakdown,
                                            normalizedGrid: session.forensics?.normalizedGrid,
                                            runtime: session.forensics?.runtime,
                                            referenceProfiles: session.forensics?.referenceProfiles,
                                            storyboardArtifacts: session.forensics?.artifacts,
                                            storyPages: storySegments,
                                            journey: {
                                                reachedLabel: journeyStatus.reachedLabel,
                                                missingLabels: journeyStatus.missingLabels,
                                                sourceLabel: journey.sourceLabel,
                                                counts: journeyCounts,
                                            },
                                            rawImage: latestImageLog ? {
                                                pricingModel: rawImagePricingModel,
                                                pricingRule: rawImagePricingRule,
                                                estimatedCost: rawImageCost,
                                                providerResponseId: rawImageProviderResponseId,
                                                rawMetadata: extractRawImageMetadata(latestImageLog, session.forensics?.normalizedGrid) || null,
                                                requestedModel: latestImageLog.metadata?.requested_model,
                                                providerModel: latestImageLog.metadata?.provider_model,
                                                providerModelSource: latestImageLog.metadata?.provider_model_source,
                                            } : null,
                                            storyPagesDocument,
                                            fullSessionTranscript,
                                            latestStoryLogMetadata: latestStoryLog?.metadata || null,
                                            latestImageLogMetadata: latestImageLog?.metadata || null,
                                        });

                                        return (
                                            <article key={session.session_id} className={`dev-session-article ${isCurrent ? 'current' : ''}`}>
                                                <div className="p-4 lg:p-5">
                                                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_156px] lg:items-start">
                                                        <div className="order-1 min-w-0 space-y-3">
                                                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-2 text-[#72829b]">
                                                                        {isCurrent && <span className="h-2.5 w-2.5 inline-block rounded-full bg-[#409eff]" />}
                                                                        <span className="text-[14px] font-semibold">{formatDateTime(session.started_at)}</span>
                                                                    </div>
                                                                    <h3 className="mt-2 text-[24px] lg:text-[30px] leading-tight font-black text-[#1f2d3d] break-words">
                                                                        {storyTitle}
                                                                    </h3>
                                                                    <p className="mt-1 text-[13px] text-[#8d99ad] font-semibold break-all">מזהה: {session.session_id}</p>
                                                                </div>
                                                            </div>

                                                            <p className="text-[15px] lg:text-[17px] text-[#4a5b75] leading-7">
                                                                {storyPreview}
                                                            </p>

                                                            <div className="flex flex-wrap gap-2">
                                                                {charactersSummary ? (
                                                                    <span className="dev-chip bg-[#ecf5ff] text-[#2f74ff] border border-[#d8e7ff]">{charactersSummary}</span>
                                                                ) : (
                                                                    <span className="dev-chip bg-[#f4f6fb] text-[#6f8098] border border-[#e4e9f2]">אין שמות דמויות זמינים</span>
                                                                )}
                                                                {session.productInfo?.artStyle && (
                                                                    <span className="dev-chip bg-[#fdf6ec] text-[#c27b14] border border-[#fae3b5]">{session.productInfo.artStyle}</span>
                                                                )}
                                                                <span className="dev-chip bg-[#f4f6fb] text-[#52647f] border border-[#e2e8f3]">
                                                                    מסע: {journeyStatus.isComplete ? 'מלא' : `הגיע עד ${journeyStatus.reachedLabel}`}
                                                                </span>
                                                                <span className="dev-chip bg-[#f4f6fb] text-[#52647f] border border-[#e2e8f3]">
                                                                    תשלום: {paymentLabel}
                                                                </span>
                                                                <span className="dev-chip bg-[#f4f6fb] text-[#52647f] border border-[#e2e8f3]">
                                                                    עלות: ₪{formatIlsCost(session.total_cost_usd * USD_TO_ILS)}
                                                                </span>
                                                            </div>

                                                            <div className="pt-1">
                                                                <div className="flex flex-wrap gap-2">
                                                                    {session.bookAssets?.pdfUrl ? (
                                                                        <button onClick={(e) => { e.stopPropagation(); downloadFromUrl(session.bookAssets!.pdfUrl!, pdfFileName); }} className="dev-action-button primary">
                                                                            <Download size={14} className="inline mr-1" /> PDF
                                                                        </button>
                                                                    ) : canGeneratePdf ? (
                                                                        <button onClick={(e) => { e.stopPropagation(); void generatePDFFromSession(session); }} className="dev-action-button">
                                                                            {isGeneratingPDF === session.session_id ? <RefreshCw size={14} className="animate-spin inline mr-1" /> : <FileText size={14} className="inline mr-1" />}
                                                                            הפק PDF
                                                                        </button>
                                                                    ) : (
                                                                        <button disabled className="dev-action-button">
                                                                            <FileText size={14} className="inline mr-1" /> PDF
                                                                        </button>
                                                                    )}

                                                                    <button disabled={!hasCompositeAssetLink} onClick={(event) => { event.stopPropagation(); void downloadFromUrl(preferredBookImageUrl!, compositeFileName); }} className="dev-action-button">
                                                                        <ImageIcon size={14} className="inline mr-1" /> תמונה
                                                                    </button>

                                                                    <button onClick={() => toggleSession(session.session_id)} className="dev-action-button">
                                                                        {isExpanded ? <ChevronUp size={16} className="inline mr-1" /> : <ChevronDown size={16} className="inline mr-1" />}
                                                                        {isExpanded ? 'סגור' : 'פירוט'}
                                                                    </button>

                                                                    <button
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            revealCoverForSession(session.session_id);
                                                                            void refreshSingleSession(session);
                                                                        }}
                                                                        className="dev-action-button"
                                                                    >
                                                                        {refreshingSessionId === session.session_id ? (
                                                                            <RefreshCw size={14} className="animate-spin inline mr-1" />
                                                                        ) : (
                                                                            <RefreshCw size={14} className="inline mr-1" />
                                                                        )}
                                                                        {refreshingSessionId === session.session_id ? 'מרענן' : 'רענן'}
                                                                    </button>

                                                                    <button
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            void deleteSessionBook(session);
                                                                        }}
                                                                        disabled={!session.bookAssets?.slug || deletingSessionId === session.session_id}
                                                                        className="dev-action-button"
                                                                    >
                                                                        {deletingSessionId === session.session_id ? (
                                                                            <RefreshCw size={14} className="animate-spin inline mr-1" />
                                                                        ) : (
                                                                            <Trash2 size={14} className="inline mr-1" />
                                                                        )}
                                                                        {confirmDeleteSessionId === session.session_id ? 'אשר מחיקה' : 'מחק'}
                                                                    </button>

                                                                    <button
                                                                        onClick={(event) => { event.stopPropagation(); void copyFullSessionLog(session); }}
                                                                        className="dev-action-button"
                                                                    >
                                                                        <Copy size={14} className="inline mr-1" />
                                                                        {sessionCopyStatus[session.session_id] === 'ok'
                                                                            ? 'הועתק'
                                                                            : sessionCopyStatus[session.session_id] === 'error'
                                                                                ? 'שגיאה'
                                                                            : 'העתק'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="order-2 w-[132px] sm:w-[156px] justify-self-start lg:justify-self-end">
                                                            <div className="dev-cover-preview">
                                                                {!previewImageUrl ? (
                                                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top,#f9fbff_0%,#eef3ff_54%,#e4e9f6_100%)] text-center px-5">
                                                                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[rgba(91,111,142,0.16)] bg-white/90 text-[#72829b] shadow-[0_10px_24px_rgba(37,52,77,0.08)]">
                                                                            <ImageIcon size={24} />
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            <p className="text-[14px] font-black text-[#22324a]">אין כריכה זמינה עדיין</p>
                                                                            <p className="text-[12px] leading-5 text-[#7f8ba0]">אפשר עדיין לחקור את הלוגים והעלות גם בלי תמונת ספר.</p>
                                                                        </div>
                                                                    </div>
                                                                ) : shouldLoadCover ? (
                                                                    <>
                                                                        <img
                                                                            src={previewImageUrl}
                                                                            alt="כריכת הספר"
                                                                            className="absolute top-0 left-0 max-w-none"
                                                                            loading="lazy"
                                                                            decoding="async"
                                                                            style={{
                                                                                width: `${coverPreviewColumns * 100}%`,
                                                                                height: `${coverPreviewRows * 100}%`,
                                                                            }}
                                                                        />
                                                                        <div className="absolute bottom-3 right-3 rounded-full bg-[rgba(18,28,45,0.68)] px-3 py-1 text-[11px] font-bold text-white">
                                                                            כריכה
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top,#f9fbff_0%,#eef3ff_54%,#e4e9f6_100%)] text-center px-5">
                                                                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[rgba(91,111,142,0.16)] bg-white/90 text-[#72829b] shadow-[0_10px_24px_rgba(37,52,77,0.08)]">
                                                                            <BookOpen size={24} />
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            <p className="text-[14px] font-black text-[#22324a]">כריכה לא נטענה אוטומטית</p>
                                                                            <p className="text-[12px] leading-5 text-[#7f8ba0]">כדי לחסוך מאות מגה בכל כניסה, הכריכה נטענת רק לפי דרישה.</p>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(event) => {
                                                                                event.stopPropagation();
                                                                                revealCoverForSession(session.session_id);
                                                                            }}
                                                                            className="dev-soft-button px-4 py-2 text-[13px] active-primary"
                                                                        >
                                                                            טען כריכה
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* EXPANDED AREA */}
                                                {isExpanded && (
                                                    <div className="border-t border-[#dfe6ec] bg-[#f8fbff] p-6 space-y-6 shadow-inner">
                                                        <details className="dev-lab-details" open={sessionsViewMode === 'forensics'}>
                                                            <summary className="px-4 py-3 flex items-center justify-between gap-3 bg-[rgba(245,248,255,0.94)] text-[#22324a]">
                                                                <div>
                                                                    <p className="text-[15px] font-black">טקסט הספר</p>
                                                                    <p className="text-[12px] text-[#72829b]">הטקסט הקריא של הספר, וגם הגרסה המלאה בפורמט `story-pages` כמו בקובץ המעבדה.</p>
                                                                </div>
                                                                <span className="text-[12px] font-bold text-[#8b96a8]">
                                                                    {storySegments.length > 0 ? `${storySegments.length} שורות / עמודים` : 'אין עדיין טקסט שמור'}
                                                                </span>
                                                            </summary>
                                                            <div className="p-4">
                                                                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                                                                    <div>
                                                                        {storySegments.length > 0 ? (
                                                                            <ol className="grid gap-3 lg:grid-cols-2">
                                                                                {storySegments.map((segment, segmentIndex) => (
                                                                                    <li key={`${session.session_id}-segment-${segmentIndex}`} className="rounded-[14px] border border-[rgba(91,111,142,0.12)] bg-[rgba(247,249,253,0.9)] px-4 py-3">
                                                                                        <div className="text-[12px] font-black tracking-[0.12em] text-[#8a96aa] uppercase mb-2">עמוד {segmentIndex + 1}</div>
                                                                                        <p className="text-[15px] leading-7 text-[#22324a]">{segment}</p>
                                                                                    </li>
                                                                                ))}
                                                                            </ol>
                                                                        ) : (
                                                                            <div className="rounded-[14px] border border-dashed border-[rgba(91,111,142,0.18)] bg-[rgba(255,255,255,0.78)] px-4 py-5 text-[14px] text-[#7f8ba0]">
                                                                                אין עדיין קטעי סיפור שמורים בסשן הזה.
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    <details className="border border-[#ebeef5] rounded-[14px] overflow-hidden bg-white/90" open={sessionsViewMode === 'forensics'}>
                                                                        <summary className="dev-collapsible-summary bg-[#f8fafc] px-4 py-3 text-[14px] font-black text-[#22324a] cursor-pointer list-none flex items-center justify-between gap-3">
                                                                            <span>`story-pages` מלא</span>
                                                                            <span className="text-[11px] font-bold text-[#8a96aa]">קובץ שחזור</span>
                                                                        </summary>
                                                                        {storyPagesDocument ? (
                                                                            <pre className="max-h-[760px] overflow-auto whitespace-pre-wrap border-t border-[#ebeef5] bg-[#f8fbff] p-4 text-[13px] leading-7 text-[#2f3d52] text-right" dir="rtl">
                                                                                {storyPagesDocument}
                                                                            </pre>
                                                                        ) : (
                                                                            <div className="border-t border-[#ebeef5] px-4 py-5 text-[14px] text-[#7f8ba0]">אין כרגע `story-pages` מלא לשחזור.</div>
                                                                        )}
                                                                    </details>
                                                                </div>
                                                            </div>
                                                        </details>

                                                        <details className="dev-lab-details" open={sessionsViewMode === 'forensics'}>
                                                            <summary className="px-4 py-3 flex items-center justify-between gap-3 bg-[rgba(245,248,255,0.94)] text-[#22324a]">
                                                                <div>
                                                                    <p className="text-[15px] font-black">כלי מעבדה לסשן הזה</p>
                                                                    <p className="text-[12px] text-[#72829b]">כאן נשמרים נתוני `trace` וארטיפקטים חשובים, בלי לדחוף אותם לחזית.</p>
                                                                </div>
                                                                <span className="text-[12px] font-bold text-[#8b96a8]">{sessionsViewMode === 'forensics' ? 'פתוח אוטומטית' : 'סגור כברירת מחדל'}</span>
                                                            </summary>
                                                            <div className="p-4">
                                                                <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
                                                                    <div className="rounded-[18px] border border-[rgba(91,111,142,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,248,255,0.86)_100%)] p-4 shadow-[0_10px_20px_rgba(37,52,77,0.06)]">
                                                                        <p className="text-[18px] font-bold text-[#303133] mb-3">Trace מהיר</p>
                                                                        <div className="space-y-2 text-[14px] text-[#606266]">
                                                                            <div><span className="font-semibold text-[#303133]">שיחה:</span> <span className="dir-ltr text-left rtl:text-right">{session.forensics?.runtime.chat?.providerModel || session.forensics?.runtime.chat?.requestedModel || '-'}</span></div>
                                                                            <div><span className="font-semibold text-[#303133]">סיפור:</span> <span className="dir-ltr text-left rtl:text-right">{session.forensics?.runtime.story?.providerModel || session.forensics?.runtime.story?.requestedModel || '-'}</span></div>
                                                                            <div><span className="font-semibold text-[#303133]">תמונה:</span> <span className="dir-ltr text-left rtl:text-right">{session.forensics?.runtime.image?.providerModel || session.forensics?.runtime.image?.requestedModel || '-'}</span></div>
                                                                            <div><span className="font-semibold text-[#303133]">חיוב תמונה:</span> <span className="dir-ltr text-left rtl:text-right">{session.forensics?.runtime.image?.billingModel || '-'}</span></div>
                                                                            <div><span className="font-semibold text-[#303133]">מקור אימות:</span> {session.forensics?.runtime.image?.providerModelSource || 'בדוק שורות לוג לפירוט מלא'}</div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="rounded-[18px] border border-[rgba(91,111,142,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(255,248,237,0.86)_100%)] p-4 shadow-[0_10px_20px_rgba(37,52,77,0.06)]">
                                                                        <p className="text-[18px] font-bold text-[#303133] mb-3">גריד ועלות</p>
                                                                        <div className="space-y-2 text-[14px] text-[#606266]">
                                                                            <div><span className="font-semibold text-[#303133]">גולמי:</span> {session.forensics?.normalizedGrid?.sourceWidth || '-'}×{session.forensics?.normalizedGrid?.sourceHeight || '-'}</div>
                                                                            <div><span className="font-semibold text-[#303133]">סופי:</span> {session.forensics?.normalizedGrid?.targetWidth || '-'}×{session.forensics?.normalizedGrid?.targetHeight || '-'}</div>
                                                                            <div><span className="font-semibold text-[#303133]">פריסה:</span> {session.forensics?.normalizedGrid?.columns || '-'}×{session.forensics?.normalizedGrid?.rows || '-'} · פנאל {session.forensics?.normalizedGrid?.panelSize || '-'}</div>
                                                                            <div><span className="font-semibold text-[#303133]">נרמול:</span> {session.forensics?.normalizedGrid?.wasNormalized ? 'בוצע' : 'לא בוצע / אין מידע'}</div>
                                                                            <div><span className="font-semibold text-[#303133]">סיפור:</span> ${formatUsdCost(session.forensics?.costBreakdown.story || 0)}</div>
                                                                            <div><span className="font-semibold text-[#303133]">תמונה:</span> ${formatUsdCost(session.forensics?.costBreakdown.image || 0)}</div>
                                                                            <div><span className="font-semibold text-[#303133]">ייחוס:</span> ${formatUsdCost(session.forensics?.costBreakdown.reference || 0)}</div>
                                                                            <div><span className="font-semibold text-[#303133]">סה״כ:</span> ${formatUsdCost(session.forensics?.costBreakdown.total || 0)}</div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="rounded-[18px] border border-[rgba(91,111,142,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(242,247,255,0.9)_100%)] p-4 shadow-[0_10px_20px_rgba(37,52,77,0.06)]">
                                                                        <p className="text-[18px] font-bold text-[#303133] mb-3">תמונת מקור ורינדור</p>
                                                                        <div className="space-y-2 text-[14px] text-[#606266]">
                                                                            <div><span className="font-semibold text-[#303133]">Prompt token:</span> <span className="dir-ltr text-left rtl:text-right">{session.forensics?.artifacts.imagePromptToken || 'לא נשמר'}</span></div>
                                                                            <div><span className="font-semibold text-[#303133]">תמחור תמונה:</span> <span className="dir-ltr text-left rtl:text-right">{rawImagePricingModel || '-'}</span>{rawImagePricingRule ? ` · ${rawImagePricingRule}` : ''}</div>
                                                                            <div><span className="font-semibold text-[#303133]">עלות רינדור גולמית:</span> {Number.isFinite(rawImageCost) ? `$${formatUsdCost(rawImageCost || 0)}` : '-'}</div>
                                                                            <div><span className="font-semibold text-[#303133]">provider_response_id:</span> <span className="dir-ltr text-left rtl:text-right">{rawImageProviderResponseId || '-'}</span></div>
                                                                        </div>
                                                                        {latestImageLog ? (
                                                                            <div className="mt-4">
                                                                                {!decryptedSessionPrompt ? (
                                                                                    <button
                                                                                        onClick={() => { void revealImagePrompt(sessionPromptKey, sessionPromptToken); }}
                                                                                        className="dev-soft-button px-4 py-2 text-[13px]"
                                                                                    >
                                                                                        {isSessionPromptLoading ? 'טוען image_prompt...' : 'הצג image_prompt של הסשן'}
                                                                                    </button>
                                                                                ) : null}
                                                                                {sessionPromptError ? (
                                                                                    <div className="mt-3 rounded-[12px] border border-[#fbc4c4] bg-[#fff3f3] px-3 py-2 text-[12px] text-[#d64545]">
                                                                                        {sessionPromptError}
                                                                                    </div>
                                                                                ) : null}
                                                                                {decryptedSessionPrompt ? (
                                                                                    <details className="mt-3 border border-[#ebeef5] rounded-[12px] overflow-hidden" open={sessionsViewMode === 'forensics'}>
                                                                                        <summary className="dev-collapsible-summary bg-[#f8fafc] px-3 py-2 text-[13px] font-semibold text-[#303133] cursor-pointer list-none">
                                                                                            image_prompt מלא
                                                                                        </summary>
                                                                                        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap border-t border-[#ebeef5] bg-[#f8fbff] p-3 text-[12px] leading-6 text-[#334257] text-left" dir="ltr">{decryptedSessionPrompt}</pre>
                                                                                    </details>
                                                                                ) : null}
                                                                            </div>
                                                                        ) : (
                                                                            <div className="mt-4 text-[13px] text-[#909399]">אין לוג תמונה זמין להצגת `image_prompt`.</div>
                                                                        )}
                                                                    </div>
                                                                    <div className="rounded-[18px] border border-[rgba(91,111,142,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(240,250,242,0.86)_100%)] p-4 shadow-[0_10px_20px_rgba(37,52,77,0.06)]">
                                                                        <p className="text-[18px] font-bold text-[#303133] mb-3">ייחוס דמויות</p>
                                                                        <div className="space-y-3">
                                                                            {session.forensics?.referenceProfiles.length ? session.forensics.referenceProfiles.map((profile) => (
                                                                                <div key={profile.slot} className="rounded-[4px] border border-[#ebeef5] bg-[#fafafa] p-3">
                                                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                                                        <span className="font-semibold text-[#303133]">{profile.slot}</span>
                                                                                        <span className="text-[12px] text-[#909399] dir-ltr text-left rtl:text-right">{profile.model || '-'}</span>
                                                                                    </div>
                                                                                    <p className="text-[13px] text-[#606266] leading-relaxed">{profile.summary || 'אין summary'}</p>
                                                                                    {profile.identityAnchors.length > 0 && (
                                                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                                                            {profile.identityAnchors.map((anchor) => (
                                                                                                <span key={`${profile.slot}-${anchor}`} className="rounded-[4px] bg-[#ecf5ff] border border-[#d9ecff] px-2 py-0.5 text-[11px] text-[#409eff]">
                                                                                                    {anchor}
                                                                                                </span>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )) : (
                                                                                <p className="text-[13px] text-[#909399]">אין `reference analysis` זמין בסשן הזה</p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="rounded-[18px] border border-[rgba(91,111,142,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(255,250,240,0.9)_100%)] p-4 shadow-[0_10px_20px_rgba(37,52,77,0.06)]">
                                                                        <p className="text-[18px] font-bold text-[#303133] mb-3">ארטיפקטי סטוריבורד</p>
                                                                        <div className="space-y-2 text-[14px] text-[#606266]">
                                                                            <div><span className="font-semibold text-[#303133]">Panel plan:</span> {session.forensics?.artifacts.panelPlan.length || 0}</div>
                                                                            <div><span className="font-semibold text-[#303133]">Visual map:</span> {session.forensics?.artifacts.segmentVisualMap.length || 0}</div>
                                                                            <div><span className="font-semibold text-[#303133]">Cast map:</span> {session.forensics?.artifacts.panelCastMap.length || 0}</div>
                                                                            <div><span className="font-semibold text-[#303133]">Prompt token:</span> <span className="dir-ltr text-left rtl:text-right">{session.forensics?.artifacts.imagePromptToken || 'לא נשמר'}</span></div>
                                                                        </div>
                                                                        <details className="mt-4 border border-[#ebeef5] rounded-[12px] overflow-hidden">
                                                                            <summary className="dev-collapsible-summary bg-[#f8fafc] px-3 py-2 text-[13px] font-semibold text-[#303133] cursor-pointer list-none">
                                                                                פתח מיפוי מלא
                                                                            </summary>
                                                                            <div className="p-3 space-y-3">
                                                                                <div>
                                                                                    <p className="text-[12px] font-bold text-[#8a96aa] uppercase mb-2">Panel plan</p>
                                                                                    <ul className="space-y-1 text-[13px] text-[#4a5b75] leading-6">
                                                                                        {session.forensics?.artifacts.panelPlan.length ? session.forensics.artifacts.panelPlan.map((item, itemIndex) => (
                                                                                            <li key={`panel-plan-${session.session_id}-${itemIndex}`}>{item}</li>
                                                                                        )) : <li>אין נתונים</li>}
                                                                                    </ul>
                                                                                </div>
                                                                                <div>
                                                                                    <p className="text-[12px] font-bold text-[#8a96aa] uppercase mb-2">Segment → Panel</p>
                                                                                    <ul className="space-y-1 text-[13px] text-[#4a5b75] leading-6">
                                                                                        {session.forensics?.artifacts.segmentVisualMap.length ? session.forensics.artifacts.segmentVisualMap.map((item, itemIndex) => (
                                                                                            <li key={`segment-map-${session.session_id}-${itemIndex}`}>{item}</li>
                                                                                        )) : <li>אין נתונים</li>}
                                                                                    </ul>
                                                                                </div>
                                                                                <div>
                                                                                    <p className="text-[12px] font-bold text-[#8a96aa] uppercase mb-2">Panel cast map</p>
                                                                                    <ul className="space-y-1 text-[13px] text-[#4a5b75] leading-6">
                                                                                        {session.forensics?.artifacts.panelCastMap.length ? session.forensics.artifacts.panelCastMap.map((item, itemIndex) => (
                                                                                            <li key={`cast-map-${session.session_id}-${itemIndex}`}>{item}</li>
                                                                                        )) : <li>אין נתונים</li>}
                                                                                    </ul>
                                                                                </div>
                                                                            </div>
                                                                        </details>
                                                                    </div>
                                                                </div>

                                                                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                                                                    <details className="border border-[#ebeef5] rounded-[14px] overflow-hidden bg-white/90" open={sessionsViewMode === 'forensics'}>
                                                                        <summary className="dev-collapsible-summary bg-[#f8fafc] px-4 py-3 text-[14px] font-semibold text-[#303133] cursor-pointer list-none">
                                                                            `cost-breakdown.json`
                                                                        </summary>
                                                                        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap border-t border-[#ebeef5] bg-[#f8fbff] p-4 text-[12px] text-left" dir="ltr">
                                                                            {costBreakdownDocument}
                                                                        </pre>
                                                                    </details>

                                                                    <details className="border border-[#ebeef5] rounded-[14px] overflow-hidden bg-white/90" open={sessionsViewMode === 'forensics'}>
                                                                        <summary className="dev-collapsible-summary bg-[#f8fafc] px-4 py-3 text-[14px] font-semibold text-[#303133] cursor-pointer list-none">
                                                                            `normalized-grid.json`
                                                                        </summary>
                                                                        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap border-t border-[#ebeef5] bg-[#f8fbff] p-4 text-[12px] text-left" dir="ltr">
                                                                            {normalizedGridDocument}
                                                                        </pre>
                                                                    </details>

                                                                    <details className="border border-[#ebeef5] rounded-[14px] overflow-hidden bg-white/90" open={sessionsViewMode === 'forensics'}>
                                                                        <summary className="dev-collapsible-summary bg-[#f8fafc] px-4 py-3 text-[14px] font-semibold text-[#303133] cursor-pointer list-none">
                                                                            `raw-image-metadata.json`
                                                                        </summary>
                                                                        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap border-t border-[#ebeef5] bg-[#f8fbff] p-4 text-[12px] text-left" dir="ltr">
                                                                            {rawImageMetadataDocument}
                                                                        </pre>
                                                                    </details>

                                                                    <details className="border border-[#ebeef5] rounded-[14px] overflow-hidden bg-white/90" open={sessionsViewMode === 'forensics'}>
                                                                        <summary className="dev-collapsible-summary bg-[#f8fafc] px-4 py-3 text-[14px] font-semibold text-[#303133] cursor-pointer list-none">
                                                                            `reference-features.json`
                                                                        </summary>
                                                                        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap border-t border-[#ebeef5] bg-[#f8fbff] p-4 text-[12px] text-left" dir="ltr">
                                                                            {referenceFeaturesDocument}
                                                                        </pre>
                                                                    </details>

                                                                    <details className="border border-[#ebeef5] rounded-[14px] overflow-hidden bg-white/90 xl:col-span-2" open={sessionsViewMode === 'forensics'}>
                                                                        <summary className="dev-collapsible-summary bg-[#f8fafc] px-4 py-3 text-[14px] font-semibold text-[#303133] cursor-pointer list-none">
                                                                            `trace.json` / חבילת סשן מלאה
                                                                        </summary>
                                                                        <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap border-t border-[#ebeef5] bg-[#f8fbff] p-4 text-[12px] leading-6 text-left" dir="ltr">
                                                                            {sessionArtifactBundle}
                                                                        </pre>
                                                                    </details>

                                                                    <details className="border border-[#ebeef5] rounded-[14px] overflow-hidden bg-white/90 xl:col-span-2">
                                                                        <summary className="dev-collapsible-summary bg-[#f8fafc] px-4 py-3 text-[14px] font-semibold text-[#303133] cursor-pointer list-none">
                                                                            תיעוד מלא של השיחה והיצירה
                                                                        </summary>
                                                                        <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap border-t border-[#ebeef5] bg-[#f8fbff] p-4 text-[12px] leading-7 text-right text-[#2f3d52]" dir="rtl">
                                                                            {fullSessionTranscript}
                                                                        </pre>
                                                                    </details>
                                                                </div>
                                                            </div>
                                                            <details className="mt-4 border border-[#ebeef5] rounded-[12px] overflow-hidden">
                                                                <summary className="dev-collapsible-summary bg-[#f8fafc] px-3 py-2 text-[13px] font-semibold text-[#303133] cursor-pointer list-none">
                                                                    `image-prompt.txt`
                                                                </summary>
                                                                {decryptedSessionPrompt ? (
                                                                    <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap border-t border-[#ebeef5] bg-[#f8fbff] p-3 text-[12px] leading-6 text-[#334257] text-left" dir="ltr">{decryptedSessionPrompt}</pre>
                                                                ) : (
                                                                    <div className="border-t border-[#ebeef5] bg-[#f8fbff] p-4 text-[13px] leading-7 text-[#4a5b75]">
                                                                        <div>ה־`image_prompt` המלא מוצג כאן אחרי פתיחה דרך כפתור `הצג image_prompt של הסשן`.</div>
                                                                        <div className="mt-2">Prompt token: <span className="dir-ltr text-left rtl:text-right font-semibold">{session.forensics?.artifacts.imagePromptToken || 'לא נשמר'}</span></div>
                                                                    </div>
                                                                )}
                                                            </details>
                                                        </details>
                                                        <div className="bg-white border border-[#dfe6ec] rounded-md p-4">
                                                            <p className="text-[18px] font-bold text-[#303133] mb-2">אירועי מסע משתמש</p>
                                                            <div className="text-[15px] text-[#606266] mb-3">
                                                                <span className="font-semibold text-[#303133]">הגיע עד:</span> {journeyStatus.reachedLabel}
                                                                {!journeyStatus.isComplete && (
                                                                    <>
                                                                        <span className="mx-2">|</span>
                                                                        <span className="font-semibold text-[#303133]">חסר:</span> {journeyStatus.missingLabels.join(', ')}
                                                                    </>
                                                                )}
                                                            </div>
                                                            <div className="text-[13px] text-[#72829b] mb-4">מקור סטטוס: {journey.sourceLabel}</div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {Object.entries(journeyCounts).length > 0 ? (
                                                                    Object.entries(journeyCounts).map(([eventName, count]) => (
                                                                        <span key={eventName} className="rounded-[4px] bg-[#ecf5ff] border border-[#d9ecff] px-3 py-1 text-[14px] font-semibold text-[#409eff]">
                                                                            {eventName}: {count}
                                                                        </span>
                                                                    ))
                                                                ) : (
                                                                    <span className="text-[15px] text-[#909399]">לא נמצאו אירועי אנליטיקה לסשן הזה</span>
                                                                )}
                                                            </div>
                                                            {hasTelemetry ? (
                                                                <>
                                                                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-4">
                                                                        <div className="rounded-[10px] border border-[#d9ecff] bg-[#ecf5ff] px-3 py-2">
                                                                            <div className="text-[12px] text-[#909399]">קליקים</div>
                                                                            <div className="text-[18px] font-bold text-[#303133] tabular-nums">{uiTelemetry.totalClicks}</div>
                                                                        </div>
                                                                        <div className="rounded-[10px] border border-[#d9ecff] bg-[#ecf5ff] px-3 py-2">
                                                                            <div className="text-[12px] text-[#909399]">יעדים</div>
                                                                            <div className="text-[18px] font-bold text-[#303133] tabular-nums">{uiTelemetry.uniqueClickTargets}</div>
                                                                        </div>
                                                                        <div className="rounded-[10px] border border-[#faecd8] bg-[#fdf6ec] px-3 py-2">
                                                                            <div className="text-[12px] text-[#909399]">קלטים</div>
                                                                            <div className="text-[18px] font-bold text-[#303133] tabular-nums">{uiTelemetry.totalInputs}</div>
                                                                        </div>
                                                                        <div className="rounded-[10px] border border-[#faecd8] bg-[#fdf6ec] px-3 py-2">
                                                                            <div className="text-[12px] text-[#909399]">אירועי גלילה</div>
                                                                            <div className="text-[18px] font-bold text-[#303133] tabular-nums">{uiTelemetry.totalScrollEvents}</div>
                                                                        </div>
                                                                        <div className="rounded-[10px] border border-[#e1f3d8] bg-[#f0f9eb] px-3 py-2">
                                                                            <div className="text-[12px] text-[#909399]">מקסימום חלון</div>
                                                                            <div className="text-[18px] font-bold text-[#303133] tabular-nums">{uiTelemetry.maxWindowScrollMilestone}%</div>
                                                                        </div>
                                                                        <div className="rounded-[10px] border border-[#e1f3d8] bg-[#f0f9eb] px-3 py-2">
                                                                            <div className="text-[12px] text-[#909399]">מקסימום צ׳אט</div>
                                                                            <div className="text-[18px] font-bold text-[#303133] tabular-nums">{uiTelemetry.maxChatScrollMilestone}%</div>
                                                                        </div>
                                                                    </div>
                                                                    <details className="mt-4 border border-[#ebeef5] rounded-[4px] overflow-hidden" open={sessionsViewMode === 'forensics'}>
                                                                        <summary className="dev-collapsible-summary bg-[#f5f7fa] px-3 py-2 text-[14px] font-semibold text-[#303133] cursor-pointer list-none">
                                                                            כפתורים/יעדים הכי נלחצים ({uiTelemetry.topClickTargets.length || 0})
                                                                        </summary>
                                                                        <div className="p-3">
                                                                            <div className="flex flex-wrap gap-2">
                                                                                {uiTelemetry.topClickTargets.length > 0 ? (
                                                                                    uiTelemetry.topClickTargets.map((target) => (
                                                                                        <span key={target.label} className="rounded-[4px] bg-[#f4f4f5] border border-[#e9e9eb] px-3 py-1 text-[13px] text-[#606266]">
                                                                                            {target.label}: {target.count}
                                                                                        </span>
                                                                                    ))
                                                                                ) : (
                                                                                    <span className="text-[13px] text-[#909399]">אין מספיק נתוני קליקים בסשן הזה</span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </details>

                                                                    <details className="mt-4 border border-[#ebeef5] rounded-[4px] overflow-hidden" open={sessionsViewMode === 'forensics'}>
                                                                        <summary className="dev-collapsible-summary bg-[#f5f7fa] px-3 py-2 text-[14px] font-semibold text-[#303133] cursor-pointer list-none">
                                                                            ציר זמן אירועים מלא ({analyticsTimeline.length})
                                                                        </summary>
                                                                        <div className="overflow-x-auto">
                                                                            <table className="w-full text-left rtl:text-right text-[13px] text-[#606266]">
                                                                                <thead className="bg-[#fafafa] border-b border-[#ebeef5] text-[#909399]">
                                                                                    <tr>
                                                                                        <th className="px-3 py-2 font-semibold">שעה</th>
                                                                                        <th className="px-3 py-2 font-semibold">אירוע</th>
                                                                                        <th className="px-3 py-2 font-semibold">עמוד</th>
                                                                                        <th className="px-3 py-2 font-semibold">מכשיר</th>
                                                                                        <th className="px-3 py-2 font-semibold">סיכום</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {analyticsTimeline.map((event, eventIndex) => {
                                                                                        const eventData = parseAnalyticsEventData(event.event_data);
                                                                                        const detailsJson = stringifyMetadata(eventData);
                                                                                        return (
                                                                                            <tr key={`${event.event_name}-${event.created_at || eventIndex}`} className="border-b border-[#f2f6fc] align-top">
                                                                                                <td className="px-3 py-2 whitespace-nowrap">{formatTime(event.created_at || '')}</td>
                                                                                                <td className="px-3 py-2 font-semibold text-[#303133]">{event.event_name || '-'}</td>
                                                                                                <td className="px-3 py-2">{event.page || '-'}</td>
                                                                                                <td className="px-3 py-2">{event.device_type || '-'}</td>
                                                                                                <td className="px-3 py-2">
                                                                                                    <div className="text-[12px] leading-relaxed">{summarizeEventData(eventData)}</div>
                                                                                                    <details className="mt-1">
                                                                                                        <summary className="cursor-pointer text-[11px] text-[#409eff]">הצג `JSON`</summary>
                                                                                                        <pre className="mt-1 max-h-[240px] overflow-auto whitespace-pre-wrap rounded-[4px] bg-[#2b2f3a] p-2 text-[11px] text-[#a9b7c6] text-left" dir="ltr">
                                                                                                            {detailsJson}
                                                                                                        </pre>
                                                                                                    </details>
                                                                                                </td>
                                                                                            </tr>
                                                                                        );
                                                                                    })}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </details>
                                                                </>
                                                            ) : analyticsLoaded ? (
                                                                <div className="mt-4 rounded-[14px] border border-dashed border-[rgba(91,111,142,0.18)] bg-[rgba(255,255,255,0.76)] px-4 py-5 text-[14px] leading-7 text-[#72829b]">
                                                                    אין `analytics events` מפורטים לסשן הזה, לכן נתוני הקליקים והגלילה לא זמינים. מסע המשתמש למעלה חושב כאן לפי שילוב של אנליטיקה, לוגים וטבלת הספרים.
                                                                </div>
                                                            ) : (
                                                                <div className="mt-4 rounded-[14px] border border-dashed border-[rgba(91,111,142,0.18)] bg-[rgba(255,255,255,0.76)] px-4 py-5 text-[14px] leading-7 text-[#72829b]">
                                                                    {refreshingSessionId === session.session_id
                                                                        ? 'טוען עכשיו את אירועי השימוש המלאים לסשן הזה...'
                                                                        : 'אירועי השימוש המלאים לא נטענו אוטומטית כדי לחסוך תעבורה. פתחו או רעננו את הסשן הזה כדי למשוך אותם נקודתית.'}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {renderCategory('chat', session.chat, session.session_id)}
                                                        {renderCategory('titleSuggestions', session.titleSuggestions, session.session_id)}
                                                        {renderCategory('storyGeneration', session.storyGeneration, session.session_id)}
                                                        {renderCategory('imageGeneration', session.imageGeneration, session.session_id)}
                                                        {renderCategory('alternativeTitles', session.alternativeTitles, session.session_id)}
                                                    </div>
                                                )}
                                            </article>
                                        );
                                    })
                                )}
                            </div>
                            {!isLoading && (remainingSessionsCount > 0 || hasMoreSessions) && (
                                <div className="mt-6 flex flex-col items-center gap-3">
                                    <p className="text-[13px] text-[#72829b]">
                                        מוצגים כרגע {displayedSessions.length} מתוך {filteredSessions.length} ספרים שנטענו מקומית.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => { void loadMoreSessions(); }}
                                        disabled={refreshMode !== null}
                                        className="dev-soft-button px-5 py-2.5 text-[14px] active-primary"
                                    >
                                        {refreshMode === 'more' ? 'טוען...' : `טען עוד ${DASHBOARD_LOAD_MORE_STEP} ספרים`}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default DevDashboard;
