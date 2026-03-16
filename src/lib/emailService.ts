
/**
 * Client helper for "book ready" email notification.
 */

export const sendReadyEmail = async (email: string, bookSlug: string, bookTitle: string) => {
    try {
      const response = await fetch('/api/send-ready-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          bookSlug,
          bookTitle
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.warn('sendReadyEmail failed:', err?.error || `status ${response.status}`);
        return false;
      }

      return true;
    } catch (error) {
      console.warn('sendReadyEmail request error:', error);
      return false;
    }
};
