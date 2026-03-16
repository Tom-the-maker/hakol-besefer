import React, { useEffect, useRef, useState } from 'react';
import { getBookToken, getOwnedBooks, removeBookOwnership, BookRecord, resolveBookCardImageUrl } from '../lib/bookService';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/auth';
import { LogIn, Trash2, ChevronRight, BookOpen } from 'lucide-react';
import { resolveStoryboardLayout } from '../lib/storyboardLayout';

interface MyBooksProps {
  onBookClick: (slug: string) => void;
  onBack: () => void;
  onLoginClick?: () => void;
}

const MyBooks: React.FC<MyBooksProps> = ({ onBookClick, onBack, onLoginClick }) => {
  const { user } = useAuth();
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const lastLoadedIdentityRef = useRef<string | null>(null);

  useEffect(() => {
    const identityKey = user?.id || user?.email || 'guest';
    if (lastLoadedIdentityRef.current === identityKey) return;
    lastLoadedIdentityRef.current = identityKey;
    void loadBooks();
  }, [user?.id, user?.email]);

  const getDisplayImageUrl = (book: BookRecord): string => {
    return resolveBookCardImageUrl(book);
  };

  const getApiHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (!supabase) return headers;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
    } catch {
      // Ignore auth lookup failures and continue as public request.
    }

    return headers;
  };

  const loadBooksFromApi = async (): Promise<BookRecord[]> => {
    const ownedBooks = Object.entries(getOwnedBooks()).map(([slug, value]) => ({
      slug,
      access_token: value.token,
    }));

    try {
      const response = await fetch('/api/book', {
        method: 'POST',
        headers: await getApiHeaders(),
        body: JSON.stringify({
          action: 'list_owned',
          owned_books: ownedBooks,
        }),
      });

      if (!response.ok) {
        return [];
      }

      const payload = await response.json().catch(() => null);
      return Array.isArray(payload?.books) ? payload.books as BookRecord[] : [];
    } catch {
      return [];
    }
  };

  const loadBooks = async () => {
    setLoading(true);
    setBooks(await loadBooksFromApi());
    setLoading(false);
  };

  const handleDeleteBook = async (slug: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (confirmDelete !== slug) {
      setConfirmDelete(slug);
      return;
    }

    setDeletingSlug(slug);
    try {
      const accessToken = getBookToken(slug);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      // Add auth header if logged in
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      }

      const res = await fetch('/api/delete-book', {
        method: 'POST',
        headers,
        body: JSON.stringify({ bookSlug: slug, accessToken })
      });

      if (res.ok) {
        // Remove from local state and localStorage
        setBooks(prev => prev.filter(b => b.slug !== slug));
        removeBookOwnership(slug);
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
    setDeletingSlug(null);
    setConfirmDelete(null);
  };

  return (
    <div className="w-full" dir="rtl">
      <div className="w-full max-w-[1300px] mx-auto px-4 md:px-8">
        <div className="pt-24 md:pt-32 pb-6 md:pb-8">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-gray-200 bg-white text-black font-bold hover:border-[#f6c85b] transition-colors"
            style={{ color: '#000000' }}
          >
            <ChevronRight className="w-4 h-4" />
            חזרה לדף הבית
          </button>

          <div className="text-center mt-6 md:mt-8">
            <h1 className="font-heading font-extrabold text-black text-2xl sm:text-3xl md:text-5xl leading-tight px-2 mb-3" style={{ color: '#000000' }}>
              הספרים שלי
            </h1>
            <p className="font-normal text-black text-sm md:text-base leading-relaxed max-w-3xl mx-auto px-2" style={{ color: '#000000' }}>
              כל הספרים שיצרתם במקום אחד
            </p>
          </div>
        </div>

        <div className="space-y-6 pb-10 md:pb-16">

          {!user && (
            <section className="bg-white rounded-card border border-gray-200 p-4 md:p-6 flex items-start gap-4">
              <div className="w-10 h-10 bg-[#f6c85b]/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                <LogIn size={18} className="text-black" />
              </div>
              <div className="flex-1">
                <p className="font-heading font-black text-black text-xl md:text-2xl" style={{ color: '#000000' }}>
                  כניסה לחשבון שלכם
                </p>
                <p className="font-normal text-black text-sm md:text-base mt-1" style={{ color: '#000000' }}>
                  התחברו עם מייל כדי לראות את הספרים שלכם מכל מכשיר.
                </p>
                {onLoginClick && (
                  <button
                    onClick={onLoginClick}
                    className="mt-4 inline-flex items-center justify-center px-6 py-3 bg-[#f6c85b] hover:bg-[#e8bc54] text-black text-sm md:text-base font-heading font-black rounded-full transition-all"
                  >
                    התחברות עם מייל
                  </button>
                )}
              </div>
            </section>
          )}

          {user && (
            <section className="bg-white rounded-card border border-gray-200 p-4 md:p-5 flex items-center gap-3">
              <div className="w-9 h-9 bg-[#4b947d] rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                {user.email?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <p className="font-normal text-black text-sm md:text-base" style={{ color: '#000000' }}>
                  מחובר/ת כ-{user.email}
                </p>
                <p className="font-normal text-black text-sm" style={{ color: '#000000' }}>
                  הספרים שלכם זמינים מכל מכשיר
                </p>
              </div>
            </section>
          )}

          {loading && (
            <section className="bg-white rounded-card border border-gray-200 p-10 text-center">
              <div className="w-10 h-10 border-4 border-[#f6c85b] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="font-normal text-black text-sm md:text-base" style={{ color: '#000000' }}>טוען ספרים...</p>
            </section>
          )}

          {!loading && books.length === 0 && (
            <section className="bg-white rounded-card border border-gray-200 p-8 md:p-12 text-center">
              <div className="w-20 h-20 bg-[#F4F5F7] rounded-full flex items-center justify-center mx-auto mb-4">
                <BookOpen size={36} className="text-black" />
              </div>
              <h3 className="font-heading font-black text-black text-xl md:text-2xl" style={{ color: '#000000' }}>
                עוד אין לכם ספרים
              </h3>
              <p className="font-normal text-black text-sm md:text-base mt-2" style={{ color: '#000000' }}>
                ברגע שתיצרו ספר, הוא יופיע כאן.
              </p>
              <button
                onClick={onBack}
                className="mt-5 inline-flex items-center justify-center px-8 py-3 bg-[#f6c85b] hover:bg-[#e8bc54] text-black text-sm md:text-base font-heading font-black rounded-full transition-all"
              >
                צור ספר ראשון
              </button>
            </section>
          )}

          {!loading && books.length > 0 && (
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {books.map((book) => (
                (() => {
                  const segmentCount = Number.isFinite(book.segment_count)
                    ? Number(book.segment_count)
                    : (Array.isArray(book.segments) ? book.segments.length : 0);
                  const layout = resolveStoryboardLayout(segmentCount);
                  const coverImageUrl = getDisplayImageUrl(book);

                  return (
                    <article
                      key={book.slug}
                      className="w-full bg-white rounded-card border border-gray-200 p-4 md:p-5 text-right transition-all hover:border-[#f6c85b] group"
                    >
                      <button
                        type="button"
                        onClick={() => onBookClick(book.slug)}
                        className="w-full text-right"
                      >
                        <div className="flex items-start gap-4">
                          {coverImageUrl ? (
                            <div className="relative w-20 h-20 rounded-card overflow-hidden border border-gray-200 shrink-0 bg-[#F8FAFC]">
                              <img
                                src={coverImageUrl}
                                alt={book.title || `הספר של ${book.child_name}`}
                                loading="lazy"
                                decoding="async"
                                className="absolute top-0 left-0 max-w-none"
                                style={{
                                  width: `${layout.columns * 100}%`,
                                  height: `${layout.rows * 100}%`,
                                }}
                              />
                            </div>
                          ) : (
                            <div className="w-20 h-20 rounded-card bg-[#F4F5F7] border border-gray-200 flex items-center justify-center shrink-0">
                              <BookOpen size={24} className="text-black" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <h3 className="font-heading font-black text-black text-xl md:text-2xl truncate" style={{ color: '#000000' }}>
                              {book.title || `הספר של ${book.child_name}`}
                            </h3>
                            <p className="font-normal text-black text-sm md:text-base truncate mt-1" style={{ color: '#000000' }}>
                              {book.child_name} • {book.art_style}
                            </p>
                            <p className="font-normal text-black text-sm mt-1" style={{ color: '#000000' }}>
                              {new Date(book.created_at).toLocaleDateString('he-IL')}
                            </p>
                          </div>

                          <div className="shrink-0">
                            {book.is_unlocked ? (
                              <span className="px-3 py-1 bg-[#4b947d]/10 text-[#4b947d] text-xs font-bold rounded-full">נרכש</span>
                            ) : (
                              <span className="px-3 py-1 bg-[#f6c85b]/20 text-black text-xs font-bold rounded-full">טיוטה</span>
                            )}
                          </div>
                        </div>
                      </button>

                      <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
                        <span className="font-normal text-black text-sm" style={{ color: '#000000' }}>לפתיחת הספר</span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteBook(book.slug, e)}
                          disabled={deletingSlug === book.slug}
                          className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all ${confirmDelete === book.slug
                            ? 'bg-red-50 text-red-600 font-bold'
                            : 'bg-[#F4F5F7] text-black hover:bg-red-50 hover:text-red-600'
                            }`}
                          title="מחיקת ספר ותמונות"
                        >
                          {deletingSlug === book.slug ? (
                            <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={12} />
                          )}
                          {confirmDelete === book.slug ? 'לחצו שוב למחיקה' : 'מחק'}
                        </button>
                      </div>
                    </article>
                  );
                })()
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyBooks;
