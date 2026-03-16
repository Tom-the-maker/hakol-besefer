// Lightweight analytics service - tracks funnel events + deep journey telemetry to Supabase + GA + Pixel
import { supabase } from './supabaseClient';
import { getCurrentSessionId } from './sessionManager';
import { siteConfig } from './siteConfig';
import { hasAnalyticsConsent, hasMarketingConsent } from '../components/CookieConsent';

export type EventName =
  | 'page_view'
  | 'hero_input_start'
  | 'chat_start'
  | 'chat_step'
  | 'chat_input'
  | 'chat_parse'
  | 'photo_uploaded'
  | 'style_selected'
  | 'confirmed'
  | 'book_generated'
  | 'book_viewed'
  | 'register_start'
  | 'register_complete'
  | 'payment_start'
  | 'payment_complete'
  | 'book_shared'
  | 'pdf_downloaded'
  | 'print_notify_signup'
  | 'contact_form'
  | 'ui_click'
  | 'ui_scroll'
  | 'ui_input';

const NON_DEDUPED_EVENTS = new Set<EventName>([
  'ui_click',
  'ui_scroll',
  'ui_input',
  'chat_input',
  'chat_parse',
]);

const WINDOW_SCROLL_MILESTONES = [10, 25, 50, 75, 90, 100];
const HIGH_VOLUME_LOCAL_EVENTS = new Set<EventName>([
  'ui_click',
  'ui_scroll',
  'ui_input',
  'chat_input',
  'chat_parse',
]);

const deviceType = (): string => window.innerWidth < 768 ? 'mobile' : 'desktop';

let lastEvent = { signature: '', time: 0 };
let uiTelemetryCleanup: (() => void) | null = null;

function isLocalRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function shouldSkipEventPersistence(eventName: EventName, pagePath: string): boolean {
  if (pagePath.startsWith('/dev')) {
    return true;
  }

  const localAnalyticsEnabled = import.meta.env.VITE_ENABLE_LOCAL_ANALYTICS === '1';
  if (!localAnalyticsEnabled && isLocalRuntime() && HIGH_VOLUME_LOCAL_EVENTS.has(eventName)) {
    return true;
  }

  return false;
}

