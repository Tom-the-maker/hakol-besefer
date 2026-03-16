// Centralized site configuration
// Update these values when going to production

const envSiteUrl = String(import.meta.env.VITE_SITE_URL || '').trim();
const runtimeSiteUrl = typeof window !== 'undefined' ? window.location.origin : '';

export const siteConfig = {
  // Site
  siteName: 'סוףסיפור',
  // Prefer explicit env; fallback to current origin so auth redirect works on preview/staging.
  siteUrl: envSiteUrl || runtimeSiteUrl || 'https://sofsipur.vercel.app',
  
  // Contact
  supportEmail: 'support@sofsipur.co.il', // Update to real email
  whatsappNumber: '972500000000', // Update to real number
  whatsappMessage: 'שלום, יש לי שאלה לגבי סוףסיפור',
  
  // Social
  facebookUrl: '',
  instagramUrl: '',
  
  // Analytics (set via Vercel env vars, read at build time)
  googleAnalyticsId: import.meta.env.VITE_GA_ID || '', // e.g. 'G-XXXXXXXXXX'
  facebookPixelId: import.meta.env.VITE_FB_PIXEL_ID || '', // e.g. '1234567890'
  
  // Prices
  digitalPrice: 39,
  printPrice: 149,
  originalPrice: 89, // Strikethrough price
  currency: 'ILS',
  currencySymbol: '₪',
};

// Helper to get WhatsApp link
export function getWhatsAppLink(customMessage?: string) {
  const msg = customMessage || siteConfig.whatsappMessage;
  return `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(msg)}`;
}
