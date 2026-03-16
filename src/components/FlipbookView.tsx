
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Story } from '../types';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { getPDFFileName, getImageFileName } from '../lib/outputPaths';
import { trackEvent } from '../lib/analytics';
import {
  getStoryboardBackgroundPosition,
  getStoryboardBackgroundSize,
  getStoryboardPanelSourceRect,
  resolveStoryboardLayout
} from '../lib/storyboardLayout';
import $ from 'jquery';
import '../lib/turn';
import { designSystem } from '../lib/designSystem';
import { ArrowRight, ArrowLeft, RotateCcw, X, Download, Maximize, MoveVertical, Share2, Save, Edit2 } from 'lucide-react';

interface FlipbookViewProps {
  story: Story;
  onUnlock: () => void;
  onSave?: () => void;
  devPopup?: string | null;
  isPreview?: boolean;
  startInEditMode?: boolean;
  transparentBackground?: boolean;
  showToolbar?: boolean;
  editorMode?: boolean;
  onLockedPageClick?: () => void;
}

const TITLE_FONTS = [
  { id: 'heebo', label: 'Heebo', family: "'Heebo', sans-serif", weight: 700 },
  { id: 'assistant', label: 'Assistant', family: "'Assistant', sans-serif", weight: 700 },
  { id: 'rubik', label: 'Rubik', family: "'Rubik', sans-serif", weight: 700 },
  { id: 'frank', label: 'Frank Ruhl', family: "'Frank Ruhl Libre', serif", weight: 700 },
];

