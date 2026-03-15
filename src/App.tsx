import { useEffect, useState } from 'react';

type HealthPayload = {
  ok: boolean;
  appEnv: string;
  configured: {
    supabaseServer: boolean;
    supabaseBrowser: boolean;
    dashboardApiKey: boolean;
  };
  storage: {
    publicBucket: string;
    privateBucket: string;
  };
};

const guardrails = [
  'הלקוח מדבר רק עם API שרת.',
  'רשימות טוענות רק תקציר ו־thumb, בלי source ובלי story מלא.',
  'אין fallback שקט מתמונה קטנה לקובץ מקור כבד.',
  'נשמרים רק נתיבי Storage, לא URLים כפולים במסד.',
  'lab ו־prod חייבים פרויקטי Supabase נפרדים לגמרי.',
];

const environmentMap = [
  {
    label: 'ראשי',
    path: '/Users/tomzakai/Desktop/hakol-besefer',
    note: 'מיועד לפרויקט הראשי ול־Supabase הראשי החדש.',
  },
  {
    label: 'מעבדה',
    path: '/Users/tomzakai/Desktop/hakol-besefer-lab',
    note: 'מיועד לבדיקות ול־Supabase lab נפרד בלבד.',
  },
];

const routeMap = [
  'GET /api/health',
  'GET /api/books?scope=library',
  'GET /api/books?slug=<slug>',
  'POST /api/books',
  'DELETE /api/books?slug=<slug>',
  'GET /api/dashboard-books',
  'GET /api/dashboard-session?sessionId=<session-id>',
];

export default function App() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) {
          throw new Error(`Health request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as HealthPayload;
        if (!cancelled) {
          setHealth(payload);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Unknown health error');
        }
      }
    }

    void loadHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="eyebrow">Hakol BeSefer Foundation</div>
        <h1>הכל בספר נבנה מחדש על בסיס קטן, קשיח, ומבוקר.</h1>
        <p className="lead">
          הריפו החדש מוכן לשלב הבא בלי לסחוב חוב טכני, בלי fallback למדיה כבדה, ובלי גישה ישירה של
          הלקוח אל טבלאות Supabase.
        </p>
        <div className="status-strip">
          <div className="status-card">
            <span className="status-label">סביבת UI</span>
            <strong>{import.meta.env.VITE_APP_ENV || 'local'}</strong>
          </div>
          <div className="status-card">
            <span className="status-label">מצב API</span>
            <strong>{health?.ok ? 'מוכן' : error ? 'חסר קונפיגורציה' : 'בודק'}</strong>
          </div>
        </div>
      </section>

      <section className="grid-layout">
        <article className="panel">
          <h2>עקרונות מחייבים</h2>
          <ul className="stack-list">
            {guardrails.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2>סביבות עבודה</h2>
          <div className="environment-list">
            {environmentMap.map((environment) => (
              <div className="environment-card" key={environment.path}>
                <strong>{environment.label}</strong>
                <code>{environment.path}</code>
                <p>{environment.note}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid-layout">
        <article className="panel">
          <h2>חוזי API שנבנו</h2>
          <ul className="stack-list">
            {routeMap.map((route) => (
              <li key={route}>
                <code>{route}</code>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <h2>מצב קונפיגורציה</h2>
          {health ? (
            <dl className="health-grid">
              <div>
                <dt>App env</dt>
                <dd>{health.appEnv}</dd>
              </div>
              <div>
                <dt>Supabase server</dt>
                <dd>{health.configured.supabaseServer ? 'configured' : 'missing'}</dd>
              </div>
              <div>
                <dt>Supabase browser</dt>
                <dd>{health.configured.supabaseBrowser ? 'configured' : 'missing'}</dd>
              </div>
              <div>
                <dt>Dashboard key</dt>
                <dd>{health.configured.dashboardApiKey ? 'configured' : 'missing'}</dd>
              </div>
              <div>
                <dt>Public bucket</dt>
                <dd>{health.storage.publicBucket}</dd>
              </div>
              <div>
                <dt>Private bucket</dt>
                <dd>{health.storage.privateBucket}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">
              {error
                ? `ה־health endpoint עדיין לא השיב: ${error}`
                : 'ה־health endpoint נטען כדי לאשר שהשרת מחזיר רק נתוני מצב קלים.'}
            </p>
          )}
        </article>
      </section>
    </main>
  );
}

