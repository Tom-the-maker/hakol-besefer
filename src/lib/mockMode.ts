/**
 * Global mock mode - when active, all /api/ai calls return mock data (no external AI costs).
 * Activated via ?mock=1 in URL (sets cookie) or manually.
 */

const COOKIE_NAME = 'mock_mode';
const IMAGE_COOKIE_NAME = 'image_mock_mode';
const COOKIE_VALUE = '1';
const MAX_AGE_DAYS = 1;

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function isMockMode(): boolean {
  return getCookie(COOKIE_NAME) === COOKIE_VALUE;
}

function isImageOnlyMockCookieEnabled(): boolean {
  return getCookie(IMAGE_COOKIE_NAME) === COOKIE_VALUE;
}

export function logAiMode(source: string = 'unknown'): void {
  if (typeof console === 'undefined') return;

  const demoMode = isMockMode();
  const imageOnlyMock = isImageOnlyMockCookieEnabled();
  const modeLabel = demoMode ? 'DEMO ON (Mock)' : 'REAL API ON';
  const bg = demoMode ? '#166534' : '#1d4ed8';

  console.info(
    `%c[AI MODE] ${modeLabel}%c source=${source} | mock_mode=${demoMode ? 1 : 0} | image_mock_mode=${imageOnlyMock ? 1 : 0}`,
    `background:${bg};color:#fff;padding:2px 6px;border-radius:4px;font-weight:700;`,
    'color:#475569;font-weight:600;'
  );
}

export function setMockMode(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=${COOKIE_VALUE}; path=/; max-age=${MAX_AGE_DAYS * 86400}`;
  logAiMode('setMockMode');
}

export function clearMockMode(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  // Also clear legacy image-only mock cookie so API ON truly means real image generation.
  document.cookie = `${IMAGE_COOKIE_NAME}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  logAiMode('clearMockMode');
  // Navigate to clean URL so initMockModeFromUrl won't re-activate mock on load
  window.location.href = window.location.pathname || '/';
}

/** Call on app init - activates mock if ?mock=1 in URL */
export function initMockModeFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('mock') === '1') {
    setMockMode();
    params.delete('mock');
    const newSearch = params.toString();
    const newUrl = newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
    return true;
  }
  logAiMode('initNoUrlParam');
  return false;
}
