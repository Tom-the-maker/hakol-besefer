function cleanEnv(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\\n|\\r/g, '').replace(/\r?\n/g, '').trim();
}

export function getEnv(name, fallback = '') {
  return cleanEnv(process.env[name]) || fallback;
}

export function getAppEnv() {
  return getEnv('APP_ENV') || getEnv('VITE_APP_ENV') || 'local';
}

export function getSupabaseUrl() {
  return getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
}

export function getSupabaseAnonKey() {
  return getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY');
}

export function getSupabaseServiceKey() {
  return getEnv('SUPABASE_SERVICE_KEY');
}

export function getBookPublicBucket() {
  return getEnv('BOOK_PUBLIC_BUCKET') || 'book-public-assets';
}

export function getBookPrivateBucket() {
  return getEnv('BOOK_PRIVATE_BUCKET') || 'book-private-assets';
}

export function getDashboardApiKey() {
  return getEnv('DASHBOARD_API_KEY');
}

export function isLocalAnalyticsEnabled() {
  return getEnv('ENABLE_LOCAL_ANALYTICS') === '1' || getEnv('VITE_ENABLE_LOCAL_ANALYTICS') === '1';
}

export function isVerboseAnalyticsEnabled() {
  return getEnv('ENABLE_VERBOSE_ANALYTICS') === '1' || getEnv('VITE_ENABLE_VERBOSE_ANALYTICS') === '1';
}

export function getServerConfiguration() {
  return {
    appEnv: getAppEnv(),
    configured: {
      supabaseServer: Boolean(getSupabaseUrl() && getSupabaseServiceKey()),
      supabaseBrowser: Boolean(getSupabaseUrl() && getSupabaseAnonKey()),
      dashboardApiKey: Boolean(getDashboardApiKey()),
    },
    storage: {
      publicBucket: getBookPublicBucket(),
      privateBucket: getBookPrivateBucket(),
    },
  };
}
