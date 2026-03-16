import React from 'react';
import { clearMockMode } from '../lib/mockMode';

export default function MockModeBanner() {
  return (
    <button
      type="button"
      onClick={clearMockMode}
      role="banner"
      className="fixed top-4 left-4 z-[9999] bg-amber-400/95 text-black text-xs px-3 py-1.5 rounded-full shadow-md hover:bg-amber-400 font-medium"
      dir="rtl"
      title="לחץ ליציאה ממצב הדגמה"
      aria-label="מצב הדגמה – לחץ ליציאה"
    >
      מצב דמו (ללא AI)
    </button>
  );
}