const FlipbookView: React.FC<FlipbookViewProps> = ({
  story,
  onUnlock,
  onSave,
  devPopup,
  isPreview = false,
  startInEditMode = false,
  transparentBackground = false,
  showToolbar = true,
  editorMode = false,
  onLockedPageClick
}) => {
  const displayImageUrl = story.display_image_url || story.composite_image_url;
  const pdfImageUrl = story.source_image_url || story.composite_image_url;
  const bookRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [mountKey, setMountKey] = useState(0);

  // State
  const [isBookOpen, setIsBookOpen] = useState(false);
  const [isAtEnd, setIsAtEnd] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPageCount, setTotalPageCount] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<'idle' | 'copied'>('idle');
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1440, height: 900 });

  // Safety Check: Validate story data
  const hasValidContent = story && Array.isArray(story.segments) && story.segments.length > 0;

  if (!hasValidContent) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <span className="text-4xl mb-4">📚</span>
        <p>טוען את תוכן הספר...</p>
      </div>
    );
  }

  // Download Handlers
  const handleDownloadImage = async () => {
    try {
      if (!bookRef.current) {
        throw new Error('book view not mounted');
      }

      const canvas = await html2canvas(bookRef.current, { scale: 2, useCORS: true });
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = getImageFileName(story.title || 'story');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      trackEvent('book_shared', { channel: 'image_download' });
    } catch (err) {
      console.error("Image download failed", err);
      alert('שגיאה ביצירת קובץ תמונה');
    }
  };

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      // Load source illustration
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = pdfImageUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image load failed'));
      });


      const pageSize = 1200;
      const spreadWidth = pageSize * 2;

      // Canvas for image pages
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No context');

      // === PAGE 1: Cover ===
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [200, 200] });
      canvas.width = pageSize;
      canvas.height = pageSize;
      const coverRect = getStoryboardPanelSourceRect(img.width, img.height, coverAssetIndex, storyboardLayout);
      ctx.drawImage(img, coverRect.sx, coverRect.sy, coverRect.size, coverRect.size, 0, 0, pageSize, pageSize);
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 200, 200);

      // Helper: Create text page element with exact Flipbook styling
      const createTextPageElement = (text: string, pageNum: number): HTMLDivElement => {
        const container = document.createElement('div');
        container.style.cssText = `
          width: ${pageSize}px;
          height: ${pageSize}px;
          background-color: ${pageColor};
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 64px;
          box-sizing: border-box;
          position: absolute;
          left: -9999px;
          top: 0;
          font-family: Georgia, 'Times New Roman', serif;
        `;

        const textEl = document.createElement('p');
        // Scale factor: PDF page (1200px) / Flipbook page (450px) = 2.67
        const scaleFactor = pageSize / 450;
        textEl.style.cssText = `
          color: ${textColor};
          font-size: ${fontSize * scaleFactor}px;

          font-weight: 500;
          font-weight: 500;
          text-align: right;
          direction: rtl;
          line-height: 1.625;
          margin: 0;
          max-width: 100%;
        `;
        textEl.textContent = text;
        container.appendChild(textEl);

        const pageNumEl = document.createElement('div');
        pageNumEl.style.cssText = `
          position: absolute;
          bottom: 48px;
          left: 48px;
          font-size: 32px;
          font-weight: bold;
          color: ${textColor};
          font-family: Arial, sans-serif;
        `;
        pageNumEl.textContent = String(pageNum);
        container.appendChild(pageNumEl);

        return container;
      };

      // === STORY SPREADS ===
      for (let i = 0; i < textPageCount; i++) {
        const panelIndex = i + storyboardLayout.storyPanelOffset;
        const panelRect = getStoryboardPanelSourceRect(img.width, img.height, panelIndex, storyboardLayout);

        pdf.addPage([400, 200], 'landscape');

        // Create spread canvas
        canvas.width = spreadWidth;
        canvas.height = pageSize;

        // LEFT: Text page (rendered via html2canvas for exact styling)
        if (i < editableSegments.length) {
          const textEl = createTextPageElement(editableSegments[i], i + 2);
          document.body.appendChild(textEl);

          const textCanvas = await html2canvas(textEl, {
            width: pageSize,
            height: pageSize,
            scale: 1,
            backgroundColor: pageColor,
            useCORS: true
          });

          document.body.removeChild(textEl);
          ctx.drawImage(textCanvas, 0, 0);
        } else {
          ctx.fillStyle = pageColor;
          ctx.fillRect(0, 0, pageSize, pageSize);
        }

        // RIGHT: Image page
        ctx.drawImage(img, panelRect.sx, panelRect.sy, panelRect.size, panelRect.size, pageSize, 0, pageSize, pageSize);

        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 400, 200);
      }

      // === BACK COVER ===
      pdf.addPage([200, 200], 'portrait');
      canvas.width = pageSize;
      canvas.height = pageSize;
      ctx.fillStyle = '#FFC72C';
      ctx.fillRect(0, 0, pageSize, pageSize);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 80px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('הסוף!', pageSize / 2, pageSize / 2 + 25);
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 200, 200);

      const fileName = getPDFFileName(story.title);
      const pdfBlob = pdf.output('blob') as Blob;
      pdf.save(fileName);
      trackEvent('pdf_downloaded', { source: 'flipbook' });
    } catch (err) {
      console.error('PDF failed:', err);
      alert('שגיאה ביצירת PDF');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleShareCopy = async () => {
    const shareUrl = window.location.href;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareFeedback('copied');
      setShareMenuOpen(false);
      trackEvent('book_shared', { channel: 'copy_link' });
      window.setTimeout(() => setShareFeedback('idle'), 1800);
    } catch {
      // Ignore clipboard failures silently for UX flow
    }
  };

  const handleShareMail = () => {
    const shareUrl = window.location.href;
    const subject = encodeURIComponent(`הספר שלי: ${story.title || 'הספר שלי'}`);
    const body = encodeURIComponent(`היי,\n\nתראו את הספר שלי:\n${shareUrl}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    setShareMenuOpen(false);
    trackEvent('book_shared', { channel: 'email' });
  };

  const handleShareWhatsApp = () => {
    const shareUrl = window.location.href;
    const shareText = encodeURIComponent(`תראו את הספר שלי: ${story.title || 'הספר שלי'}\n${shareUrl}`);
    window.open(`https://wa.me/?text=${shareText}`, '_blank', 'noopener,noreferrer');
    setShareMenuOpen(false);
    trackEvent('book_shared', { channel: 'whatsapp' });
  };

  const handleShareFacebook = () => {
    const shareUrl = encodeURIComponent(window.location.href);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`, '_blank', 'noopener,noreferrer');
    setShareMenuOpen(false);
    trackEvent('book_shared', { channel: 'facebook' });
  };

  const handleShareInstagram = async () => {
    const shareUrl = window.location.href;
    window.open(`https://www.instagram.com/?url=${encodeURIComponent(shareUrl)}`, '_blank', 'noopener,noreferrer');
    setShareMenuOpen(false);
    trackEvent('book_shared', { channel: 'instagram' });
  };



  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen);
  };

  // Customization & Editing
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [pageColor, setPageColor] = useState('#FFFFFF');
  const [textColor, setTextColor] = useState('#1F2937');
  const [fontSize, setFontSize] = useState(20);
  const resolvedSegments = useMemo(() => {
    const direct = Array.isArray(story.segments) ? story.segments : [];
    const hasDirectText = direct.some(seg => typeof seg === 'string' && seg.trim().length > 0);
    if (hasDirectText) return direct;

    const candidateSources = [
      (story as any).storySegments,
      (story as any).textSegments,
      (story as any).pages,
      (story as any).segments_full,
    ];
    for (const source of candidateSources) {
      if (!Array.isArray(source)) continue;
      const mapped = source.map((item: any) => {
        if (typeof item === 'string') return item;
        if (item && typeof item.text === 'string') return item.text;
        if (item && typeof item.content === 'string') return item.content;
        return '';
      });
      if (mapped.some((seg: string) => seg.trim().length > 0)) {
        return mapped;
      }
    }
    return direct;
  }, [story]);
  const [editableSegments, setEditableSegments] = useState<string[]>(resolvedSegments);

  // Title Editing State (match post-purchase cover title design)
  const [titleStyle, setTitleStyle] = useState({
    text: story.title,
    positionY: 15,
    fontSize: 22,
    color: '#FFFFFF',
    fontId: TITLE_FONTS[0].id,
    showGradient: false,
  });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isMovingTitle, setIsMovingTitle] = useState(false);
  const [useCustomCover, setUseCustomCover] = useState(false);
  const [isDraggingTitle, setIsDraggingTitle] = useState(false);
  const coverRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLDivElement>(null);
  const autoEnteredEditRef = useRef(false);

  // Get the display title
  const displayTitle = useCustomCover ? titleStyle.text : '';
  const activeTitleFont = TITLE_FONTS.find(f => f.id === titleStyle.fontId) || TITLE_FONTS[0];

  useEffect(() => {
    if (!shareMenuOpen) return;
    const handleDocMouseDown = (event: MouseEvent) => {
      if (!shareMenuRef.current) return;
      if (!shareMenuRef.current.contains(event.target as Node)) {
        setShareMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocMouseDown);
    return () => document.removeEventListener('mousedown', handleDocMouseDown);
  }, [shareMenuOpen]);

  useEffect(() => {
    if (!isFullScreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullScreen]);

  useEffect(() => {
    const updateViewport = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const enterCoverEditMode = () => {
    setUseCustomCover(true);
    setIsEditingTitle(true);
    setIsMovingTitle(false);
    setCurrentPage(1);
    setIsBookOpen(false);
    setIsAtEnd(false);
    if (bookRef.current) {
      try {
        if ($(bookRef.current).data('turn')) {
          ($(bookRef.current) as any).turn('page', 1);
        }
      } catch { }
    }
    setTimeout(() => {
      const el = titleInputRef.current;
      if (!el) return;
      el.textContent = titleStyle.text;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }, 0);
  };

  const exitCoverEditMode = () => {
    setIsEditingTitle(false);
    setIsMovingTitle(false);
  };

  useEffect(() => {
    if (!startInEditMode || autoEnteredEditRef.current) return;
    const timer = window.setTimeout(() => {
      enterCoverEditMode();
      autoEnteredEditRef.current = true;
    }, 120);
    return () => window.clearTimeout(timer);
  }, [startInEditMode]);

  useEffect(() => {
    if (!editorMode) return;
    setIsUnlocked(true);
    setShowCustomizer(true);
  }, [editorMode]);

  // Hydrate editable text when story data arrives (prevents blank editor pages on async load).
  useEffect(() => {
    if (!Array.isArray(resolvedSegments) || resolvedSegments.length === 0) return;
    setEditableSegments(prev => {
      const prevHasText = prev.some(seg => typeof seg === 'string' && seg.trim().length > 0);
      return prevHasText ? prev : resolvedSegments;
    });
  }, [resolvedSegments]);

  useEffect(() => {
    if (!editorMode) return;
    const timer = window.setTimeout(() => {
      if (!bookRef.current) return;
      try {
        if ($(bookRef.current).data('turn') && currentPage <= 1) {
          ($(bookRef.current) as any).turn('page', 3);
          setIsBookOpen(true);
          setIsAtEnd(false);
        }
      } catch { }
    }, 260);
    return () => window.clearTimeout(timer);
  }, [editorMode, mountKey, currentPage]);

  // Before purchase default: original cover. Custom mode: clean cover + styled title overlay.
  const coverAssetIndex = useCustomCover ? 1 : 0;

  const gradientStyle = titleStyle.positionY < 40
    ? 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 40%, transparent 70%)'
    : titleStyle.positionY > 60
      ? 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 40%, transparent 70%)'
      : 'radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, transparent 70%)';

  const handleTitleDragStart = useCallback((clientY: number) => {
    if (!isMovingTitle) return;
    setIsDraggingTitle(true);
    const rect = coverRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.max(5, Math.min(90, ((clientY - rect.top) / rect.height) * 100));
    setTitleStyle(prev => ({ ...prev, positionY: Math.round(pct) }));
  }, [isMovingTitle]);

  const handleTitleDragMove = useCallback((clientY: number) => {
    if (!isDraggingTitle) return;
    const rect = coverRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.max(5, Math.min(90, ((clientY - rect.top) / rect.height) * 100));
    setTitleStyle(prev => ({ ...prev, positionY: Math.round(pct) }));
  }, [isDraggingTitle]);

  const handleTitleDragEnd = useCallback(() => {
    setIsDraggingTitle(false);
  }, []);

  useEffect(() => {
    if (!isEditingTitle) return;
    const el = titleInputRef.current;
    if (!el) return;
    if (el.textContent !== titleStyle.text) {
      el.textContent = titleStyle.text;
    }
  }, [isEditingTitle, titleStyle.text, titleStyle.fontId]);

  const fullscreenPageSize = Math.max(
    420,
    Math.min(
      560,
      Math.floor((viewportSize.width - 48) / 2),
      viewportSize.height - 120
    )
  );
  const PAGE_WIDTH = isFullScreen ? fullscreenPageSize : 450;
  const PAGE_HEIGHT = PAGE_WIDTH;
  const BOOK_WIDTH = PAGE_WIDTH * 2;
  const BOOK_HEIGHT = PAGE_HEIGHT;

  const storyboardLayout = useMemo(
    () => resolveStoryboardLayout(editableSegments.length || resolvedSegments.length),
    [editableSegments.length, resolvedSegments.length]
  );
  const backgroundSize = getStoryboardBackgroundSize(storyboardLayout);
  const textPageCount = Math.min((editableSegments.length || resolvedSegments.length), storyboardLayout.storyPanelCount);
  const totalPages = textPageCount * 2 + 2;

  useEffect(() => {
    // Reset page if out of bounds (defense against data updates)
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }

    setTotalPageCount(totalPages);
    const timer = setTimeout(() => {
      if (bookRef.current) {
        const $book = $(bookRef.current);
        const childrenCount = $book.children().length;

        if (childrenCount === 0) return;

        if (($.fn as any).turn) {
          try {
            ($(bookRef.current) as any).turn({
              width: BOOK_WIDTH,
              height: BOOK_HEIGHT,
              direction: 'rtl',
              autoCenter: false, // Manual centering logic
              display: 'double',
              duration: 800,
              acceleration: true,
              gradients: false,
              elevation: 0,
              cornerSize: 0,
              when: {
                start: (e: any, page: any, corner: any) => {
                  // Disable Top Corners
                  if (corner === 'tr' || corner === 'tl') {
                    e.preventDefault();
                  }
                },
                turned: (_: any, page: number) => {
                  setCurrentPage(page);
                  setIsBookOpen(page > 1);
                  setIsAtEnd(page >= totalPages - 1);
                }
              }
            });
          } catch (e: any) {
            console.warn('Turn.js init warning:', e);
            setError(e.message);
          }
        }

        const handleKeyDown = (e: any) => {
          if (e.keyCode === 37) ($(bookRef.current) as any).turn('next');
          if (e.keyCode === 39) ($(bookRef.current) as any).turn('previous');
        };
        $(window).on('keydown', handleKeyDown);
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      if (bookRef.current) {
        try {
          if ($(bookRef.current).data('turn')) {
            ($(bookRef.current) as any).turn('destroy');
          }
        } catch (e) { }
      }
      $(window).off('keydown');
    };
  }, [mountKey, story, totalPages, BOOK_WIDTH, BOOK_HEIGHT]);

  // Handlers for Nav Buttons
  const next = () => { if (bookRef.current) ($(bookRef.current) as any).turn('next'); }
  const prev = () => { if (bookRef.current) ($(bookRef.current) as any).turn('previous'); }

  const handleUnlock = () => setIsUnlocked(true);

  const handleResetVisuals = () => {
    setPageColor('#FFFFFF');
    setTextColor('#1F2937');
    setFontSize(24);
  };

  const handleResetCurrentPageText = () => {
    if (currentSegmentIndex >= 0 && currentSegmentIndex < resolvedSegments.length) {
      const newSegments = [...editableSegments];
      newSegments[currentSegmentIndex] = resolvedSegments[currentSegmentIndex];
      setEditableSegments(newSegments);
    }
  };

  const updateSegment = (index: number, newText: string) => {
    const newSegments = [...editableSegments];
    newSegments[index] = newText;
    setEditableSegments(newSegments);
  };

  const normalizeEditableText = (value: string) => value.replace(/\r/g, '');

  const getBackgroundPosition = (index: number) => {
    return getStoryboardBackgroundPosition(index, storyboardLayout);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-600 gap-4">
        <p>שגיאה בטעינת הספר</p>
        <button onClick={() => { setError(null); setMountKey(k => k + 1); }} className="px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition">נסה שוב</button>
      </div>
    );
  }

  // Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    switch (devPopup) {
      case 'flipbook-share-menu':
        setShareMenuOpen(true);
        break;
      case 'flipbook-fullscreen':
        setIsFullScreen(true);
        break;
      case 'flipbook-design-panel':
        setShowCustomizer(true);
        break;
      case 'flipbook-title-editor':
        setUseCustomCover(true);
        setIsEditingTitle(true);
        setCurrentPage(1);
        setIsBookOpen(false);
        setIsAtEnd(false);
        break;
      case 'flipbook-payment-modal':
        setShowPaymentModal(true);
        break;
      default:
        break;
    }
  }, [devPopup]);

  const handlePageClick = (e: React.MouseEvent, pageIndex: number) => {
    e.stopPropagation();
    if (editorMode && (e.target as HTMLElement).closest('[data-page-text-editor="true"]')) {
      return;
    }
    // Allow turning pages freely - Visuals will handle locking
    if (pageIndex % 2 === 0) prev(); else next();
  };

  // --- Centering Logic ---
  // Start: Shift Right (+225px). End: Shift Left (-225px).
  let translateX = '0px';
  if (!isBookOpen) {
    translateX = `${PAGE_WIDTH / 2}px`;
  } else if (isAtEnd) {
    translateX = `-${PAGE_WIDTH / 2}px`;
  }

  const currentSegmentIndex = Math.floor((currentPage - 2) / 2);
  const designPanelVisible = showCustomizer || editorMode;
  const isCoverPage = currentPage <= 1;
  const inlineEditMode = editorMode && !isFullScreen;

  useEffect(() => {
    if (!editorMode) return;
    if (currentPage > 1 && isEditingTitle) {
      setIsEditingTitle(false);
      setIsMovingTitle(false);
    }
  }, [editorMode, currentPage, isEditingTitle]);

  const focusSegmentInlineEditor = (segmentIndex: number) => {
    const selector = `[data-page-text-editor="true"][data-segment-index="${segmentIndex}"]`;
    const editorEl = document.querySelector(selector) as HTMLElement | null;
    if (!editorEl) return;
    editorEl.focus();
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(editorEl);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const handleResetSegmentText = (segmentIndex: number) => {
    if (segmentIndex < 0 || segmentIndex >= resolvedSegments.length) return;
    const newSegments = [...editableSegments];
    newSegments[segmentIndex] = resolvedSegments[segmentIndex];
    setEditableSegments(newSegments);
  };

  const pages = [];

  // Cover - using either panel 0 (with title) or panel 1 (clean fallback)
  pages.push(
    <div key="p1" className="hard front page-left"
      onClick={(e) => {
        if (isEditingTitle) {
          e.stopPropagation();
          return;
        }
        e.stopPropagation();
        next();
      }}
    >
      <div
        ref={coverRef}
        className="w-full h-full relative bg-cover bg-center border-l border-black/10 book-cover group select-none"
        style={{ backgroundImage: `url(${displayImageUrl})`, backgroundSize, backgroundPosition: getBackgroundPosition(coverAssetIndex) }}
        onMouseMove={(e) => handleTitleDragMove(e.clientY)}
        onMouseUp={handleTitleDragEnd}
        onMouseLeave={handleTitleDragEnd}
        onTouchMove={(e) => {
          e.preventDefault();
          handleTitleDragMove(e.touches[0].clientY);
        }}
        onTouchEnd={handleTitleDragEnd}
      >

        {useCustomCover && titleStyle.showGradient && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: gradientStyle }} />
        )}
        {(useCustomCover && (isEditingTitle || !!displayTitle)) && (
          <div
            className={`absolute left-0 right-0 flex items-center justify-center px-4 transition-all ${isDraggingTitle ? 'duration-0' : 'duration-300'}`}
            style={{ top: `${titleStyle.positionY}%`, transform: 'translateY(-50%)' }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
              e.stopPropagation();
              if (isMovingTitle) {
                e.preventDefault();
                handleTitleDragStart(e.clientY);
                return;
              }
              if (isEditingTitle) {
                titleInputRef.current?.focus();
                return;
              }
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              if (isMovingTitle) {
                handleTitleDragStart(e.touches[0].clientY);
                return;
              }
              if (isEditingTitle) {
                titleInputRef.current?.focus();
                return;
              }
            }}
          >
            {isEditingTitle ? (
              <div
                ref={titleInputRef}
                contentEditable={isEditingTitle}
                suppressContentEditableWarning
                onInput={(e) => {
                  const nextText = (e.currentTarget.innerText || '').replace(/\r/g, '');
                  setTitleStyle(prev => ({ ...prev, text: nextText }));
                }}
                onClick={(e) => e.stopPropagation()}
                className="cover-title-text leading-tight whitespace-pre-wrap cursor-text outline-none border-b border-white/80 px-2 text-right min-w-[120px]"
                dir="rtl"
                style={{
                  '--cover-title-font': activeTitleFont.family,
                  '--cover-title-weight': String(activeTitleFont.weight),
                  color: titleStyle.color,
                  fontSize: `${titleStyle.fontSize}px`,
                  textShadow: '2px 2px 6px rgba(0,0,0,0.5)',
                  transition: 'font-size 0.3s, color 0.3s',
                  direction: 'rtl',
                  textAlign: 'right',
                  unicodeBidi: 'embed',
                }}
              />
            ) : (
              <div
                className={`cover-title-text leading-tight whitespace-pre-wrap text-right min-w-[120px] ${isMovingTitle ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'} ${isDraggingTitle ? 'scale-105' : ''}`}
                dir="rtl"
                style={{
                  '--cover-title-font': activeTitleFont.family,
                  '--cover-title-weight': String(activeTitleFont.weight),
                  color: titleStyle.color,
                  fontSize: `${titleStyle.fontSize}px`,
                  textShadow: '2px 2px 6px rgba(0,0,0,0.5)',
                  transition: isDraggingTitle ? 'none' : 'font-size 0.3s, color 0.3s',
                  direction: 'rtl',
                  textAlign: 'right',
                  unicodeBidi: 'embed',
                }}
              >
                {displayTitle}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // Story Pages - capped to existing text segments and available panel capacity.
  for (let i = 0; i < textPageCount; i++) {
    const isLocked = !isUnlocked && i >= 1 && !isPreview; // Lock from page 3 onwards (i >= 1 means spread 2+)

    pages.push(
      // Image Page (Odd Index in Loop, but represents RIGHT page in RTL spread)
      <div key={`p${2 * i + 2}`} className="page page-right" onClick={(e) => handlePageClick(e, 2 * i + 2)}>
        <div
          className={`w-full h-full relative bg-gray-900 page-shadow-left ${isLocked ? '' : ''}`}
          style={{
            backgroundImage: `url(${displayImageUrl})`,
            backgroundSize,
            backgroundPosition: getBackgroundPosition(i + storyboardLayout.storyPanelOffset),
            filter: isLocked ? 'url(#pixelate-filter)' : 'none',
            transform: isLocked ? 'scale(1.05)' : 'none', // Prevent filter edges
          }}>
        </div>
        {/* Lock Overlay for Image Pages - Lock Icon Only */}
        {isLocked && (
          <div
            className="absolute inset-0 flex items-center justify-center z-10 cursor-pointer group"
            onClick={(e) => { e.stopPropagation(); onLockedPageClick?.(); }}
          >
            <div className="bg-white/90 rounded-2xl p-6 flex flex-col items-center justify-center shadow-xl group-hover:scale-105 transition-transform text-center gap-3 border-2 border-white/50 backdrop-blur-sm max-w-[80%]">
              <span className="text-5xl">🔒</span>
              <span className="text-black font-bold text-lg leading-tight">התמונה תוצג<br />לאחר הרכישה</span>
            </div>
          </div>
        )}
      </div>
    );
    pages.push(
      // Text Page (Even Index in Loop, but represents LEFT page in RTL spread)
      <div key={`p${2 * i + 3}`} className="page text-page page-left" style={{ backgroundColor: pageColor, color: textColor }} onClick={(e) => handlePageClick(e, 2 * i + 3)}>
        <div className={`w-full h-full ${inlineEditMode ? 'p-10 justify-start' : 'p-16 justify-center'} flex flex-col items-start text-right relative page-shadow-right ${inlineEditMode ? '' : 'pointer-events-none'}`}>
          {(() => {
            const segmentText = editableSegments[i] ?? resolvedSegments[i] ?? '';
            return (
              <>
                {inlineEditMode && (
                  <div className="w-full mb-3 flex items-center justify-between gap-2 rounded-xl border border-[#f6c85b]/50 bg-[#fffdf4] px-3 py-2">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-black">
                      <Edit2 size={12} />
                      עריכת טקסט
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => focusSegmentInlineEditor(i)}
                        onMouseDown={(event) => event.stopPropagation()}
                        className="h-7 px-2.5 rounded-full border border-gray-200 bg-white text-black text-[11px] font-bold inline-flex items-center gap-1 hover:border-[#f6c85b]"
                      >
                        <Edit2 size={11} />
                        עריכה
                      </button>
                      <button
                        onClick={() => handleResetSegmentText(i)}
                        onMouseDown={(event) => event.stopPropagation()}
                        className="h-7 px-2.5 rounded-full border border-gray-200 bg-white text-[#eea78f] text-[11px] font-bold inline-flex items-center gap-1 hover:text-[#d08a72] hover:border-[#f6c85b]"
                      >
                        <RotateCcw size={11} />
                        חזרה למקור
                      </button>
                    </div>
                  </div>
                )}
                <p
                  data-page-text-editor={inlineEditMode ? 'true' : undefined}
                  data-segment-index={i}
                  contentEditable={inlineEditMode}
                  tabIndex={inlineEditMode ? 0 : -1}
                  dir="rtl"
                  lang="he"
                  spellCheck={false}
                  suppressContentEditableWarning
                  className={`font-story-hebrew font-medium leading-relaxed whitespace-pre-wrap w-full ${inlineEditMode ? 'cursor-text rounded-xl px-3 py-2 border border-gray-300 bg-white/55 hover:border-[#f6c85b]/70 focus:border-[#f6c85b]/80 min-h-[220px]' : ''}`}
                  style={{ fontSize: `${fontSize}px`, direction: 'rtl', textAlign: 'right', unicodeBidi: 'isolate', color: textColor }}
                  onBlur={(e) => inlineEditMode && updateSegment(i, normalizeEditableText(e.currentTarget.innerText || ''))}
                  onClick={(e) => inlineEditMode && e.stopPropagation()}
                  onMouseDown={(e) => inlineEditMode && e.stopPropagation()}
                  onFocus={(e) => {
                    if (!inlineEditMode) return;
                    e.currentTarget.setAttribute('dir', 'rtl');
                    e.currentTarget.style.direction = 'rtl';
                    e.currentTarget.style.textAlign = 'right';
                  }}
                >
                  {segmentText}
                </p>
              </>
            );
          })()}
          {/* Page Number: Bottom Left - Spread Count */}
          <div className="absolute bottom-6 left-6 text-base font-black text-black">{i + 2}</div>
        </div>
      </div>
    );
  }

  // Back Cover
  pages.push(<div key="back" className="hard back page-right" onClick={(e) => { e.stopPropagation(); prev(); }}>
    <div className="w-full h-full bg-[#FFC72C] flex items-center justify-center text-white font-black text-2xl relative page-shadow-right">
      הסוף!
    </div></div>);

  return (
    <div className="w-full flex flex-col items-center gap-6 py-8 animate-in fade-in" key={mountKey}>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95">
          <div className="bg-white rounded-card border-4 border-[#f6c85b] p-8 md:p-10 max-w-[520px] w-full text-center relative">
            <button
              onClick={() => setShowPaymentModal(false)}
              className="absolute top-4 left-4 w-11 h-11 inline-flex items-center justify-center rounded-full border-2 border-gray-200 bg-white text-black hover:border-[#f6c85b] transition-colors"
              aria-label="סגירה"
            >
              <X size={22} />
            </button>

            <h3 className="text-2xl md:text-3xl font-heading font-black text-black mb-3" style={{ color: '#000000' }}>
              המשך לקרוא
            </h3>
            <p className="text-black text-base mb-8 leading-relaxed" style={{ color: '#000000' }}>
              כדי לראות את כל הסיפור הקסום ולקבל אפשרויות עריכה והורדה, יש לעבור לתשלום.
            </p>

            <button
              onClick={() => { onUnlock(); setShowPaymentModal(false); }}
              className="w-full py-4 rounded-full bg-[#f6c85b] hover:bg-[#e6b84b] text-black font-bold text-lg transition-all"
            >
              מעבר לתשלום
            </button>
          </div>
        </div>
      )}

      {/* Title - Hidden or Minimal */}
      <h2 className="sr-only">{displayTitle}</h2>



      {(isFullScreen && typeof document !== 'undefined') ? createPortal(
        <div className="fixed inset-0 z-[120] bg-[#161616] flex flex-col items-center justify-center p-2 overflow-hidden">
          {/* Mobile Landscape Optimization */}
          <div className="md:hidden landscape:block hidden absolute inset-0 pointer-events-none" />

          {/* PARENT TRANSFORM for Centering */}
          <div className="relative flex justify-center items-center transform-gpu preserve-3d"
            style={{
              height: `${BOOK_HEIGHT + 20}px`,
              width: '100%',
              transform: 'translateX(0px)',
              transition: 'transform 0.5s ease-in-out'
            }}>

            <div id="flipbook" ref={bookRef} className="flipbook z-10" style={{ width: `${BOOK_WIDTH}px`, height: `${BOOK_HEIGHT}px` }}>
              {pages}
            </div>
          </div>

          <button
            onClick={toggleFullScreen}
            className="absolute top-5 right-5 z-30 w-12 h-12 bg-white/95 border border-gray-200 rounded-full text-black flex items-center justify-center hover:border-[#f6c85b] transition-colors"
            title="יציאה ממסך מלא"
          >
            <X size={20} />
          </button>
        </div>,
        document.body
      ) : (
        <div className="relative w-full flex flex-col items-center justify-center perspective-1000 mt-4 landscape:mt-1 landscape:scale-[0.85] md:landscape:scale-100 md:mt-4">
          {/* Mobile Landscape Optimization */}
          <div className="md:hidden landscape:block hidden absolute inset-0 pointer-events-none" />

          {/* PARENT TRANSFORM for Centering */}
          <div className="relative flex justify-center items-center transform-gpu preserve-3d"
            style={{
              height: `${BOOK_HEIGHT + 20}px`,
              width: '100%',
              transform: `translateX(${translateX})`,
              transition: 'transform 0.5s ease-in-out'
            }}>

            <div id="flipbook" ref={bookRef} className="flipbook z-10" style={{ width: `${BOOK_WIDTH}px`, height: `${BOOK_HEIGHT}px` }}>
              {pages}
            </div>
          </div>

        </div>
      )}



      {/* Toolbar - Only if showToolbar is true */}
      {showToolbar && !isFullScreen && (
        <div className="w-full mt-6 relative z-20 flex flex-col items-center gap-3">
          <div className={`w-full max-w-[820px] rounded-full border border-gray-200 bg-white px-4 py-2 flex items-center shadow-sm ${editorMode ? 'justify-center relative' : 'justify-between'}`}>
            {!editorMode && (
              <div className="flex items-center gap-2">
                <div className="group relative" ref={shareMenuRef}>
                  <button
                    onClick={() => setShareMenuOpen(prev => !prev)}
                    className="w-11 h-11 bg-white border border-gray-200 rounded-full text-black flex items-center justify-center hover:border-[#f6c85b]"
                    aria-label="שתפו ספר"
                  >
                    <Share2 size={19} />
                  </button>
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition">
                    שתפו ספר
                  </span>

                  {shareMenuOpen && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[130] w-64 bg-white border-4 border-[#f6c85b] rounded-2xl p-2 space-y-1">
                      <button
                        onClick={handleShareMail}
                        className="w-full px-3 py-2 rounded-xl bg-[#fff4db] hover:bg-[#ffe9bc] text-sm font-bold text-black text-right"
                      >
                        מייל
                      </button>
                      <button
                        onClick={handleShareWhatsApp}
                        className="w-full px-3 py-2 rounded-xl bg-[#eafaf1] hover:bg-[#d7f4e5] text-sm font-bold text-black text-right"
                      >
                        WhatsApp
                      </button>
                      <button
                        onClick={handleShareFacebook}
                        className="w-full px-3 py-2 rounded-xl bg-[#eaf1ff] hover:bg-[#dbe7ff] text-sm font-bold text-black text-right"
                      >
                        Facebook
                      </button>
                      <button
                        onClick={handleShareInstagram}
                        className="w-full px-3 py-2 rounded-xl bg-[#fff0f6] hover:bg-[#ffe1ef] text-sm font-bold text-black text-right"
                      >
                        Instagram
                      </button>
                      <button
                        onClick={handleShareCopy}
                        className="w-full px-3 py-2 rounded-xl bg-[#f3f4f6] hover:bg-[#e5e7eb] text-sm font-bold text-black text-right"
                      >
                        {shareFeedback === 'copied' ? 'הקישור הועתק' : 'העתקת קישור'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 bg-[#f8f8f8] rounded-full border border-gray-200 px-3 py-1">
              <button
                onClick={() => !isEditingTitle && !isMovingTitle && bookRef.current && ($(bookRef.current) as any).turn('previous')}
                disabled={isEditingTitle || isMovingTitle}
                className={`w-9 h-9 flex items-center justify-center rounded-full transition ${(isEditingTitle || isMovingTitle) ? 'opacity-40 cursor-not-allowed text-black' : 'hover:bg-white text-black hover:text-[#F9C922]'}`}
              >
                <ArrowRight size={19} />
              </button>
              <span className="font-mono font-bold text-sm text-black min-w-[3.6rem] text-center">
                {Math.floor((currentPage) / 2) + 1} / {Math.ceil(totalPageCount / 2)}
              </span>
              <button
                onClick={() => !isEditingTitle && !isMovingTitle && bookRef.current && ($(bookRef.current) as any).turn('next')}
                disabled={isEditingTitle || isMovingTitle}
                className={`w-9 h-9 flex items-center justify-center rounded-full transition ${(isEditingTitle || isMovingTitle) ? 'opacity-40 cursor-not-allowed text-black' : 'hover:bg-white text-black hover:text-[#F9C922]'}`}
              >
                <ArrowLeft size={19} />
              </button>
            </div>

            {editorMode && (
              <div className="absolute left-3">
                <button
                  onClick={toggleFullScreen}
                  className="w-11 h-11 bg-white border border-gray-200 rounded-full text-black flex items-center justify-center hover:border-[#f6c85b]"
                  aria-label="מסך מלא"
                >
                  <Maximize size={19} />
                </button>
              </div>
            )}

            {!editorMode && (
              <div className="flex items-center gap-2">
                <div className="group relative">
                  <button
                    onClick={() => onSave?.()}
                    className="w-11 h-11 bg-white border border-gray-200 rounded-full text-black flex items-center justify-center hover:border-[#f6c85b]"
                    aria-label="שמירה לגלריה"
                  >
                    <Save size={19} />
                  </button>
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition">
                    שמירה לגלריה
                  </span>
                </div>
                <div className="group relative">
                  <button
                    onClick={toggleFullScreen}
                    className="w-11 h-11 bg-white border border-gray-200 rounded-full text-black flex items-center justify-center hover:border-[#f6c85b]"
                    aria-label="מסך מלא"
                  >
                    <Maximize size={19} />
                  </button>
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition">
                    מסך מלא
                  </span>
                </div>
              </div>
            )}
          </div>

          {isEditingTitle && (!editorMode || isCoverPage) && (
            <div className="w-full max-w-[760px] bg-white rounded-2xl p-4 border border-gray-200 space-y-3">
              {editorMode && (
                <div className="text-xs font-bold text-black/65 pb-1 border-b border-gray-100">עריכת כריכה בלבד</div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  onClick={() => setTitleStyle(prev => ({ ...prev, text: story.title }))}
                  className="px-3 py-2 bg-gray-100 text-black text-sm font-bold rounded-full border border-gray-200 hover:bg-gray-200"
                >
                  איפוס טקסט
                </button>
                <button
                  onClick={() => setIsMovingTitle(prev => !prev)}
                  className={`px-3 py-2 text-sm font-bold rounded-full border transition ${isMovingTitle ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-200 hover:bg-gray-50'}`}
                >
                  <span className="inline-flex items-center gap-1"><MoveVertical size={16} /> הזזת כותרת</span>
                </button>
                <button
                  onClick={() => {
                    setUseCustomCover(false);
                    setIsEditingTitle(false);
                    setIsMovingTitle(false);
                  }}
                  className="px-3 py-2 bg-white text-black text-sm font-bold rounded-full border border-gray-200 hover:bg-gray-50"
                >
                  חזרה למקורי
                </button>
                <button
                  onClick={exitCoverEditMode}
                  className="px-3 py-2 bg-[#f6c85b] text-black text-sm font-bold rounded-full hover:bg-[#e6b84b]"
                >
                  סיום עריכה
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <label className="flex items-center justify-between gap-2 border border-gray-200 rounded-xl px-2.5 py-2">
                  <span className="text-xs font-bold text-black">גודל</span>
                  <input
                    type="range"
                    min={12}
                    max={48}
                    step={1}
                    value={titleStyle.fontSize}
                    onChange={e => setTitleStyle(prev => ({ ...prev, fontSize: Number(e.target.value) }))}
                    className="cover-range-slider w-24 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 border border-gray-200 rounded-xl px-2.5 py-2">
                  <span className="text-xs font-bold text-black">צבע</span>
                  <input
                    type="color"
                    value={titleStyle.color}
                    onChange={e => setTitleStyle(prev => ({ ...prev, color: e.target.value }))}
                    className="w-7 h-7 rounded-full cursor-pointer border border-gray-200 p-0 overflow-hidden"
                  />
                </label>

                <button
                  onClick={() => setTitleStyle(prev => ({ ...prev, showGradient: !prev.showGradient }))}
                  className={`border rounded-xl px-2.5 py-2 text-xs font-bold transition ${titleStyle.showGradient ? 'bg-[#4b947d] text-white border-[#4b947d]' : 'bg-white text-black border-gray-200 hover:bg-gray-50'}`}
                >
                  צל רקע: {titleStyle.showGradient ? 'פעיל' : 'כבוי'}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {TITLE_FONTS.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setTitleStyle(prev => ({ ...prev, fontId: f.id }))}
                    className={`min-w-[108px] px-3 py-2 rounded-xl text-sm font-bold transition-all ${titleStyle.fontId === f.id ? 'bg-black text-white' : 'bg-white text-black border border-gray-200 hover:bg-gray-50'}`}
                    style={{ fontFamily: f.family, fontWeight: f.weight }}
                  >
                    <span className="block">{f.label}</span>
                    <span className="block text-xs opacity-75">אבגדה</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {designPanelVisible && (
        editorMode ? (
          isCoverPage ? (
            <div className="w-full max-w-[820px] bg-white rounded-2xl border border-gray-200 px-4 py-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-black">מצב כריכה</h3>
                  <p className="text-xs text-black/60 mt-1">כאן עורכים רק את הכריכה. לעמודים הפנימיים עברו לעמוד הבא.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={enterCoverEditMode}
                    className="h-10 px-4 rounded-full bg-[#f6c85b] hover:bg-[#e6b84b] text-black text-sm font-bold"
                  >
                    עריכת כריכה
                  </button>
                  <button
                    onClick={() => bookRef.current && ($(bookRef.current) as any).turn('next')}
                    className="h-10 px-4 rounded-full bg-white border border-gray-200 hover:border-[#f6c85b] text-black text-sm font-bold"
                  >
                    לעמודים הפנימיים
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-[820px] bg-white rounded-2xl border border-gray-200 px-4 py-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex items-center justify-between gap-2 border border-gray-200 rounded-xl px-3 py-2.5">
                  <span className="text-xs font-bold text-black">צבע דף</span>
                  <input type="color" value={pageColor} onChange={e => setPageColor(e.target.value)} className="w-8 h-8 rounded-full cursor-pointer border border-gray-200 p-0 overflow-hidden" />
                </label>
                <label className="flex items-center justify-between gap-2 border border-gray-200 rounded-xl px-3 py-2.5">
                  <span className="text-xs font-bold text-black">צבע טקסט</span>
                  <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} className="w-8 h-8 rounded-full cursor-pointer border border-gray-200 p-0 overflow-hidden" />
                </label>
                <label className="flex items-center justify-between gap-2 border border-gray-200 rounded-xl px-3 py-2.5">
                  <span className="text-xs font-bold text-black">גודל</span>
                  <input type="range" min="16" max="48" value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} className="w-full max-w-[120px] accent-[#F9C922]" />
                  <span className="text-xs font-bold text-black/60 w-8 text-left">{fontSize}</span>
                </label>
              </div>
            </div>
          )
        ) : (
          <div className={`w-full max-w-4xl p-6 ${designSystem.classes.card} animate-in slide-in-from-top-2 z-20`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="font-bold text-black">עיצוב ויזואלי</h3>
                  <button onClick={handleResetVisuals} className="text-xs text-red-500 hover:text-red-600 hover:underline flex items-center gap-1">
                    <RotateCcw size={12} />
                    איפוס עיצוב
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <label className="flex items-center justify-between">
                    <span className="text-sm font-medium text-black">צבע דף</span>
                    <input type="color" value={pageColor} onChange={e => setPageColor(e.target.value)} className="w-8 h-8 rounded-full cursor-pointer" />
                  </label>
                  <label className="flex items-center justify-between">
                    <span className="text-sm font-medium text-black">צבע טקסט</span>
                    <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} className="w-8 h-8 rounded-full cursor-pointer" />
                  </label>
                  <label className="flex items-center justify-between">
                    <span className="text-sm font-medium text-black">גודל גופן</span>
                    <input type="range" min="16" max="48" value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} className="w-32 accent-[#F9C922]" />
                  </label>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h3 className="font-bold text-black">עריכת טקסט (עמוד {currentSegmentIndex + 1})</h3>
                  <button onClick={handleResetCurrentPageText} className="text-xs text-red-500 hover:text-red-600 hover:underline flex items-center gap-1">
                    <RotateCcw size={12} />
                    איפוס עמוד
                  </button>
                </div>
                {currentSegmentIndex >= 0 && currentSegmentIndex < editableSegments.length ? (
                  <textarea
                    value={editableSegments[currentSegmentIndex]}
                    onChange={(e) => updateSegment(currentSegmentIndex, e.target.value)}
                    className={designSystem.classes.input}
                    style={{ height: '8rem', resize: 'none' }}
                    dir="rtl"
                  />
                ) : (
                  <p className="text-sm text-gray-400 italic text-center py-8">פתח את הספר כדי לערוך טקסט</p>
                )}
              </div>
            </div>
          </div>
        )
      )}

      <style>{`
          .flipbook { 
            transition: margin-left 0.5s ease-in-out;
          }
          /* HIDE ALL Turn.js built-in shadows - these were causing the rectangles */
          .flipbook > .shadow,
          .flipbook .shadow,
          .flipbook [class*="shadow"] > div:not(.page):not(.hard):not(.page-wrapper) { 
            display: none !important; 
            opacity: 0 !important;
          }
          /* Remove any box-shadow from page wrappers and covers */
          .flipbook .page-wrapper,
          .flipbook .hard,
          .flipbook .page {
            box-shadow: none !important;
          }
          .flipbook .page, .flipbook .hard { 
            background-color: white;
            overflow: hidden !important; 
          }
          /* Hard Cover Base Styles */
          .hard {
              position: relative;
              overflow: hidden;
          }
          /* Phase Rounds based on absolute page side */
          .page-right { border-radius: 0 20px 20px 0 !important; }
          .page-left { border-radius: 20px 0 0 20px !important; }

          /* --- FRONT COVER (Spine on RIGHT for RTL) --- */
          .hard.front {
              /* Shadow handled by .flipbook filter */
          }
          /* spine effect on RIGHT */
          .hard.front::before {
              content: none !important;
              position: absolute;
              right: 0 !important;
              left: auto !important;
              top: 0;
              bottom: 0;
              width: 30px;
              background: linear-gradient(to left, 
                rgba(0,0,0,0.4) 0%,      
                rgba(255,255,255,0.2) 20%, 
                rgba(0,0,0,0.15) 35%,      
                rgba(0,0,0,0.05) 60%,     
                transparent 100%) !important;
              z-index: 20;
              pointer-events: none;
              filter: blur(1px);
          }
          .hard.front::after {
              content: none !important;
              position: absolute;
              right: 18px !important;
              left: auto !important;
              top: 0;
              bottom: 0;
              width: 4px;
              background: linear-gradient(to right,
                rgba(0,0,0,0.2),
                rgba(255,255,255,0.1)
              ) !important;
              filter: blur(2px);
              z-index: 21;
              pointer-events: none;
          }

          /* --- BACK COVER (Spine on LEFT when flipped) --- */
          .hard.back {
              /* Shadow handled by .flipbook filter */
          }
          /* Back Spine Effect - LEFT side */
          .hard.back::before {
              content: none !important;
              position: absolute;
              left: 0 !important;
              right: auto !important;
              top: 0;
              bottom: 0;
              width: 30px;
              background: linear-gradient(to right, 
                rgba(0,0,0,0.4) 0%,      
                rgba(255,255,255,0.2) 20%, 
                rgba(0,0,0,0.15) 35%,      
                rgba(0,0,0,0.05) 60%,     
                transparent 100%) !important;
              z-index: 20;
              pointer-events: none;
              filter: blur(1px);
          }
          .hard.back::after {
              content: none !important;
              position: absolute;
              left: 18px !important;
              right: auto !important;
              top: 0;
              bottom: 0;
              width: 4px;
              background: linear-gradient(to left,
                rgba(0,0,0,0.2),
                rgba(255,255,255,0.1)
              ) !important;
              filter: blur(2px);
              z-index: 21;
              pointer-events: none;
          }

          /* Realistic Drop Shadow */
          .book-cover {
              /* Shadow is handled by the parent .hard / .page elements */
          }
          /* Softer Float Animation */
          @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
          }
          .animate-float { animation: float 3s ease-in-out infinite; }

          /* Remove rollover shading on pages */
          .page-shadow-left,
          .page-shadow-right {
            box-shadow: none !important;
          }
          .page-shadow-left::before,
          .page-shadow-right::before,
          .page-shadow-left::after,
          .page-shadow-right::after {
            box-shadow: none !important;
            background: transparent !important;
            filter: none !important;
          }
          
          .cover-title-text {
            font-family: var(--cover-title-font) !important;
            font-weight: var(--cover-title-weight) !important;
          }
          .cover-range-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 9999px;
            background: #ffffff;
            border: 1px solid #d1d5db;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
          }
          .cover-range-slider::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 9999px;
            background: #ffffff;
            border: 1px solid #d1d5db;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
          }
          .cover-range-slider::-moz-range-track {
            height: 8px;
            border-radius: 9999px;
            background: #e5e7eb;
          }

          *:focus { outline: none; }
          .flipbook-viewport .container { width: 100% !important; height: 100% !important; }
       `}</style>

      {/* SVG Filters Definition */}
      <svg width="0" height="0" className="absolute pointer-events-none">
        <defs>
          <filter id="pixelate-filter">
            {/* Grayscale */}
            <feColorMatrix type="saturate" values="0" in="SourceGraphic" result="gray" />
            {/* Dilate creates a blocky/pixelated look naturally by expanding pixels */}
            <feMorphology operator="dilate" radius="8" in="gray" result="dilated" />
            <feGaussianBlur stdDeviation="2" in="dilated" result="softened" />
            <feMerge>
              <feMergeNode in="softened" />
            </feMerge>
          </filter>
        </defs>
      </svg>
    </div>
  );
};

export default FlipbookView;
