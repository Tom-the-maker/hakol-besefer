import React, { useState, useRef, useEffect } from 'react';
import { Story } from '../types';
import { RotateCw, ChevronRight, ChevronLeft, BookOpen, Download, Palette, Image as ImageIcon, X, RotateCcw, Edit2, Share2, Save, Maximize, MoveVertical } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { designSystem } from '../lib/designSystem';
import { trackEvent } from '../lib/analytics';
import {
    getStoryboardBackgroundPosition,
    getStoryboardBackgroundSize,
    resolveStoryboardLayout
} from '../lib/storyboardLayout';

interface MobileBookViewProps {
    story: Story;
    onUnlock: () => void;
    onRequestFlipbook: () => void; // Trigger full screen rotate prompt
    onSave?: () => void;
    heroName?: string;
    cleanMode?: boolean; // New prop to hide extraneous UI
    editorMode?: boolean;
    isPreviewMode?: boolean;
    hideSecondaryControls?: boolean;
    devPopup?: string | null;
}

const TITLE_FONTS = [
    { id: 'heebo', label: 'Heebo', family: "'Heebo', sans-serif", weight: 700 },
    { id: 'assistant', label: 'Assistant', family: "'Assistant', sans-serif", weight: 700 },
    { id: 'rubik', label: 'Rubik', family: "'Rubik', sans-serif", weight: 700 },
    { id: 'frank', label: 'Frank Ruhl', family: "'Frank Ruhl Libre', serif", weight: 700 },
];

