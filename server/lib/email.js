import { getEnv } from './env.js';

function getString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function getEmailProvider() {
  return getEnv('EMAIL_PROVIDER', 'noop').trim().toLowerCase() || 'noop';
}

export async function sendReadyEmail({
  email,
  bookSlug,
  bookTitle,
}) {
  const provider = getEmailProvider();
  const normalizedEmail = getString(email).toLowerCase();
  const normalizedBookSlug = getString(bookSlug);
  const normalizedBookTitle = getString(bookTitle);

  if (!normalizedEmail || !normalizedBookSlug) {
    return {
      success: false,
      queued: false,
      provider,
      reason: 'missing_email_or_book_slug',
      meta: {
        hasBookTitle: Boolean(normalizedBookTitle),
        hasEmail: Boolean(normalizedEmail),
      },
    };
  }

  if (provider === 'noop' || !provider) {
    return {
      success: true,
      queued: false,
      provider: 'noop',
      reason: 'email_provider_not_configured',
      meta: {
        bookSlug: normalizedBookSlug,
        hasBookTitle: Boolean(normalizedBookTitle),
        hasEmail: true,
      },
    };
  }

  return {
    success: false,
    queued: false,
    provider,
    reason: 'unsupported_email_provider',
    meta: {
      bookSlug: normalizedBookSlug,
      hasBookTitle: Boolean(normalizedBookTitle),
      hasEmail: true,
    },
  };
}