async function getAnalyticsHeaders(): Promise<Record<string, string>> {
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

function truncateString(value: string, maxLength = 240): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...[truncated ${value.length} chars]`;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[max-depth]';
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.startsWith('data:image')) return '[inline-image-redacted]';
    return truncateString(value);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 30);
    for (const [key, item] of entries) {
      out[key] = sanitizeValue(item, depth + 1);
    }
    return out;
  }
  return truncateString(String(value));
}

function sanitizeEventData(eventData: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(eventData)) {
    if (key === '_dedupe_key') continue;
    out[key] = sanitizeValue(value);
  }
  return out;
}

function buildDedupeSignature(eventName: EventName, eventData: Record<string, unknown>, pagePath: string): string {
  const key = typeof eventData._dedupe_key === 'string' ? eventData._dedupe_key : '';
  if (key) return `${eventName}:${key}`;
  return `${eventName}:${pagePath}`;
}

export function trackEvent(
  eventName: EventName,
  eventData: Record<string, unknown> = {},
  page?: string
): void {
  const pagePath = page || window.location.pathname;
  if (shouldSkipEventPersistence(eventName, pagePath)) {
    return;
  }

  const dedupeSignature = buildDedupeSignature(eventName, eventData, pagePath);
  const now = Date.now();

  if (!NON_DEDUPED_EVENTS.has(eventName)) {
    if (lastEvent.signature === dedupeSignature && now - lastEvent.time < 1000) return;
    lastEvent = { signature: dedupeSignature, time: now };
  }

  const sanitizedEventData = sanitizeEventData(eventData);

  // Forward to external analytics
  forwardToGA(eventName, sanitizedEventData);
  forwardToPixel(eventName, sanitizedEventData);

  void (async () => {
    try {
      const response = await fetch('/api/analytics-event', {
        method: 'POST',
        headers: await getAnalyticsHeaders(),
        body: JSON.stringify({
          session_id: getCurrentSessionId(),
          book_slug: typeof sanitizedEventData.bookSlug === 'string' ? sanitizedEventData.bookSlug : null,
          event_name: eventName,
          event_data: sanitizedEventData,
          page: pagePath,
          device_type: deviceType(),
        }),
      });

      if (!response.ok) {
        console.warn('Analytics error:', response.status);
      }
    } catch (error) {
      console.warn('Analytics request error:', error);
    }
  })();
}

// Track page view automatically
export function trackPageView(page: string): void {
  trackEvent('page_view', { _dedupe_key: page }, page);
}

function resolveTrackElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const candidate = target.closest('[data-track-id],button,a,[role="button"],input,textarea,select,label,summary');
  return candidate instanceof HTMLElement ? candidate : null;
}

function elementLabel(el: HTMLElement): string {
  const explicit = el.getAttribute('data-track-id') || el.getAttribute('aria-label') || el.getAttribute('name') || '';
  if (explicit) return truncateString(explicit, 120);
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (text) return truncateString(text, 120);
  return el.tagName.toLowerCase();
}

function elementPath(el: HTMLElement): string {
  const parts: string[] = [];
  let node: HTMLElement | null = el;
  for (let i = 0; i < 5 && node; i += 1) {
    const id = node.id ? `#${node.id}` : '';
    const className = node.className && typeof node.className === 'string'
      ? `.${node.className.trim().split(/\s+/).slice(0, 2).join('.')}`
      : '';
    parts.unshift(`${node.tagName.toLowerCase()}${id}${className}`);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

function registerScrollMilestone(
  bucket: Set<number>,
  pagePath: string,
  scope: string,
  percentage: number,
  metadata: Record<string, unknown>
) {
  for (const milestone of WINDOW_SCROLL_MILESTONES) {
    if (percentage < milestone || bucket.has(milestone)) continue;
    bucket.add(milestone);
    trackEvent('ui_scroll', {
      scope,
      milestone_percent: milestone,
      ...metadata,
      _dedupe_key: `${scope}:${pagePath}:${milestone}`,
    }, pagePath);
  }
}

// Captures granular UI events (click / input / scroll milestones) for journey diagnostics.
export function initUiJourneyTelemetry(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  if (uiTelemetryCleanup) return uiTelemetryCleanup;

  const milestoneBuckets = new Map<string, Set<number>>();
  const getBucket = (scope: string, pagePath: string) => {
    const key = `${scope}:${pagePath}`;
    if (!milestoneBuckets.has(key)) milestoneBuckets.set(key, new Set<number>());
    return milestoneBuckets.get(key)!;
  };

  const onClick = (event: MouseEvent) => {
    const pagePath = window.location.pathname;
    if (pagePath.startsWith('/dev')) return;
    const trackedElement = resolveTrackElement(event.target);
    if (!trackedElement) return;

    const rect = trackedElement.getBoundingClientRect();
    trackEvent('ui_click', {
      scope: 'global',
      target_tag: trackedElement.tagName.toLowerCase(),
      target_type: trackedElement.getAttribute('type') || null,
      target_id: trackedElement.getAttribute('id') || null,
      target_track_id: trackedElement.getAttribute('data-track-id') || null,
      target_label: elementLabel(trackedElement),
      target_path: elementPath(trackedElement),
      x: Math.round(event.clientX),
      y: Math.round(event.clientY),
      rect_top: Math.round(rect.top),
      rect_left: Math.round(rect.left),
      rect_width: Math.round(rect.width),
      rect_height: Math.round(rect.height),
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
      _dedupe_key: `click:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
    }, pagePath);
  };

  const onChange = (event: Event) => {
    const pagePath = window.location.pathname;
    if (pagePath.startsWith('/dev')) return;

    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;

    const value = target instanceof HTMLInputElement && target.type === 'checkbox'
      ? target.checked
      : target.value;
    const valueLength = typeof value === 'string' ? value.length : 0;

    trackEvent('ui_input', {
      scope: 'global',
      field_tag: target.tagName.toLowerCase(),
      field_type: target instanceof HTMLInputElement ? target.type : target.tagName.toLowerCase(),
      field_id: target.id || null,
      field_name: target.getAttribute('name') || null,
      field_track_id: target.getAttribute('data-track-id') || null,
      value_length: valueLength,
      checked: target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : null,
      _dedupe_key: `input:${target.id || target.name || target.type}:${Date.now()}`
    }, pagePath);
  };

  const onWindowScroll = () => {
    const pagePath = window.location.pathname;
    if (pagePath.startsWith('/dev')) return;
    const doc = document.documentElement;
    const scrollable = Math.max(doc.scrollHeight - doc.clientHeight, 1);
    const percentage = Math.min(100, Math.max(0, Math.round((window.scrollY / scrollable) * 100)));
    registerScrollMilestone(
      getBucket('window', pagePath),
      pagePath,
      'window',
      percentage,
      {
        scroll_y: Math.round(window.scrollY),
        viewport_h: window.innerHeight,
        document_h: doc.scrollHeight,
      }
    );
  };

  document.addEventListener('click', onClick, true);
  document.addEventListener('change', onChange, true);
  window.addEventListener('scroll', onWindowScroll, { passive: true });

  uiTelemetryCleanup = () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('change', onChange, true);
    window.removeEventListener('scroll', onWindowScroll);
    uiTelemetryCleanup = null;
  };

  return uiTelemetryCleanup;
}

// --- Google Analytics + Facebook Pixel ---

// Forward events to GA4 if configured AND consent given
function forwardToGA(eventName: string, eventData: Record<string, unknown>) {
  if (!hasAnalyticsConsent() || !(window as any).gtag) return;
  (window as any).gtag('event', eventName, eventData);
}

// Forward events to Facebook Pixel if configured AND consent given
function forwardToPixel(eventName: string, eventData: Record<string, unknown>) {
  if (!hasMarketingConsent() || !(window as any).fbq) return;
  // Map internal events to standard FB events
  const fbEventMap: Record<string, string> = {
    'payment_complete': 'Purchase',
    'payment_start': 'InitiateCheckout',
    'register_complete': 'CompleteRegistration',
    'book_generated': 'ViewContent',
    'chat_start': 'Lead',
  };
  const fbEvent = fbEventMap[eventName];
  if (fbEvent) {
    (window as any).fbq('track', fbEvent, eventData);
  } else {
    (window as any).fbq('trackCustom', eventName, eventData);
  }
}

// Initialize GA and Pixel scripts - respects cookie consent
export function initExternalAnalytics(): void {
  _initGA();
  _initPixel();

  // Re-initialize when consent changes
  window.addEventListener('cookie_consent_updated', () => {
    _initGA();
    _initPixel();
  });
}

function _initGA(): void {
  if (!hasAnalyticsConsent()) return;
  const gaId = siteConfig.googleAnalyticsId;
  if (gaId && !document.querySelector(`script[src*="gtag"]`)) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(script);

    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).gtag = function () { (window as any).dataLayer.push(arguments); };
    (window as any).gtag('js', new Date());
    (window as any).gtag('config', gaId);
  }
}

function _initPixel(): void {
  if (!hasMarketingConsent()) return;
  const fbId = siteConfig.facebookPixelId;
  if (fbId && !(window as any).fbq) {
    (function (f: any, b: any, e: any, v: any) {
      const n: any = (f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); });
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = true; n.version = '2.0';
      n.queue = [];
      const t = b.createElement(e); t.async = true; t.src = v;
      const s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    (window as any).fbq('init', fbId);
    (window as any).fbq('track', 'PageView');
  }
}