const MobileBookView: React.FC<MobileBookViewProps> = ({ story, onUnlock, onRequestFlipbook, onSave, heroName = "הילד/ה", cleanMode = false, editorMode = false, isPreviewMode = false, hideSecondaryControls = false, devPopup }) => {
    const displayImageUrl = story.display_image_url || story.composite_image_url;
    // Current page index. 0 = Cover, 1...N = Story Pages, N+1 = End
    const [currentIndex, setCurrentIndex] = useState(0);
    const [editableSegments, setEditableSegments] = useState<string[]>(story.segments || []);
    const storyboardLayout = resolveStoryboardLayout(editableSegments.length || story.segments?.length || 0);
    const visibleStoryPages = Math.min(editableSegments.length, storyboardLayout.storyPanelCount);
    const totalPages = visibleStoryPages + 2; // Cover + Segments (capped) + End

    // Refs for download
    const bookRef = useRef<HTMLDivElement>(null);
    const mobileStoryViewportRef = useRef<HTMLDivElement>(null);
    const prevIndexRef = useRef(0);
    const currentPageTextRef = useRef<HTMLParagraphElement>(null);

    // States
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [showCustomizer, setShowCustomizer] = useState(false);
    const [shareMenuOpen, setShareMenuOpen] = useState(false);
    const [shareFeedback, setShareFeedback] = useState<'idle' | 'copied'>('idle');
    const shareMenuRef = useRef<HTMLDivElement>(null);

    // Title Editing State
    const [customTitle, setCustomTitle] = useState<string | null>(null);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState('');
    const [isWebStyleEditing, setIsWebStyleEditing] = useState(false);
    const [mobileTitleStyle, setMobileTitleStyle] = useState({
        text: story.title,
        fontId: TITLE_FONTS[0].id,
        positionY: 15,
        fontSize: 22,
        color: '#FFFFFF',
        showGradient: false,
    });
    const [isMovingTitle, setIsMovingTitle] = useState(false);

    // Customization State
    const [pageColor, setPageColor] = useState('#FFFFFF');
    const [textColor, setTextColor] = useState('#1F2937');
    const [fontSize, setFontSize] = useState(16); // Smaller default for mobile

    useEffect(() => {
        if (!Array.isArray(story.segments) || story.segments.length === 0) return;
        setEditableSegments(prev => {
            const hasText = prev.some(seg => typeof seg === 'string' && seg.trim().length > 0);
            return hasText ? prev : story.segments;
        });
    }, [story.segments]);

    const updateSegment = (index: number, text: string) => {
        setEditableSegments(prev => {
            const nextSegments = [...prev];
            nextSegments[index] = text;
            return nextSegments;
        });
    };

    const normalizeEditableText = (value: string) => value.replace(/\r/g, '');

    const handleResetCurrentPageText = () => {
        const segIndex = currentIndex - 1;
        if (segIndex < 0 || segIndex >= story.segments.length) return;
        setEditableSegments(prev => {
            const nextSegments = [...prev];
            nextSegments[segIndex] = story.segments[segIndex];
            return nextSegments;
        });
    };

    const focusCurrentPageInlineEditor = () => {
        const segIndex = currentIndex - 1;
        if (segIndex < 0 || segIndex >= editableSegments.length) return;
        const editorEl = currentPageTextRef.current;
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

    // Get the display title (custom or original)
    const displayTitle = customTitle || story.title;

    useEffect(() => {
        switch (devPopup) {
            case 'mobile-share-menu':
                setShareMenuOpen(true);
                break;
            case 'mobile-customizer':
                setShowCustomizer(true);
                break;
            case 'mobile-title-modal':
                if (!cleanMode) {
                    setTitleDraft(displayTitle);
                    setIsEditingTitle(true);
                } else {
                    setCurrentIndex(0);
                    setUseCleanCover(true);
                    setIsWebStyleEditing(true);
                }
                break;
            case 'mobile-cover-editor':
                setCurrentIndex(0);
                setUseCleanCover(true);
                setIsWebStyleEditing(true);
                break;
            default:
                break;
        }
    }, [devPopup, cleanMode, displayTitle]);

    // Handle opening title editor
    const openTitleEditor = () => {
        if (cleanMode) {
            setCurrentIndex(0);
            setShareMenuOpen(false);
            setIsWebStyleEditing(true);
            setUseCleanCover(true);
            return;
        }
        setTitleDraft(displayTitle);
        setIsEditingTitle(true);
    };

    // Handle saving custom title
    const saveTitleEdit = () => {
        if (titleDraft.trim()) {
            setCustomTitle(titleDraft.trim());
        }
        setIsEditingTitle(false);
    };

    // Handle canceling title edit
    const cancelTitleEdit = () => {
        setIsEditingTitle(false);
        setTitleDraft('');
    };

    // Dual cover system: index 0 = cover with title, index 1 = clean cover
    const [useCleanCover, setUseCleanCover] = useState(false);
    const coverAssetIndex = useCleanCover ? 1 : 0;
    const activeTitleFont = TITLE_FONTS.find(f => f.id === mobileTitleStyle.fontId) || TITLE_FONTS[0];
    const gradientStyle = mobileTitleStyle.positionY < 40
        ? 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 40%, transparent 70%)'
        : mobileTitleStyle.positionY > 60
            ? 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 40%, transparent 70%)'
            : 'radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, transparent 70%)';

    // Helper to slice texture from the source illustration
    const getBackgroundPosition = (index: number) => {
        return getStoryboardBackgroundPosition(index, storyboardLayout);
    };
    const backgroundSize = getStoryboardBackgroundSize(storyboardLayout);

    const next = () => {
        if (currentIndex < totalPages - 1) setCurrentIndex(c => c + 1);
    };

    const prev = () => {
        if (currentIndex > 0) setCurrentIndex(c => c - 1);
    };

    // Download Handlers (ported from FlipbookView)
    const handleDownloadImage = async () => {
        try {
            if (!bookRef.current) {
                throw new Error('book view not mounted');
            }

            const canvas = await html2canvas(bookRef.current, { scale: 2, useCORS: true });
            const url = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = url;
            link.download = `hakol-besefer-page-${currentIndex + 1}-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            trackEvent('book_shared', { channel: 'image_download_mobile' });
        } catch (err) {
            console.error("Image download failed", err);
            alert("שגיאה ביצירת תמונה");
        }
    };

    const handleDownloadPDF = async () => {
        setIsGeneratingPDF(true);
        if (!bookRef.current) return;
        try {
            // Capture the current view
            const canvas = await html2canvas(bookRef.current, { scale: 2, useCORS: true });
            const imgData = canvas.toDataURL('image/png');
            // Create PDF based on capture dimensions
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
            const fileName = `hakol-besefer-page-${currentIndex}-${Date.now()}.pdf`;

            pdf.save(fileName);
            trackEvent('pdf_downloaded', { source: 'mobile' });
        } catch (err) {
            console.error("PDF download failed", err);
            alert("שגיאה ביצירת PDF");
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    const handleResetVisuals = () => {
        setPageColor('#FFFFFF');
        setTextColor('#1F2937');
        setFontSize(18);
    };

    const handleShareCopy = async () => {
        const shareUrl = window.location.href;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setShareFeedback('copied');
            setShareMenuOpen(false);
            trackEvent('book_shared', { channel: 'copy_link_mobile' });
            window.setTimeout(() => setShareFeedback('idle'), 1800);
        } catch { }
    };

    const handleShareMail = () => {
        const shareUrl = window.location.href;
        const subject = encodeURIComponent(`הספר שלי: ${story.title || 'הספר שלי'}`);
        const body = encodeURIComponent(`היי,\n\nתראו את הספר שלי:\n${shareUrl}`);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
        setShareMenuOpen(false);
        trackEvent('book_shared', { channel: 'email_mobile' });
    };

    const handleShareWhatsApp = () => {
        const shareUrl = window.location.href;
        const shareText = encodeURIComponent(`תראו את הספר שלי: ${story.title || 'הספר שלי'}\n${shareUrl}`);
        window.open(`https://wa.me/?text=${shareText}`, '_blank', 'noopener,noreferrer');
        setShareMenuOpen(false);
        trackEvent('book_shared', { channel: 'whatsapp_mobile' });
    };

    const handleShareFacebook = () => {
        const shareUrl = encodeURIComponent(window.location.href);
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`, '_blank', 'noopener,noreferrer');
        setShareMenuOpen(false);
        trackEvent('book_shared', { channel: 'facebook_mobile' });
    };

    const handleShareInstagram = () => {
        const shareUrl = window.location.href;
        window.open(`https://www.instagram.com/?url=${encodeURIComponent(shareUrl)}`, '_blank', 'noopener,noreferrer');
        setShareMenuOpen(false);
        trackEvent('book_shared', { channel: 'instagram_mobile' });
    };

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
        if (!cleanMode) return;
        if (currentIndex !== 0 && isWebStyleEditing) {
            setIsWebStyleEditing(false);
            setIsMovingTitle(false);
        }
    }, [cleanMode, currentIndex, isWebStyleEditing]);

    useEffect(() => {
        if (!cleanMode) {
            prevIndexRef.current = currentIndex;
            return;
        }
        const prevIndex = prevIndexRef.current;
        const openedFromCover = prevIndex === 0 && currentIndex > 0 && currentIndex <= visibleStoryPages;
        prevIndexRef.current = currentIndex;
        if (!openedFromCover) return;

        const timer = window.setTimeout(() => {
            const target = mobileStoryViewportRef.current;
            if (!target) return;
            const rect = target.getBoundingClientRect();
            const top = Math.max(0, window.scrollY + rect.top - 86);
            window.scrollTo({ top, behavior: 'smooth' });
        }, 80);

        return () => window.clearTimeout(timer);
    }, [cleanMode, currentIndex, visibleStoryPages]);

    return (
        <div ref={bookRef} className={`w-full flex flex-col items-center ${cleanMode ? 'px-0 bg-transparent pb-0 pt-0' : 'px-4 bg-[#FFC72C] pb-8 pt-20 min-h-screen'} font-Fredoka`} dir="rtl">

            {/* Top Context Header - Hidden in cleanMode */}
            {!cleanMode && (
                <div className="text-center mb-4 animate-fade-in-up">
                    <h2 className="text-xl font-bold text-[#1A1A1A] flex items-center justify-center gap-2">
                        <span className="text-2xl">🌟</span>
                        הספר שלך מוכן!
                    </h2>
                </div>
            )}

            {/* Action Buttons Row - Hidden in cleanMode */}
            {!cleanMode && (
                <div className="flex flax-wrap justify-center gap-3 mb-6 animate-fade-in">
                    <button onClick={() => setShowCustomizer(!showCustomizer)} className={`${designSystem.classes.btnPink} h-9 px-4 text-xs shadow-sm whitespace-nowrap`}>
                        <Palette size={14} />
                        <span>עיצוב</span>
                    </button>
                    <button onClick={handleDownloadPDF} disabled={isGeneratingPDF} className={`${designSystem.classes.btnBlue} disabled:opacity-50 h-9 px-4 text-xs shadow-sm whitespace-nowrap`}>
                        {isGeneratingPDF ? <span className="animate-spin">⏳</span> : <Download size={14} />}
                        <span>PDF</span>
                    </button>
                    <button onClick={handleDownloadImage} className={`${designSystem.classes.btnGreen} h-9 px-4 text-xs shadow-sm whitespace-nowrap`}>
                        <ImageIcon size={14} />
                        <span>תמונה</span>
                    </button>
                </div>
            )}



            {/* Customizer Overlay */}
            {showCustomizer && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={() => setShowCustomizer(false)}>
                    <div className="bg-white w-full max-w-md p-6 rounded-t-3xl border-4 border-[#f6c85b] border-b-0 space-y-6" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center border-b pb-3">
                            <h3 className="font-bold text-black text-lg">עיצוב הספר</h3>
                            <button onClick={handleResetVisuals} className="text-xs text-black font-bold underline-offset-2 hover:underline">
                                איפוס
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-gray-600">צבע דף</span>
                                <div className="flex gap-2">
                                    {['#FFFFFF', '#FFFBF0', '#F0F9FF', '#F0FFF4'].map(c => (
                                        <button
                                            key={c}
                                            className={`w-8 h-8 rounded-full border shadow-sm ${pageColor === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                                            style={{ backgroundColor: c }}
                                            onClick={() => setPageColor(c)}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-gray-600">צבע טקסט</span>
                                <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} className="w-8 h-8 rounded-full cursor-pointer border-none p-0" />
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-sm font-bold text-gray-600">גודל גופן</span>
                                    <span className="text-xs font-mono bg-gray-100 px-2 rounded">{fontSize}px</span>
                                </div>
                                <input type="range" min="14" max="28" step="1" value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#F9C922]" />
                            </div>
                        </div>

                        <button onClick={() => setShowCustomizer(false)} className="w-full py-3 bg-[#f6c85b] text-black font-bold rounded-full mt-2">
                            סגור
                        </button>
                    </div>
                </div>
            )}

            {/* Main Content Area - Maximized Width */}
            <div ref={mobileStoryViewportRef} className="w-full flex flex-col items-center justify-center">

                {/* --- Content: Cover (Index 0) --- */}
                {currentIndex === 0 && (
                    <div className="w-full animate-fade-in flex flex-col gap-0 items-center">
                        {/* Cover Card */}
                        <div className="w-full aspect-square rounded-2xl border border-gray-200 overflow-hidden bg-white relative group">
                            <div
                                className="w-full h-full bg-cover bg-center"
                                style={{
                                    backgroundImage: `url(${displayImageUrl})`,
                                    backgroundSize,
                                    backgroundPosition: getBackgroundPosition(coverAssetIndex)
                                }}
                            />
                            {/* Custom Title Overlay - Only shown when using clean cover AND user has set custom title */}
                            {(cleanMode ? (useCleanCover && (!!mobileTitleStyle.text || isWebStyleEditing)) : (useCleanCover && customTitle)) && (
                                <div className="absolute inset-0 pointer-events-none">
                                    {cleanMode && mobileTitleStyle.showGradient && (
                                        <div className="absolute inset-0" style={{ background: gradientStyle }} />
                                    )}
                                </div>
                            )}
                            {(cleanMode ? (useCleanCover && (!!mobileTitleStyle.text || isWebStyleEditing)) : (useCleanCover && customTitle)) && (
                                <div
                                    className={`absolute left-0 right-0 flex items-center justify-center px-4 transition-all ${isMovingTitle ? 'duration-150' : 'duration-300'}`}
                                    style={{ top: `${mobileTitleStyle.positionY}%`, transform: 'translateY(-50%)' }}
                                >
                                    {cleanMode && isWebStyleEditing ? (
                                        <div
                                            contentEditable
                                            suppressContentEditableWarning
                                            onInput={(e) => setMobileTitleStyle(prev => ({ ...prev, text: (e.currentTarget.innerText || '').replace(/\r/g, '') }))}
                                            className="cover-title-text leading-tight whitespace-pre-wrap cursor-text outline-none border-b border-white/80 px-2 text-right min-w-[120px]"
                                            dir="rtl"
                                            style={{
                                                '--cover-title-font': activeTitleFont.family,
                                                '--cover-title-weight': String(activeTitleFont.weight),
                                                color: mobileTitleStyle.color || '#FFFFFF',
                                                fontSize: `${mobileTitleStyle.fontSize}px`,
                                                direction: 'rtl',
                                                textAlign: 'right',
                                                unicodeBidi: 'embed',
                                                textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                                                minWidth: '120px'
                                            }}
                                        >
                                            {mobileTitleStyle.text}
                                        </div>
                                    ) : (
                                        <h2 className="cover-title-text leading-tight whitespace-pre-wrap text-right min-w-[120px] px-2"
                                            dir="rtl"
                                            style={{
                                                '--cover-title-font': activeTitleFont.family,
                                                '--cover-title-weight': String(activeTitleFont.weight),
                                                color: cleanMode ? (mobileTitleStyle.color || '#FFFFFF') : '#FFFFFF',
                                                fontSize: cleanMode ? `${mobileTitleStyle.fontSize}px` : '20px',
                                                direction: 'rtl',
                                                textAlign: 'right',
                                                unicodeBidi: 'embed',
                                                textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
                                            }}>
                                            {cleanMode ? mobileTitleStyle.text : customTitle}
                                        </h2>
                                    )}
                                </div>
                            )}

                            {/* Edit Title Button - Shows on hover/tap */}
                            {!cleanMode && (
                                <button
                                    onClick={openTitleEditor}
                                    className="absolute top-3 left-3 bg-white/90 hover:bg-white p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                                    title="ערוך כותרת"
                                >
                                    <Edit2 size={16} className="text-gray-700" />
                                </button>
                            )}
                        </div>

                        {/* Title & Author - Hidden in cleanMode */}
                        {!cleanMode && (
                            <div className="text-center mt-6 space-y-2">
                                <div className="flex items-center justify-center gap-2">
                                    <h1 className="text-2xl font-black text-[#1A1A1A] leading-tight px-2">{displayTitle}</h1>
                                    <button onClick={openTitleEditor} className="text-gray-400 hover:text-gray-600 transition-colors">
                                        <Edit2 size={16} />
                                    </button>
                                </div>
                                <div className="text-sm font-bold text-gray-500 bg-white/60 px-4 py-1.5 rounded-full inline-block backdrop-blur-sm">
                                    מאת: ההורים של {heroName}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Title Edit Modal */}
                {isEditingTitle && !cleanMode && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={cancelTitleEdit}>
                        <div className="bg-white w-[90%] max-w-[520px] p-8 rounded-card border-4 border-[#f6c85b] space-y-4 relative" onClick={e => e.stopPropagation()}>
                            <button
                                onClick={cancelTitleEdit}
                                className="absolute top-4 left-4 w-11 h-11 inline-flex items-center justify-center rounded-full border-2 border-gray-200 bg-white text-black hover:border-[#f6c85b] transition-colors"
                                aria-label="סגירה"
                            >
                                <X size={22} />
                            </button>
                            <h3 className="font-heading font-black text-black text-2xl md:text-3xl text-center">עריכת כותרת</h3>

                            <input
                                type="text"
                                value={titleDraft}
                                onChange={(e) => setTitleDraft(e.target.value)}
                                className="w-full px-4 py-3 border-2 border-[#f6c85b] rounded-xl text-center text-lg font-bold focus:border-[#f6c85b] focus:outline-none transition-colors"
                                dir="rtl"
                                placeholder="הכנס כותרת חדשה..."
                                autoFocus
                            />

                            <p className="text-sm text-black text-center font-normal">
                                {useCleanCover ? 'הכותרת תופיע על גבי העטיפה' : 'הכותרת תוחלף על גבי העטיפה הנקייה'}
                            </p>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => {
                                        if (titleDraft.trim()) {
                                            setCustomTitle(titleDraft.trim());
                                            setUseCleanCover(true); // Switch to clean cover when saving custom title
                                        }
                                        setIsEditingTitle(false);
                                    }}
                                    className="w-full py-4 bg-[#f6c85b] text-black font-bold rounded-full hover:bg-[#e6b84b] transition-colors text-lg"
                                >
                                    שמור שינויים
                                </button>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => {
                                            setCustomTitle(null);
                                            setUseCleanCover(false);
                                            setIsEditingTitle(false);
                                        }}
                                        className="flex-1 py-3 bg-white border border-gray-200 text-black font-bold rounded-full hover:border-[#f6c85b] transition-colors text-sm"
                                    >
                                        חזור למקור
                                    </button>
                                    <button
                                        onClick={cancelTitleEdit}
                                        className="flex-1 py-3 bg-white border border-gray-200 text-black font-bold rounded-full hover:border-[#f6c85b] transition-colors text-sm"
                                    >
                                        ביטול
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- Content: Story Pages (Index 1..N) --- */}
                {currentIndex > 0 && currentIndex <= visibleStoryPages && (
                    <div className="w-full animate-fade-in flex flex-col rounded-2xl overflow-hidden bg-white border border-gray-200">
                        {/* Image - Top Half */}
                        <div className="w-full aspect-square relative bg-white border-b border-gray-200 overflow-hidden">
                            <div
                                className="w-full h-full bg-cover bg-center"
                                style={{
                                    backgroundImage: `url(${displayImageUrl})`,
                                    backgroundSize,
                                    backgroundPosition: getBackgroundPosition(currentIndex + (storyboardLayout.storyPanelOffset - 1)),
                                    filter: cleanMode && !isPreviewMode && currentIndex > 2 ? 'blur(8px) grayscale(100%)' : 'none', // Lock effect starts from page 3
                                    transform: cleanMode && !isPreviewMode && currentIndex > 2 ? 'scale(1.1)' : 'none'
                                }}
                            />

                            {/* Lock Overlay */}
                            {cleanMode && !isPreviewMode && currentIndex > 2 && (
                                <div
                                    className="absolute inset-0 flex items-center justify-center z-10 cursor-pointer"
                                    onClick={onUnlock}
                                >
                                    <div className="bg-white/90 rounded-2xl p-4 flex flex-col items-center justify-center shadow-xl text-center gap-2 border-2 border-white/50 backdrop-blur-sm max-w-[80%]">
                                        <span className="text-4xl">🔒</span>
                                        <span className="text-black font-bold text-sm leading-tight">התמונה תוצג<br />לאחר הרכישה</span>
                                    </div>
                                </div>
                            )}

                        </div>

                        {/* Text - Bottom Half */}
                        <div
                            className={`w-full flex flex-col items-start justify-start relative transition-colors duration-300 ${cleanMode ? 'p-4 min-h-[120px]' : 'p-12 md:p-16 min-h-[220px]'}`}
                            style={{ backgroundColor: cleanMode ? '#fffdf2' : pageColor }}
                        >
                            {editorMode && (
                                <div className="w-full mb-3 flex items-center justify-between gap-2 rounded-xl border border-[#f6c85b]/50 bg-white/95 px-2.5 py-2">
                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-black">
                                        <Edit2 size={12} />
                                        עריכת טקסט
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={focusCurrentPageInlineEditor}
                                            onMouseDown={(event) => event.stopPropagation()}
                                            className="h-7 px-2.5 rounded-full border border-gray-200 bg-white text-black text-[11px] font-bold inline-flex items-center gap-1 hover:border-[#f6c85b]"
                                        >
                                            <Edit2 size={11} />
                                            עריכה
                                        </button>
                                        <button
                                            onClick={handleResetCurrentPageText}
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
                                ref={currentPageTextRef}
                                contentEditable={editorMode}
                                tabIndex={editorMode ? 0 : -1}
                                dir="rtl"
                                lang="he"
                                spellCheck={false}
                                suppressContentEditableWarning
                                onBlur={(e) => editorMode && updateSegment(currentIndex - 1, normalizeEditableText(e.currentTarget.innerText || ''))}
                                className={`font-story-hebrew font-medium text-right w-full transition-all duration-300 whitespace-pre-wrap ${cleanMode ? 'leading-[1.5]' : 'leading-relaxed'} ${editorMode ? 'cursor-text rounded-xl px-3 py-2 border border-gray-300 bg-white/55 hover:border-[#f6c85b]/70 focus:border-[#f6c85b]/80 min-h-[96px]' : ''}`}
                                style={{ color: textColor, fontSize: `${fontSize}px`, direction: 'rtl', textAlign: 'right', unicodeBidi: 'isolate' }}
                                onFocus={(e) => {
                                    if (!editorMode) return;
                                    e.currentTarget.setAttribute('dir', 'rtl');
                                    e.currentTarget.style.direction = 'rtl';
                                    e.currentTarget.style.textAlign = 'right';
                                }}
                            >
                                {editableSegments[currentIndex - 1]}
                            </p>
                        </div>
                    </div>
                )}

                {/* --- Content: End Page (Index Last) --- */}
                {currentIndex === totalPages - 1 && (
                    <div className="w-full flex flex-col items-center justify-center animate-fade-in text-center p-8 bg-white rounded-3xl border border-gray-200">
                        <div className="w-24 h-24 bg-[#f6c85b]/20 rounded-full flex items-center justify-center mb-6 text-5xl">
                            🥰
                        </div>

                        <h3 className="text-3xl font-black text-black mb-3">הסוף!</h3>
                        <p className="text-black mb-8 leading-relaxed text-base font-normal">
                            מקווים שנהניתם לקרוא יחד.<br />
                            הסיפור הקסום של {heroName}.
                        </p>

                        <div className="flex flex-col gap-3 w-full">
                            <button onClick={() => setCurrentIndex(0)} className="w-full py-4 bg-white border border-gray-200 font-bold rounded-xl text-black hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center gap-2">
                                <RotateCw size={18} />
                                לקרוא מהתחלה
                            </button>
                            <button onClick={onRequestFlipbook} className="w-full py-4 bg-[#1A1A1A] text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all">
                                <BookOpen size={20} />
                                מצב ספר מלא
                            </button>
                        </div>
                    </div>
                )}

            </div>

            {cleanMode ? (
                <div className="w-full mt-6 relative z-20 flex flex-col items-center gap-3">
                    <div className="w-full flex items-center justify-center gap-2">
                        {editorMode && (
                            <button
                                onClick={onRequestFlipbook}
                                className="w-11 h-11 rounded-full border border-gray-300 bg-white text-black inline-flex items-center justify-center hover:border-[#f6c85b]"
                                aria-label="מסך מלא"
                            >
                                <Maximize size={18} />
                            </button>
                        )}
                        <div className="flex items-center justify-center gap-3 bg-[#f3f4f6] rounded-full border border-gray-300 px-3 py-2">
                            <button onClick={prev} disabled={currentIndex === 0} className={`w-11 h-11 flex items-center justify-center rounded-full transition ${currentIndex === 0 ? 'opacity-40 cursor-not-allowed text-black' : 'bg-white text-black hover:text-[#F9C922] border border-gray-300'}`}>
                                <ChevronRight size={22} />
                            </button>
                            <span className="font-mono font-bold text-sm text-black min-w-[4.4rem] text-center">
                                {currentIndex + 1} / {totalPages}
                            </span>
                            <button onClick={next} disabled={currentIndex === totalPages - 1} className={`w-11 h-11 flex items-center justify-center rounded-full transition ${currentIndex === totalPages - 1 ? 'opacity-40 cursor-not-allowed text-black' : 'bg-white text-black hover:text-[#F9C922] border border-gray-300'}`}>
                                <ChevronLeft size={22} />
                            </button>
                        </div>
                    </div>

                    {!isWebStyleEditing && !hideSecondaryControls && (
                        <div className="w-full bg-white rounded-2xl border border-gray-200 px-3 py-3">
                            <div className={`${editorMode ? 'flex items-center justify-center gap-2' : 'grid grid-cols-4 gap-2'}`}>
                                {!editorMode && (
                                    <button
                                        onClick={onRequestFlipbook}
                                        className="flex flex-col items-center gap-1.5 text-black"
                                        aria-label="מסך מלא"
                                    >
                                        <span className="w-11 h-11 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:border-[#f6c85b]">
                                            <Maximize size={18} />
                                        </span>
                                        <span className="text-sm font-bold">מסך מלא</span>
                                    </button>
                                )}

                                {!editorMode && (
                                    <button
                                        onClick={() => onSave?.()}
                                        className="flex flex-col items-center gap-1.5 text-black"
                                        aria-label="שמירה לגלריה"
                                    >
                                        <span className="w-11 h-11 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:border-[#f6c85b]">
                                            <Save size={18} />
                                        </span>
                                        <span className="text-sm font-bold">שמירה</span>
                                    </button>
                                )}

                                {!editorMode && (
                                    <div className="relative flex flex-col items-center gap-1.5" ref={shareMenuRef}>
                                        <button
                                            onClick={() => setShareMenuOpen(prev => !prev)}
                                            className="w-11 h-11 bg-white border border-gray-200 rounded-full text-black flex items-center justify-center hover:border-[#f6c85b]"
                                            aria-label="שתפו ספר"
                                        >
                                            <Share2 size={18} />
                                        </button>
                                        <span className="text-sm font-bold text-black">שיתוף</span>
                                        {shareMenuOpen && (
                                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-[120] w-56 bg-white border-4 border-[#f6c85b] rounded-2xl p-2 space-y-1">
                                                <button onClick={handleShareMail} className="w-full px-3 py-2 rounded-xl bg-[#fff4db] hover:bg-[#ffe9bc] text-sm font-bold text-black text-right">מייל</button>
                                                <button onClick={handleShareWhatsApp} className="w-full px-3 py-2 rounded-xl bg-[#eafaf1] hover:bg-[#d7f4e5] text-sm font-bold text-black text-right">WhatsApp</button>
                                                <button onClick={handleShareFacebook} className="w-full px-3 py-2 rounded-xl bg-[#eaf1ff] hover:bg-[#dbe7ff] text-sm font-bold text-black text-right">Facebook</button>
                                                <button onClick={handleShareInstagram} className="w-full px-3 py-2 rounded-xl bg-[#fff0f6] hover:bg-[#ffe1ef] text-sm font-bold text-black text-right">Instagram</button>
                                                <button onClick={handleShareCopy} className="w-full px-3 py-2 rounded-xl bg-[#f3f4f6] hover:bg-[#e5e7eb] text-sm font-bold text-black text-right">{shareFeedback === 'copied' ? 'הקישור הועתק' : 'העתקת קישור'}</button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {editorMode ? (
                                    <>
                                        {currentIndex === 0 && (
                                            <button
                                                onClick={openTitleEditor}
                                                className="h-9 px-3 rounded-full border border-[#f6c85b] bg-[#fff4db] hover:bg-[#ffe9bc] text-black text-xs font-bold inline-flex items-center justify-center gap-1.5"
                                                aria-label="עריכת כריכה"
                                            >
                                                <Edit2 size={14} />
                                                עריכת כריכה
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <button
                                        onClick={openTitleEditor}
                                        className="flex flex-col items-center gap-1.5 text-black"
                                        aria-label="עריכת כותרת"
                                    >
                                        <span className="w-11 h-11 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:border-[#f6c85b]">
                                            <Edit2 size={18} />
                                        </span>
                                        <span className="text-sm font-bold">עריכת כותרת</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {isWebStyleEditing && (
                        <div className="w-full bg-white rounded-2xl p-3 border border-gray-200 space-y-3 shadow-sm">
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setMobileTitleStyle(prev => ({ ...prev, text: story.title }))}
                                    className="h-10 px-3 bg-gray-100 text-black text-[13px] font-bold rounded-xl border border-gray-200"
                                >
                                    איפוס טקסט
                                </button>
                                <button
                                    onClick={() => setIsMovingTitle(prev => !prev)}
                                    className={`h-10 px-3 text-[13px] font-bold rounded-xl border transition inline-flex items-center justify-center gap-1 ${isMovingTitle ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-200'}`}
                                >
                                    <MoveVertical size={15} />
                                    הזזת כותרת
                                </button>
                                <button
                                    onClick={() => {
                                        setUseCleanCover(false);
                                        setIsWebStyleEditing(false);
                                        setIsMovingTitle(false);
                                    }}
                                    className="h-10 px-3 bg-white text-black text-[13px] font-bold rounded-xl border border-gray-200"
                                >
                                    חזרה למקורי
                                </button>
                                <button
                                    onClick={() => {
                                        setIsWebStyleEditing(false);
                                        setIsMovingTitle(false);
                                    }}
                                    className="h-10 px-3 bg-[#f6c85b] text-black text-[13px] font-bold rounded-xl"
                                >
                                    סיום עריכה
                                </button>
                            </div>

                            <div className="space-y-1.5">
                                <label className="flex items-center justify-between gap-2 border border-gray-200 rounded-xl px-2.5 py-2.5">
                                    <span className="text-[13px] font-bold text-black min-w-[2.1rem]">גודל</span>
                                    <input
                                        type="range"
                                        min={14}
                                        max={42}
                                        step={1}
                                        value={mobileTitleStyle.fontSize}
                                        onChange={e => setMobileTitleStyle(prev => ({ ...prev, fontSize: Number(e.target.value) }))}
                                        className="cover-range-slider w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer"
                                    />
                                    <span className="text-[13px] font-bold text-black w-8 text-left">{mobileTitleStyle.fontSize}</span>
                                </label>

                                <div className="grid grid-cols-2 gap-2">
                                    <label className="flex items-center justify-between gap-2 border border-gray-200 rounded-xl px-2.5 py-2.5">
                                        <span className="text-[13px] font-bold text-black">צבע</span>
                                        <input
                                            type="color"
                                            value={mobileTitleStyle.color}
                                            onChange={e => setMobileTitleStyle(prev => ({ ...prev, color: e.target.value }))}
                                            className="w-7 h-7 rounded-full border border-gray-200 p-0 overflow-hidden"
                                        />
                                    </label>
                                    <button
                                        onClick={() => setMobileTitleStyle(prev => ({ ...prev, showGradient: !prev.showGradient }))}
                                        className={`border rounded-xl px-2.5 py-2.5 text-[13px] font-bold transition ${mobileTitleStyle.showGradient ? 'bg-[#4b947d] text-white border-[#4b947d]' : 'bg-white text-black border-gray-200'}`}
                                    >
                                        צל רקע: {mobileTitleStyle.showGradient ? 'פעיל' : 'כבוי'}
                                    </button>
                                </div>
                            </div>

                            {isMovingTitle && (
                                <label className="flex items-center justify-between gap-2 border border-gray-200 rounded-xl px-2.5 py-2.5">
                                    <span className="text-[13px] font-bold text-black min-w-[2.6rem]">מיקום</span>
                                    <input
                                        type="range"
                                        min={5}
                                        max={90}
                                        step={1}
                                        value={mobileTitleStyle.positionY}
                                        onChange={e => setMobileTitleStyle(prev => ({ ...prev, positionY: Number(e.target.value) }))}
                                        className="cover-range-slider w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer"
                                    />
                                    <span className="text-[13px] font-bold text-black w-8 text-left">{mobileTitleStyle.positionY}</span>
                                </label>
                            )}

                            <div className="grid grid-cols-2 gap-2">
                                {TITLE_FONTS.map(f => (
                                    <button
                                        key={f.id}
                                        onClick={() => setMobileTitleStyle(prev => ({ ...prev, fontId: f.id }))}
                                        className={`px-2 py-2 rounded-xl text-[13px] font-bold transition ${mobileTitleStyle.fontId === f.id ? 'bg-black text-white' : 'bg-white text-black border border-gray-200'}`}
                                        style={{ fontFamily: f.family, fontWeight: f.weight }}
                                    >
                                        <span className="block leading-tight">{f.label}</span>
                                        <span className="block text-[10px] opacity-80 leading-tight mt-0.5">אבגדה</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {editorMode && !isWebStyleEditing && currentIndex > 0 && currentIndex <= visibleStoryPages && (
                        <div className="w-full bg-white rounded-2xl border border-gray-200 px-3 py-3 mt-3 space-y-3">
                            <div className="grid grid-cols-1 gap-2">
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
                                    <input type="range" min="14" max="32" value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} className="w-full max-w-[140px] accent-[#F9C922]" />
                                    <span className="text-xs font-bold text-black/60 w-8 text-left">{fontSize}</span>
                                </label>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="w-full flex items-center justify-between mt-6 px-2">
                    <button
                        onClick={prev}
                        disabled={currentIndex === 0}
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${currentIndex === 0 ? 'opacity-0 pointer-events-none' : 'bg-white text-[#1A1A1A] active:scale-90 border border-gray-200'}`}
                    >
                        <ChevronRight size={28} strokeWidth={2.5} />
                    </button>
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-sm font-bold text-black">
                            {currentIndex === 0 ? "כריכה" : currentIndex === totalPages - 1 ? "סיום" : `עמוד ${currentIndex}`}
                        </span>
                        <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-[#f6c85b] transition-all duration-300 ease-out" style={{ width: `${(currentIndex / (totalPages - 1)) * 100}%` }} />
                        </div>
                    </div>
                    <button
                        onClick={next}
                        disabled={currentIndex === totalPages - 1}
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${currentIndex === totalPages - 1 ? 'opacity-0 pointer-events-none' : 'bg-[#1A1A1A] text-white active:scale-90'}`}
                    >
                        <ChevronLeft size={28} strokeWidth={2.5} />
                    </button>
                </div>
            )}

            <style>{`
                .animate-bounce-slow {
                    animation: bounce 3s infinite;
                }
                @keyframes bounce {
                    0%, 100% { transform: translateY(-5%); }
                    50% { transform: translateY(0); }
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
            `}</style>
        </div>
    );
};

export default MobileBookView;
