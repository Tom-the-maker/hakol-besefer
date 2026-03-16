import React, { useState, useEffect, useRef } from 'react';
import { UserInputs, Story, AppPhase, ArtStyle } from './types';
import { generateStoryBlueprint, generateCompositeImage } from './geminiService';
import FlipbookView from './components/FlipbookView';
import MobileBookView from './components/MobileBookView';
import BookSalesPage from './components/BookSalesPage';
import ChatInterface from './components/ChatInterface';
import { demoStory } from './data/demoStory';
import { demoStories } from './data/demoStories';
import { InspirationExample, inspirationCategories } from './data/inspirationCategories';
import { Button } from '@/components/ui/button';
import { useSessionStore } from './lib/sessionManager';
import {
  saveBook,
  loadBookBySlug,
  bookRecordToStory,
  updateBookEmail,
  BookRecord,
  getBookToken,
} from './lib/bookService';
import { sendReadyEmail } from './lib/emailService';
import MyBooks from './components/MyBooks';
import { TermsOfService, PrivacyPolicy, ContactPage, AccessibilityStatement, CancellationPolicy } from './components/LegalPages';
import { trackEvent, trackPageView, initExternalAnalytics, initUiJourneyTelemetry } from './lib/analytics';
import { AuthProvider } from './lib/auth';
import AuthModal from './components/AuthModal';
import { CookieConsent } from './components/CookieConsent';

// Import design system components from sofsipur-story-craft
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import FeatureStrip from './components/FeatureStrip'; // Import FeatureStrip
import Benefits from './components/Benefits';
import UseCases from './components/UseCases';
import HowItWorks from './components/HowItWorks';
import Testimonials from './components/Testimonials';
import FAQ from './components/FAQ';
import Footer from './components/Footer';
import MainContainer from './components/MainContainer';
import ScrollArrow from './components/ScrollArrow';
import RevealOnScroll from './components/RevealOnScroll';
import StickyCTA from './components/StickyCTA';
import I18nProvider from './components/I18nProvider';
import CategoryGalleryPage from './components/CategoryGalleryPage';
import SupportChatWidget from './components/SupportChatWidget';
import NotFoundPage from './components/NotFoundPage';

// Import demo page
import BookPreviewDemo from './pages/demo/book-preview';
import BookSalesOptionsDemo from './pages/demo/book-sales-options';
import BookSalesContextDemo from './pages/demo/book-sales-context';
import { designSystem } from './lib/designSystem';
import DevDashboard from './pages/dev/DevDashboard';
import MockModeBanner from './components/MockModeBanner';
import { isMockMode } from './lib/mockMode';
import { supabase } from './lib/supabaseClient';
import { getStoryboardBackgroundSize, resolveStoryboardLayout } from './lib/storyboardLayout';

const thinkingMessages = [
  "חולמים על רגעים קסומים...",
  "מארגנים את רצף האיורים...",
  "מערבבים צבעים לסצנות...",
  "כותבים את העלילה המלאה...",
  "מלבישים את הדמויות על הסיפור...",
  "מעצבים את הדמויות...",
  "מוסיפים אבקת פיות לטקסט...",
  "בודקים שהכל מושלם...",
  "עוד רגע וכל הסיפור כאן..."
];

