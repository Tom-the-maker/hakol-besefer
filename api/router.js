import healthHandler from '../server/routes/health.js';
import aiHandler from '../server/routes/ai.js';
import analyticsEventHandler from '../server/routes/analytics-event.js';
import analyticsEventsHandler from '../server/routes/analytics-events.js';
import booksHandler from '../server/routes/books.js';
import bookHandler from '../server/routes/book.js';
import checkoutHandler from '../server/routes/checkout.js';
import couponHandler from '../server/routes/coupon.js';
import dashboardBooksHandler from '../server/routes/dashboard-books.js';
import dashboardSessionHandler from '../server/routes/dashboard-session.js';
import deleteBookHandler from '../server/routes/delete-book.js';
import paymentHostedStubHandler from '../server/routes/payment-hosted-stub.js';
import paymentReturnHandler from '../server/routes/payment-return.js';
import paymentStatusHandler from '../server/routes/payment-status.js';
import paymentWebhookHandler from '../server/routes/payment-webhook.js';
import sendReadyEmailHandler from '../server/routes/send-ready-email.js';
import supportChatHandler from '../server/routes/support-chat.js';
import systemLogHandler from '../server/routes/system-log.js';
import systemLogsHandler from '../server/routes/system-logs.js';
import systemLogsStatsHandler from '../server/routes/system-logs-stats.js';

const HANDLERS = {
  health: healthHandler,
  ai: aiHandler,
  'analytics-event': analyticsEventHandler,
  'analytics-events': analyticsEventsHandler,
  books: booksHandler,
  book: bookHandler,
  checkout: checkoutHandler,
  coupon: couponHandler,
  'dashboard-books': dashboardBooksHandler,
  'dashboard-session': dashboardSessionHandler,
  'delete-book': deleteBookHandler,
  'payment-hosted-stub': paymentHostedStubHandler,
  'payment-return': paymentReturnHandler,
  'payment-status': paymentStatusHandler,
  'payment-webhook': paymentWebhookHandler,
  'send-ready-email': sendReadyEmailHandler,
  'support-chat': supportChatHandler,
  'system-log': systemLogHandler,
  'system-logs': systemLogsHandler,
  'system-logs-stats': systemLogsStatsHandler,
};

function extractEndpoint(req) {
  if (typeof req.query?.endpoint === 'string' && req.query.endpoint.trim()) {
    return req.query.endpoint.trim();
  }

  const url = typeof req.url === 'string' ? req.url : '';
  const match = url.match(/^\/api\/([^/?#]+)/);
  if (match?.[1]) {
    return match[1];
  }

  return '';
}

export default async function handler(req, res) {
  const endpoint = extractEndpoint(req);
  const target = HANDLERS[endpoint];

  if (!target) {
    return res.status(404).json({ error: 'Unknown API endpoint', endpoint });
  }

  return target(req, res);
}