const App: React.FC = () => {
  const getApiHeaders = async (includeContentType = false): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {};
    if (includeContentType) headers['Content-Type'] = 'application/json';

    if (supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) {
          headers.Authorization = `Bearer ${data.session.access_token}`;
        }
      } catch {
        // Ignore auth lookup failures and continue with public request.
      }
    }

    return headers;
  };

  // Check if we're on special pages
  const isDemoPage = window.location.pathname === '/demo/book-preview';
  const isBookSalesOptionsDemoPage = window.location.pathname === '/demo/book-sales-options';
  const isBookSalesContextDemoPage = window.location.pathname === '/demo/book-sales-context';
  const isDevPage = window.location.pathname === '/dev';

  // If on demo page, render it directly
  if (isDemoPage) {
    return (
      <I18nProvider>
        <BookPreviewDemo />
      </I18nProvider>
    );
  }

  if (isBookSalesOptionsDemoPage) {
    return (
      <I18nProvider>
        <BookSalesOptionsDemo />
      </I18nProvider>
    );
  }

  if (isBookSalesContextDemoPage) {
    return (
      <I18nProvider>
        <div className="min-h-screen bg-white">
          <Navbar onStartCoCreation={() => { }} onLogoClick={() => { window.location.href = '/'; }} />
          <main>
            <BookSalesContextDemo />
          </main>
          <Footer />
        </div>
      </I18nProvider>
    );
  }

  // If on dev dashboard page
  if (isDevPage) {
    return <DevDashboard />;
  }

  // URL-based routing
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const isBookPage = pathParts[0] === 'book' && pathParts[1];
  const bookSlugFromUrl = isBookPage ? pathParts[1] : null;
  const isMyBooksPage = pathParts[0] === 'my-books';
  const isTermsPage = pathParts[0] === 'terms';
  const isPrivacyPage = pathParts[0] === 'privacy';
  const isContactPage = pathParts[0] === 'contact';
  const isAccessibilityPage = pathParts[0] === 'accessibility';
  const isCancellationPage = pathParts[0] === 'cancellation';
  const isNotFoundPage = pathParts[0] === '404';

  // Check for test mode in URL or localStorage
  const urlParams = new URLSearchParams(window.location.search);
  const validDevPhases: AppPhase[] = [
    'landing', 'chat', 'thinking', 'title_confirm', 'teaser',
    'register', 'payment', 'view', 'test', 'gallery', 'my-books',
    'terms', 'privacy', 'contact', 'accessibility', 'cancellation', 'not-found'
  ];
  const devPhaseParam = urlParams.get('devPhase');
  const devPhaseFromUrl =
    devPhaseParam && validDevPhases.includes(devPhaseParam as AppPhase)
      ? (devPhaseParam as AppPhase)
      : null;
  const devCategoryFromUrl = urlParams.get('devCategory');
  const devStoryIdFromUrl = urlParams.get('devStoryId');
  const devBookStateFromUrl = urlParams.get('devBookState');
  const devSlugFromUrl = urlParams.get('devSlug');
  const devPopupFromUrl = urlParams.get('devPopup');
  const isKnownPath =
    pathParts.length === 0 ||
    !!isBookPage ||
    isMyBooksPage ||
    isTermsPage ||
    isPrivacyPage ||
    isContactPage ||
    isAccessibilityPage ||
    isCancellationPage ||
    isNotFoundPage;
  const isUnknownPath = pathParts.length > 0 && !isKnownPath;

  if (devPopupFromUrl === 'error-boundary') {
    throw new Error('Intentional ErrorBoundary trigger from /dev sitemap');
  }

  const testModeFromUrl = urlParams.get('test') === 'true' || urlParams.get('test') === '1';
  const testModeFromStorage = localStorage.getItem('flipbook_test_mode') === 'true';

  const shouldSeedDevStory =
    !!devPhaseFromUrl &&
    ['view', 'teaser', 'test', 'register', 'payment'].includes(devPhaseFromUrl);
  const seededDevStoryTemplate =
    (devStoryIdFromUrl && demoStories[devStoryIdFromUrl]) ? demoStories[devStoryIdFromUrl] : demoStory;
  const seededDevStory: Story | null = shouldSeedDevStory
    ? {
      ...seededDevStoryTemplate,
      is_unlocked: devBookStateFromUrl === 'unlocked'
    }
    : null;
  const seededDevSlug =
    devSlugFromUrl ||
    (devPhaseFromUrl && ['register', 'payment'].includes(devPhaseFromUrl) ? 'devpreview1' : null);
  const seededGalleryCategory =
    devPhaseFromUrl === 'gallery'
      ? (
        devCategoryFromUrl && inspirationCategories[devCategoryFromUrl]
          ? devCategoryFromUrl
          : (Object.keys(inspirationCategories)[0] || null)
      )
      : null;

  const [phase, setPhase] = useState<AppPhase>(
    devPhaseFromUrl ? devPhaseFromUrl :
      isUnknownPath ? 'not-found' :
        isTermsPage ? 'terms' :
          isPrivacyPage ? 'privacy' :
            isContactPage ? 'contact' :
              isAccessibilityPage ? 'accessibility' :
                isCancellationPage ? 'cancellation' :
                  isNotFoundPage ? 'not-found' :
                    isMyBooksPage ? 'my-books' :
                      bookSlugFromUrl ? 'view' :
                        testModeFromUrl || testModeFromStorage ? 'test' : 'landing'
  );

  // New state for selected gallery category and active inspiration example
  const [selectedCategory, setSelectedCategory] = useState<string | null>(seededGalleryCategory);
  const [activeInspiration, setActiveInspiration] = useState<InspirationExample | null>(null);

  // New state for Hero input lifting
  const [heroTopic, setHeroTopic] = useState('');

  // Auth modal state
  const [showAuthModal, setShowAuthModal] = useState(false);

  // User email (collected at registration step)
  const [userEmail, setUserEmail] = useState('');
  const [checkoutProduct, setCheckoutProduct] = useState<'digital' | 'print'>('digital');

  // Book persistence state
  const [bookSlug, setBookSlug] = useState<string | null>(bookSlugFromUrl || seededDevSlug);
  const [bookLoading, setBookLoading] = useState(!!bookSlugFromUrl);
  const [bookPersisting, setBookPersisting] = useState(false);
  const trackedBookViewRef = useRef<string | null>(null);

  // Load book from URL slug on mount
  useEffect(() => {
    if (bookSlugFromUrl) {
      setBookLoading(true);
      const run = async () => {
        const applyLoadedBook = (book: BookRecord) => {
          setStory(bookRecordToStory(book));
          setBookSlug(book.slug);
          setInputs(prev => ({
            ...prev,
            childName: book.child_name || '',
            topic: book.topic || '',
          }));
          setPhase('view');
        };

        const applyMissingBook = () => {
          setStory(null);
          setBookSlug(null);
          setPhase('not-found');
        };

        // Check if returning from payment and always verify server-side.
        const params = new URLSearchParams(window.location.search);
        const checkoutState = (params.get('checkout') || '').trim().toLowerCase();
        const returningFromPayment =
          params.get('paid') === 'true' ||
          ['success', 'returned', 'failed', 'cancelled'].includes(checkoutState);

        try {
          const book = await loadBookBySlug(bookSlugFromUrl);

          if (!book) {
            applyMissingBook();
            setBookLoading(false);
            return;
          }

          // If returning from payment, verify with server and reload through the shared loader.
          if (returningFromPayment && !book.is_unlocked) {
            const verifyHeaders = await getApiHeaders(true);
            const verifyRes = await fetch('/api/book', {
              method: 'POST',
              headers: verifyHeaders,
              body: JSON.stringify({ action: 'verify_payment', slug: bookSlugFromUrl })
            });
            const verification = verifyRes.ok ? await verifyRes.json() : null;

            if (verification?.is_unlocked) {
              const fullBook = await loadBookBySlug(bookSlugFromUrl);
              applyLoadedBook(fullBook || { ...book, is_unlocked: true });
            } else {
              applyLoadedBook(book);
            }

            window.history.replaceState({}, '', `/book/${bookSlugFromUrl}`);
            setBookLoading(false);
            return;
          }

          applyLoadedBook(book);
          setBookLoading(false);
        } catch {
          applyMissingBook();
          setBookLoading(false);
        }
      };

      void run();
    }
  }, []);

  const [inputs, setInputs] = useState<UserInputs>(() => {
    if (seededDevStory) {
      return {
        childName: seededDevStory.heroName || 'נעם',
        topic: 'תצוגת דמו',
        artStyle: ArtStyle.Pixar
      };
    }
    return {
      childName: '',
      topic: '',
      artStyle: ArtStyle.Pixar
    };
  });
  const [story, setStory] = useState<Story | null>(() => {
    if (seededDevStory) return seededDevStory;
    return (testModeFromUrl || testModeFromStorage) ? demoStory : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [thinkingIndex, setThinkingIndex] = useState(0);

  // Initialize external analytics (GA, Pixel) once
  useEffect(() => {
    initExternalAnalytics();
  }, []);

  // Deep telemetry for journey debugging (clicks / inputs / scroll milestones)
  useEffect(() => {
    const cleanup = initUiJourneyTelemetry();
    return cleanup;
  }, []);

  // Track phase changes
  useEffect(() => {
    trackPageView(phase);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'register') return;
    trackEvent('register_start', {
      bookSlug,
      product: checkoutProduct,
    });
  }, [phase, bookSlug, checkoutProduct]);

  useEffect(() => {
    let interval: any;
    if (phase === 'thinking') {
      // Force scroll to top when entering thinking phase
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      interval = setInterval(() => {
        setThinkingIndex((prev) => (prev + 1) % thinkingMessages.length);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [phase]);

  const startCoCreation = async (initialValues?: Partial<UserInputs>) => {
    // Reset session to start fresh - prevents session merging in dashboard
    useSessionStore.getState().resetSession();

    // Determine initial Values
    let startValues = initialValues;

    // console.debug("🚀 startCoCreation called. initialValues:", initialValues, "heroTopic:", heroTopic);

    // UX FIX: If no specific values passed (e.g. Navbar button), BUT user typed in Hero, use that!
    if (!startValues && heroTopic && heroTopic.trim().length > 0) {
      // console.debug("💡 Using heroTopic as startValues:", heroTopic);
      startValues = { topic: heroTopic };
    }

    // If we have initial values (from "I want one like this" or Hero input), set them
    if (startValues) {
      // console.debug("✅ Setting inputs with startValues:", startValues);
      setInputs(prev => ({ ...prev, ...startValues }));
    } else {
      // console.debug("⚠️ No startValues, resetting inputs.");
      // Reset if starting fresh
      setInputs({
        childName: '',
        topic: '', // Explicitly clear if really fresh
        artStyle: ArtStyle.Pixar
      });
    }

    setPhase('chat');
    trackEvent('chat_start', { hasTopic: !!startValues?.topic });
    // Force scroll to top immediately - multiple methods to ensure it works
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }, 0);
  };

  const handleCoCreationComplete = async (finalInputs: UserInputs) => {
    setInputs(finalInputs);
    setPhase('thinking');
    setError(null);
    try {
      // Generate story with the confirmed title
      const { story: generatedStory, imagePrompt, generationMeta: storyGenerationMeta } = await generateStoryBlueprint(finalInputs);
      const { compositeUrl, generationMeta: imageGenerationMeta } = await generateCompositeImage(
        imagePrompt,
        finalInputs.characterImage,
        finalInputs.parentImage,
        finalInputs.thirdCharacterImage,
        finalInputs.age,
        finalInputs.artStyle,
        {
          parentName: finalInputs.parentName,
          parentCharacter: finalInputs.parentCharacter,
          parentCharacterRole: finalInputs.parentCharacterRole,
          parentGender: finalInputs.parentGender,
          parentAge: finalInputs.parentAge,
        }
      );

      const fullStory = {
        ...generatedStory,
        composite_image_url: compositeUrl,
        source_image_url: compositeUrl,
        display_image_url: compositeUrl,
      };
      setStory(fullStory);
      setPhase('view');
      trackEvent('book_generated', { title: generatedStory.title, artStyle: finalInputs.artStyle });

      // PRIVACY: Clear original photos from memory - they are no longer needed
      setInputs(prev => ({
        ...prev,
        characterImage: undefined,
        parentImage: undefined,
        thirdCharacterImage: undefined,
      }));

      // Save book to Supabase in the background
      const sessionId = useSessionStore.getState().sessionId;
      setBookPersisting(true);
      saveBook(fullStory, finalInputs, sessionId, {
        generationArtifacts: {
          created_at: new Date().toISOString(),
          story: {
            ...storyGenerationMeta,
            prompt_token: imagePrompt,
          },
          image: imageGenerationMeta,
        }
      }).then((book) => {
        if (book) {
          setStory(bookRecordToStory(book));
          setBookSlug(book.slug);
          // Update URL without reload so the book has a shareable link
          window.history.pushState({}, '', `/book/${book.slug}`);

          // Send "Book Ready" email if email was captured
          if (finalInputs.email) {
            sendReadyEmail(finalInputs.email, book.slug, fullStory.title);
          }
        }
      }).finally(() => {
        setBookPersisting(false);
      });
    } catch (e: any) {
      console.error("Error in handleCoCreationComplete:", e);
      const errorMessage = String(e?.message || '');

      if (errorMessage === "API_KEY_ERROR" || errorMessage.includes("API key not valid")) {
        setError("מפתח שירות הבינה לא תקין. בדקו את הגדרות השרת ונסו שוב.");
      } else if (errorMessage === "BILLING_REQUIRED") {
        setError("שירות היצירה חסום כרגע עקב הגדרת חיוב. בדקו את הגדרות החיוב של ספק ה-AI.");
      } else if (errorMessage.includes("AI_TIMEOUT")) {
        const lower = errorMessage.toLowerCase();
        if (lower.includes('image')) {
          setError("יצירת התמונה לקחה יותר מדי זמן. נסו שוב בלחיצה אחת.");
        } else {
          setError("יצירת הספר לקחה יותר מדי זמן. נסו שוב בלחיצה אחת.");
        }
      } else {
        setError("אופס, הייתה תקלה זמנית ביצירת הספר. נסו שוב.");
      }
      setPhase('chat');
    }
  };

  const handlePaymentSuccess = () => {
    if (story) {
      setStory({ ...story, is_unlocked: true });
      setPhase('view');
      trackEvent('payment_complete', { bookSlug, product: checkoutProduct });
    }
  };

  useEffect(() => {
    if (phase !== 'view' || !story) return;
    const viewKey = bookSlug || story.title;
    if (!viewKey || trackedBookViewRef.current === viewKey) return;
    trackedBookViewRef.current = viewKey;
    trackEvent('book_viewed', {
      bookSlug: bookSlug || null,
      isUnlocked: Boolean(story.is_unlocked),
      segmentsCount: Array.isArray(story.segments) ? story.segments.length : 0,
    });
  }, [phase, story, bookSlug]);

  // UseCases on landing page now opens the Gallery instead of the specific book
  const handleCategoryClick = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setPhase('gallery');
    window.scrollTo(0, 0);
  };

  const handleInspirationClick = (example: InspirationExample) => {
    setActiveInspiration(example);
    if (example.storyId && demoStories[example.storyId]) {
      setStory(demoStories[example.storyId]);
      // Do NOT change phase, just set the story and activeInspiration to show Overlay
    }
  };

  const handleBackFromInspiration = () => {
    setActiveInspiration(null);
    setStory(null);
    // Phase remains 'gallery'
  };

  useEffect(() => {
    if (devPopupFromUrl === 'auth') {
      setShowAuthModal(true);
    }
  }, [devPopupFromUrl]);

  useEffect(() => {
    if (devPopupFromUrl !== 'inspiration') return;
    if (phase !== 'gallery' || !selectedCategory || activeInspiration) return;

    const category = inspirationCategories[selectedCategory];
    const firstExample = category?.examples?.[0];
    if (!firstExample) return;

    setActiveInspiration(firstExample);
    if (firstExample.storyId && demoStories[firstExample.storyId]) {
      setStory(demoStories[firstExample.storyId]);
    } else {
      setStory(demoStory);
    }
  }, [devPopupFromUrl, phase, selectedCategory, activeInspiration]);

  // KEEP handleBookClick for the "demo mode" (if accessed directly or via gallery later)
  const handleBookClick = (bookId: string) => {
    const selectedStory = demoStories[bookId];
    if (selectedStory) {
      setStory(selectedStory);
      setPhase('view');
      // Force scroll to top
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  };


  return (
    <AuthProvider>
      <I18nProvider>
        <div className="min-h-screen flex flex-col">
          {isMockMode() && <MockModeBanner />}
          {/* Auth Modal */}
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onSuccess={() => {
              setPhase('my-books');
              window.history.pushState({}, '', '/my-books');
            }}
          />
          {phase === 'chat' ? (
            <div className="hidden md:block">
              <MainContainer>
                <Navbar
                  onStartCoCreation={() => startCoCreation()}
                  onLoginClick={() => setShowAuthModal(true)}
                  onMyBooks={() => {
                    setPhase('my-books');
                    window.history.pushState({}, '', '/my-books');
                    window.scrollTo(0, 0);
                  }}
                  onLogoClick={() => {
                    setPhase('landing');
                    window.scrollTo(0, 0);
                    if (phase === 'test') {
                      localStorage.removeItem('flipbook_test_mode');
                    }
                    window.history.pushState({}, '', '/');
                  }}
                />
              </MainContainer>
            </div>
          ) : (
            <MainContainer>
              <Navbar
                onStartCoCreation={() => startCoCreation()}
                onLoginClick={() => setShowAuthModal(true)}
                onMyBooks={() => {
                  setPhase('my-books');
                  window.history.pushState({}, '', '/my-books');
                  window.scrollTo(0, 0);
                }}
                onLogoClick={() => {
                  setPhase('landing');
                  window.scrollTo(0, 0);
                  // Also exit test mode if active
                  if (phase === 'test') {
                    localStorage.removeItem('flipbook_test_mode');
                  }
                  window.history.pushState({}, '', '/');
                }}
              />
            </MainContainer>
          )}

          <main id="main-content" className="flex-grow">
            {bookLoading && (
              <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-10">
                <div className="relative w-20 h-20 mb-8">
                  <div className="absolute inset-0 border-4 border-[#FFC72C]/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-[#FFC72C] border-t-transparent rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center text-2xl">📖</div>
                </div>
                <h2 className="text-2xl font-heading font-black text-[#1A1A1A]">טוען את הספר...</h2>
              </div>
            )}

            {!bookLoading && error && phase !== 'chat' && (
              <MainContainer>
                <div className="max-w-2xl mx-auto mt-6 mobile-gutter bg-red-50 border border-red-200 text-red-600 p-6 rounded-card text-center space-y-4">
                  <p className="font-semibold text-base md:text-lg">{error}</p>
                  <button
                    onClick={() => setPhase('chat')}
                    className="btn-danger px-6 py-2 rounded-full text-sm font-semibold"
                  >
                    נסה שוב
                  </button>
                </div>
              </MainContainer>
            )}

            {phase === 'landing' && (
              <>
                <RevealOnScroll eager delayMs={20}>
                  <MainContainer>
                    <Hero
                      onStart={(topic) => startCoCreation(topic ? { topic } : undefined)}
                      inputValue={heroTopic}
                      onInputChange={setHeroTopic}
                    />
                  </MainContainer>
                </RevealOnScroll>





                <RevealOnScroll eager delayMs={90}>
                  <MainContainer>
                    <ScrollArrow />
                  </MainContainer>
                </RevealOnScroll>

                <RevealOnScroll delayMs={20}>
                  <MainContainer>
                    {/* Pass handleCategoryClick to open the Gallery Page */}
                    <UseCases onBookClick={handleCategoryClick} />
                  </MainContainer>
                </RevealOnScroll>

                <RevealOnScroll delayMs={40}>
                  <MainContainer>
                    <HowItWorks />
                  </MainContainer>
                </RevealOnScroll>

                <RevealOnScroll delayMs={55}>
                  <FeatureStrip />
                </RevealOnScroll>

                <RevealOnScroll delayMs={65}>
                  <MainContainer>
                    <Testimonials />
                  </MainContainer>
                </RevealOnScroll>

                <RevealOnScroll delayMs={75}>
                  <MainContainer>
                    <FAQ />
                  </MainContainer>
                </RevealOnScroll>
              </>
            )}

            {phase === 'gallery' && selectedCategory && (
              <CategoryGalleryPage
                categoryId={selectedCategory}
                onBack={() => {
                  setPhase('landing');
                  window.history.pushState({}, '', '/');
                }}
                onExampleClick={handleInspirationClick}
              />
            )}

            {phase === 'chat' && (
              <>
                <div className="hidden md:block">
                  <MainContainer>
                    <section className="pt-16 md:pt-24 pb-16 md:pb-24">
                      <ChatInterface
                        onComplete={handleCoCreationComplete}
                        initialValues={inputs}
                        topError={error || undefined}
                        onDismissError={() => setError(null)}
                      />
                    </section>
                  </MainContainer>
                </div>
                <div className="md:hidden">
                  <ChatInterface
                    onComplete={handleCoCreationComplete}
                    initialValues={inputs}
                    topError={error || undefined}
                    onDismissError={() => setError(null)}
                    onBack={() => {
                      setPhase('landing');
                      window.history.pushState({}, '', '/');
                    }}
                  />
                </div>
              </>
            )}

            {phase === 'thinking' && (
              <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-10">
                <div className="relative w-24 h-24 mb-10">
                  <div className="absolute inset-0 border-4 border-[#FFC72C]/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-[#FFC72C] border-t-transparent rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center text-3xl">🧩</div>
                </div>
                <h2 className="text-3xl md:text-4xl font-black text-[#1A1A1A] transition-all duration-500 min-h-[1.2em]">
                  {thinkingMessages[thinkingIndex]}
                </h2>
              </div>
            )}

            {(phase === 'teaser' || phase === 'view' || phase === 'test') && story && !error && (

              <div className="w-full min-h-screen">
                <div className="w-full">
                  <BookSalesPage
                    story={story}
                    inputs={inputs}
                    devPopup={devPopupFromUrl}
                    onUnlock={(productType) => {
                      if (bookPersisting || !bookSlug) {
                        window.alert('אנחנו עדיין שומרים את הספר. נסו שוב בעוד כמה שניות.');
                        return;
                      }
                      setCheckoutProduct(productType || 'digital');
                      setPhase('register');
                    }}
                    onSave={() => setPhase('register')}
                  />
                </div>



              </div>
            )}

            {phase === 'register' && (
              <RegistrationView onComplete={(email) => {
                if (!bookSlug) {
                  window.alert('הספר עדיין לא נשמר. חזרו לעמוד הקודם ונסו שוב בעוד כמה שניות.');
                  setPhase('view');
                  return;
                }
                // Save email to book record and store in state
                setUserEmail(email);
                trackEvent('register_complete', { hasEmail: Boolean(email), bookSlug });
                if (bookSlug && email) {
                  updateBookEmail(bookSlug, email);
                }
                setPhase('payment');
              }} />
            )}

            {phase === 'payment' && (
              <PaymentView
                childName={inputs.childName}
                bookSlug={bookSlug}
                story={story}
                email={userEmail}
                initialProduct={checkoutProduct}
                onSuccess={handlePaymentSuccess}
              />
            )}

            {phase === 'terms' && (
              <TermsOfService onBack={() => { setPhase('landing'); window.history.pushState({}, '', '/'); }} />
            )}

            {phase === 'privacy' && (
              <PrivacyPolicy onBack={() => { setPhase('landing'); window.history.pushState({}, '', '/'); }} />
            )}

            {phase === 'contact' && (
              <ContactPage onBack={() => { setPhase('landing'); window.history.pushState({}, '', '/'); }} />
            )}

            {phase === 'accessibility' && (
              <AccessibilityStatement onBack={() => { setPhase('landing'); window.history.pushState({}, '', '/'); }} />
            )}

            {phase === 'cancellation' && (
              <CancellationPolicy onBack={() => { setPhase('landing'); window.history.pushState({}, '', '/'); }} />
            )}

            {phase === 'my-books' && (
              <MyBooks
                onBookClick={(slug) => {
                  window.history.pushState({}, '', `/book/${slug}`);
                  window.location.reload(); // Reload to trigger book loading
                }}
                onBack={() => {
                  setPhase('landing');
                  window.history.pushState({}, '', '/');
                }}
                onLoginClick={() => setShowAuthModal(true)}
              />
            )}

            {phase === 'not-found' && (
              <NotFoundPage
                path={window.location.pathname}
                onBack={() => {
                  setPhase('landing');
                  window.history.pushState({}, '', '/');
                  window.scrollTo(0, 0);
                }}
              />
            )}
          </main>

          {phase !== 'chat' && <Footer />}

          {/* Sticky CTA for mobile - only show on landing page, not on internal pages */}
          {phase === 'landing' && (!story || !story.is_unlocked) && !activeInspiration && <StickyCTA onStart={() => startCoCreation()} />}

          {/* Lightbox Overlay for Inspiration Gallery */}
          {
            phase === 'gallery' && activeInspiration && story && (
              <div className="fixed inset-0 z-50 bg-white overflow-y-auto animate-in fade-in duration-200">
                <MainContainer>
                  <div className="pt-20 md:pt-28 pb-12">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        onClick={handleBackFromInspiration}
                        className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-gray-200 bg-white text-black font-bold hover:border-[#f6c85b] transition-colors"
                        style={{ color: '#000000' }}
                      >
                        חזרה לגלריה
                      </button>
                      <button
                        onClick={handleBackFromInspiration}
                        className="w-10 h-10 rounded-full border border-gray-200 bg-white text-black text-xl leading-none hover:border-[#f6c85b]"
                        aria-label="סגירה"
                      >
                        ×
                      </button>
                    </div>

                    <div className="text-center mt-6 md:mt-8">
                      <h2 className="font-heading font-extrabold text-black text-2xl sm:text-3xl md:text-5xl leading-tight mb-2" style={{ color: '#000000' }}>
                        {activeInspiration.title}
                      </h2>
                      <p className="font-normal text-black text-sm md:text-base leading-relaxed max-w-3xl mx-auto" style={{ color: '#000000' }}>
                        דפדפו בתצוגה המקדימה וקבלו תחושה של הספר לפני שמתחילים ליצור גרסה משלכם.
                      </p>
                    </div>

                    <div className="mt-8 bg-surfaceLight rounded-card border border-gray-200 py-6 md:py-8 px-2 md:px-6">
                      <div className="hidden md:flex justify-center">
                        <FlipbookView
                          story={story}
                          onUnlock={() => { }}
                          isPreview={true}
                          transparentBackground={true}
                          showToolbar={true}
                        />
                      </div>
                      <div className="md:hidden">
                        <MobileBookView
                          story={story}
                          onUnlock={() => { }}
                          onRequestFlipbook={() => { }}
                          cleanMode={true}
                          isPreviewMode={true}
                          hideSecondaryControls={true}
                          heroName={story.heroName || inputs.childName || 'הגיבור/ה'}
                        />
                      </div>
                    </div>

                    <div className="w-full max-w-[820px] mx-auto mt-6">
                      <Button
                        onClick={() => {
                          let parentCharacter = undefined;
                          if (selectedCategory === 'couples') parentCharacter = 'mother';

                          startCoCreation({
                            topic: activeInspiration.prompt,
                            artStyle: activeInspiration.artStyle,
                            parentCharacter
                          })
                        }}
                        className="w-full h-12 md:h-14 text-base md:text-xl font-bold rounded-full transition-all flex items-center justify-center gap-2"
                        style={{ backgroundColor: designSystem.colors.primary, color: designSystem.colors.text }}
                      >
                        אני רוצה בול כזה
                      </Button>
                      <p className="text-center mt-3 text-sm font-normal" style={{ color: '#000000' }}>
                        הפרומפט: "{activeInspiration.prompt}"
                      </p>
                    </div>
                  </div>
                </MainContainer>
              </div>
            )
          }
        </div >

        {/* Cookie Consent Banner */}
        <CookieConsent />

        {/* Support assistant: hidden during book creation chat to avoid overlay conflicts */}
        {phase !== 'chat' && (
          <SupportChatWidget forceOpen={devPopupFromUrl === 'support-chat'} />
        )}
      </I18nProvider >
    </AuthProvider>
  );
};

const RegistrationView = ({ onComplete }: { onComplete: (email: string) => void }) => {
  const [email, setEmail] = useState('');
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return (
    <div className="max-w-md mx-auto pt-24 md:pt-28 pb-16 px-4 sm:px-6 text-center mobile-gutter" dir="rtl">
      <div className="bg-[#F4F5F7] rounded-3xl border border-gray-200 overflow-hidden">
        {/* Yellow accent bar */}
        <div className="h-1.5 bg-gradient-to-l from-[#f6c85b] to-[#f6c85b]/40" />

        <div className="p-6 sm:p-8 md:p-10 space-y-8">
          {/* Styled icon */}
          <div className="w-20 h-20 bg-gradient-to-br from-[#f6c85b]/20 to-[#f6c85b]/5 rounded-full flex items-center justify-center mx-auto">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f6c85b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl md:text-3xl font-heading font-black text-black" style={{ color: '#000000' }}>לאן לשלוח את הספר?</h2>
            <p className="text-black font-normal text-sm md:text-base leading-relaxed" style={{ color: '#000000' }}>הזינו אימייל כדי לשמור את הסיפור ולפתוח את הגרסה המלאה.</p>
          </div>

          <div className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              dir="ltr"
              className="w-full px-6 py-4 rounded-2xl bg-white border-2 border-gray-200 focus:border-[#f6c85b] outline-none text-center font-semibold text-lg shadow-sm transition-all"
            />
            <button
              onClick={() => onComplete(email)}
              disabled={!isValidEmail}
              className="btn-primary w-full py-4 text-lg font-black text-black disabled:opacity-50 rounded-full"
            >
              שמור והמשך לתשלום ✨
            </button>
          </div>

          <p className="text-xs text-black/40 font-normal">🔒 המייל שלך לא ישותף עם צד שלישי</p>
        </div>
      </div>
    </div>
  );
};

const PaymentView = ({
  childName,
  bookSlug,
  story,
  email: userEmail = '',
  initialProduct = 'digital',
  onSuccess
}: {
  childName: string,
  bookSlug: string | null,
  story: Story | null,
  email?: string,
  initialProduct?: 'digital' | 'print',
  onSuccess: () => void
}) => {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<'digital' | 'print'>(initialProduct);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [statusHint, setStatusHint] = useState<string>('');
  const [coupon, setCoupon] = useState('');
  const [couponResult, setCouponResult] = useState<{ valid: boolean; discount_percent?: number; message: string } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const paymentCompletedRef = useRef(false);

  useEffect(() => {
    setSelectedProduct(initialProduct);
  }, [initialProduct]);

  const handleValidateCoupon = async () => {
    if (!coupon.trim()) return;
    setCouponLoading(true);
    setCouponResult(null);
    try {
      const res = await fetch('/api/coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: coupon.trim() })
      });
      const data = await res.json();
      setCouponResult(data);
    } catch {
      setCouponResult({ valid: false, message: 'שגיאה בבדיקת הקופון' });
    }
    setCouponLoading(false);
  };

  const handlePay = async () => {
    setLoading(selectedProduct);
    setError(null);
    setStatusHint('');
    setIframeUrl(null);
    paymentCompletedRef.current = false;
    trackEvent('payment_start', {
      bookSlug,
      product: selectedProduct,
      couponApplied: Boolean(couponResult?.valid),
    });

    if (!bookSlug) {
      setError('הספר עדיין נשמר ברקע. נסו שוב בעוד כמה שניות.');
      setLoading(null);
      return;
    }

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: await (async () => {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (supabase) {
            try {
              const { data } = await supabase.auth.getSession();
              if (data.session?.access_token) {
                headers.Authorization = `Bearer ${data.session.access_token}`;
              }
            } catch {
              // Ignore auth lookup errors and proceed with token-based ownership.
            }
          }
          return headers;
        })(),
        body: JSON.stringify({
          productType: selectedProduct,
          bookSlug,
          email: userEmail,
          customerName: childName || undefined,
          couponCode: couponResult?.valid ? coupon.trim().toUpperCase() : undefined,
          access_token: bookSlug ? getBookToken(bookSlug) : undefined,
        })
      });

      const data = await res.json();

      if (!res.ok) {
        const message =
          (typeof data?.message === 'string' && data.message) ||
          (typeof data?.error === 'string' && data.error) ||
          'לא הצלחנו להתחיל את התשלום. נסו שוב.';
        setError(message);
        setLoading(null);
        return;
      }

      if (data.iframeUrl) {
        setIframeUrl(data.iframeUrl);
        setStatusHint('התשלום נפתח בתוך העמוד. לאחר אישור נעדכן אוטומטית.');
        setLoading(null);
        return;
      }

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }

      if (data.provider === 'demo') {
        setTimeout(() => { onSuccess(); }, 2000);
        return;
      }

      setError('לא הצלחנו להתחיל את התשלום. נסו שוב.');
      setLoading(null);
    } catch {
      setError('שגיאה בחיבור לשרת. נסו שוב.');
      setLoading(null);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutState = (params.get('checkout') || '').trim().toLowerCase();
    const paidFlag = params.get('paid') === 'true';

    if (checkoutState === 'failed') {
      setError('התשלום לא אושר. אפשר לנסות שוב.');
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (checkoutState === 'cancelled') {
      setStatusHint('התשלום בוטל. אפשר לחזור ולנסות שוב.');
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (paidFlag || checkoutState === 'success') {
      paymentCompletedRef.current = true;
      onSuccess();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!iframeUrl || !bookSlug) return;

    let disposed = false;
    const interval = window.setInterval(async () => {
      if (disposed || paymentCompletedRef.current) return;
      try {
        const res = await fetch('/api/book', {
          method: 'POST',
          headers: await getApiHeaders(true),
          body: JSON.stringify({ action: 'verify_payment', slug: bookSlug }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.payment_status === 'paid' || data?.is_unlocked === true) {
          paymentCompletedRef.current = true;
          setStatusHint('התשלום אושר. מעבירים אותך לספר...');
          window.clearInterval(interval);
          setTimeout(() => onSuccess(), 350);
        }
      } catch {
        // Keep polling silently; user may still complete payment.
      }
    }, 2500);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [iframeUrl, bookSlug, onSuccess]);

  const basePrice = selectedProduct === 'digital' ? 39 : 149;
  const discountPercent = couponResult?.valid ? (couponResult.discount_percent || 0) : 0;
  const discountAmount = Math.round(basePrice * discountPercent / 100);
  const price = basePrice - discountAmount;
  const canSubmitPayment = loading === null;
  const selectedProductTitle = selectedProduct === 'digital' ? 'מהדורה דיגיטלית' : 'ספר מודפס + דיגיטלי';
  const storyDisplayImageUrl = story?.display_image_url || story?.composite_image_url || '';
  const previewBackgroundSize = story
    ? getStoryboardBackgroundSize(resolveStoryboardLayout(story.segments?.length || 0))
    : '400% 300%';

  return (
    <div className="w-full pt-20 md:pt-28 pb-10 md:pb-16" dir="rtl">
      <div className="w-full max-w-[1300px] mx-auto px-4 md:px-8 space-y-6">
        <div className="text-center">
          <h2 className="font-heading font-extrabold text-black text-2xl sm:text-3xl md:text-5xl" style={{ color: '#000000' }}>
            סיכום הזמנה ותשלום
          </h2>
        </div>

        <>
          <section className="bg-white rounded-card border border-gray-200 p-4 sm:p-5 md:p-6 space-y-5">
            <div className="flex items-start gap-4">
              {storyDisplayImageUrl ? (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-card overflow-hidden border border-gray-200 shrink-0">
                  <div
                    className="w-full h-full bg-cover"
                    style={{
                      backgroundImage: `url(${storyDisplayImageUrl})`,
                      backgroundSize: previewBackgroundSize,
                      backgroundPosition: '0% 0%',
                    }}
                    aria-label="כריכת הספר"
                  />
                </div>
              ) : (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-card bg-[#F4F5F7] border border-gray-200 flex items-center justify-center text-3xl shrink-0">
                  📖
                </div>
              )}

              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="font-heading font-black text-black text-xl md:text-2xl truncate" style={{ color: '#000000' }}>
                  {story?.title || `הספר של ${childName}`}
                </p>
                <p className="font-normal text-black text-sm md:text-base" style={{ color: '#000000' }}>
                  12 עמודי סיפור מאוירים
                </p>
                <p className="font-normal text-black text-sm md:text-base" style={{ color: '#000000' }}>
                  דמות ראשית: {childName}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="font-heading font-black text-black text-xl md:text-2xl" style={{ color: '#000000' }}>
                אפשרות רכישה
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedProduct('digital')}
                  className={`w-full rounded-card p-5 flex items-center gap-4 border-2 transition-all text-right ${selectedProduct === 'digital'
                    ? 'border-[#f6c85b] bg-[#f6c85b]/10'
                    : 'border-gray-200 bg-white hover:border-[#f6c85b]/60'
                    }`}
                >
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedProduct === 'digital' ? 'border-[#f6c85b]' : 'border-gray-300'}`}>
                    {selectedProduct === 'digital' && <div className="w-3 h-3 rounded-full bg-[#f6c85b]" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-heading font-black text-black text-lg" style={{ color: '#000000' }}>דיגיטלי (PDF)</p>
                    <p className="font-normal text-black text-sm md:text-base" style={{ color: '#000000' }}>גישה מיידית + הורדת PDF מלא</p>
                  </div>
                  <div className="text-left shrink-0 space-y-0.5">
                    <p className="font-heading font-black text-black text-xl" style={{ color: '#000000' }}>₪39</p>
                    <p className="font-normal text-black text-xs line-through" style={{ color: '#000000' }}>₪89</p>
                  </div>
                </button>

                <button
                  onClick={() => setSelectedProduct('print')}
                  className={`w-full rounded-card p-5 flex items-center gap-4 border-2 transition-all text-right ${selectedProduct === 'print'
                    ? 'border-[#f6c85b] bg-[#f6c85b]/10'
                    : 'border-gray-200 bg-white hover:border-[#f6c85b]/60'
                    }`}
                >
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedProduct === 'print' ? 'border-[#f6c85b]' : 'border-gray-300'}`}>
                    {selectedProduct === 'print' && <div className="w-3 h-3 rounded-full bg-[#f6c85b]" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-heading font-black text-black text-lg" style={{ color: '#000000' }}>מודפס (כריכה קשה) + דיגיטלי</p>
                    <p className="font-normal text-black text-sm md:text-base" style={{ color: '#000000' }}>כולל משלוח עד הבית + קובץ PDF</p>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="font-heading font-black text-black text-xl" style={{ color: '#000000' }}>₪149</p>
                  </div>
                </button>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-card border border-gray-200 p-4 sm:p-5 md:p-6 space-y-4">
            <div>
              <h3 className="font-heading font-black text-black text-xl md:text-2xl mb-2" style={{ color: '#000000' }}>
                מה כלול
              </h3>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-2.5 text-sm md:text-base font-normal text-black" style={{ color: '#000000' }}>
                <li className="flex items-center gap-2.5">
                  <span className="w-5 h-5 bg-[#4b947d]/10 rounded-full flex items-center justify-center shrink-0"><span className="text-[#4b947d] text-xs font-bold">✓</span></span>
                  12 עמודי סיפור מאוירים בהתאמה אישית
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-5 h-5 bg-[#4b947d]/10 rounded-full flex items-center justify-center shrink-0"><span className="text-[#4b947d] text-xs font-bold">✓</span></span>
                  פתיחה מיידית של כל העמודים
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-5 h-5 bg-[#4b947d]/10 rounded-full flex items-center justify-center shrink-0"><span className="text-[#4b947d] text-xs font-bold">✓</span></span>
                  קובץ PDF מלא באיכות גבוהה להורדה
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-5 h-5 bg-[#4b947d]/10 rounded-full flex items-center justify-center shrink-0"><span className="text-[#4b947d] text-xs font-bold">✓</span></span>
                  אפשרות לעריכת טקסט וצבעים
                </li>
                {selectedProduct === 'print' && (
                  <>
                    <li className="flex items-center gap-2.5">
                      <span className="w-5 h-5 bg-[#4b947d]/10 rounded-full flex items-center justify-center shrink-0"><span className="text-[#4b947d] text-xs font-bold">✓</span></span>
                      ספר כריכה קשה מודפס באיכות פרימיום
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="w-5 h-5 bg-[#4b947d]/10 rounded-full flex items-center justify-center shrink-0"><span className="text-[#4b947d] text-xs font-bold">✓</span></span>
                      משלוח עד הבית
                    </li>
                  </>
                )}
              </ul>
            </div>

            <div className="space-y-2">
              <label className="block font-normal text-black text-sm" style={{ color: '#000000' }}>קוד קופון (אופציונלי)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={coupon}
                  onChange={e => { setCoupon(e.target.value); setCouponResult(null); }}
                  placeholder="קוד קופון"
                  className="flex-1 px-4 py-3 rounded-xl bg-[#F4F5F7] border-2 border-transparent focus:border-[#f6c85b] outline-none text-sm"
                  dir="ltr"
                />
                <button
                  disabled={!coupon.trim() || couponLoading}
                  onClick={handleValidateCoupon}
                  className="px-5 py-3 bg-[#F4F5F7] hover:bg-gray-200 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
                >
                  {couponLoading ? '...' : 'הפעל'}
                </button>
              </div>
              {couponResult && (
                <p className={`text-sm font-normal ${couponResult.valid ? 'text-[#4b947d]' : 'text-[#eea78f]'}`}>
                  {couponResult.message}
                </p>
              )}
            </div>

            <div className="rounded-card border border-gray-200 bg-white p-4 space-y-2">
              <div className="flex justify-between text-sm md:text-base">
                <span className="font-normal text-black" style={{ color: '#000000' }}>{selectedProductTitle}</span>
                <span className="font-black text-black" style={{ color: '#000000' }}>₪{basePrice}</span>
              </div>
              {selectedProduct === 'digital' && (
                <div className="flex justify-between text-sm md:text-base">
                  <span className="font-normal text-black" style={{ color: '#000000' }}>הנחת השקה</span>
                  <span className="font-black text-[#4b947d]">-₪50</span>
                </div>
              )}
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm md:text-base">
                  <span className="font-normal text-black" style={{ color: '#000000' }}>קופון ({discountPercent}%)</span>
                  <span className="font-black text-[#4b947d]">-₪{discountAmount}</span>
                </div>
              )}
              <div className="h-px bg-gray-300" />
              <div className="flex justify-between items-center">
                <span className="font-heading font-black text-black text-xl md:text-2xl" style={{ color: '#000000' }}>סה"כ לתשלום</span>
                <span className="font-heading font-black text-black text-xl md:text-2xl" style={{ color: '#000000' }}>₪{price}</span>
              </div>
            </div>

            <button
              onClick={handlePay}
              disabled={!canSubmitPayment}
              className="w-full mt-1 py-5 bg-[#f6c85b] hover:bg-[#e8bc54] text-black text-xl font-heading font-black rounded-full flex items-center justify-center gap-3 disabled:opacity-70 transition-all"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              ) : (
                iframeUrl ? `יצירת בקשת תשלום חדשה · ₪${price}` : `מעבר לתשלום מאובטח · ₪${price}`
              )}
            </button>
          </section>

          {error && (
            <div className="bg-red-50 border border-red-200 text-[#eea78f] p-3 rounded-card text-center text-sm font-normal">
              {error}
            </div>
          )}

          {statusHint && (
            <div className="bg-[#f6c85b]/10 border border-[#f6c85b]/30 text-black p-3 rounded-card text-center text-sm font-normal" style={{ color: '#000000' }}>
              {statusHint}
            </div>
          )}

          <div className="text-center space-y-1">
            <p className="font-normal text-black text-xs" style={{ color: '#000000' }}>
              🔒 תשלום מאובטח · ביטול לפי החוק · ללא התחייבות
            </p>
          </div>
        </>

        {iframeUrl && (
          <section className="bg-white rounded-card border border-gray-200 p-4 sm:p-5 space-y-3">
            <h3 className="font-heading font-black text-black text-xl md:text-2xl text-center" style={{ color: '#000000' }}>
              השלימו תשלום מאובטח בתוך האתר
            </h3>
            <div className="overflow-hidden rounded-card border border-gray-200 bg-white">
              <iframe
                src={iframeUrl}
                title="Secure checkout"
                className="w-full min-h-[640px] md:min-h-[760px] bg-white"
              />
            </div>
            <div className="text-center space-y-1">
              <button
                type="button"
                onClick={() => window.open(iframeUrl, '_blank', 'noopener,noreferrer')}
                className="text-sm font-bold text-black hover:opacity-70 transition-opacity"
              >
                פתיחה בחלון חדש
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default App;
