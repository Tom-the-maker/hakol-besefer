import React, { useRef, useState } from 'react';
import { UserInputs, ArtStyle } from '../types';
import { useChatFlow } from '../hooks/useChatFlow';
import { designSystem } from '../lib/designSystem';
import { MessageList } from './Chat/MessageList';
import { InputArea } from './Chat/InputArea';
import { Uploader } from './Chat/Uploader';
import { ArrowUp, ChevronRight } from 'lucide-react';
import { ImageCropper } from './ImageCropper';

// Helper to calculate progress
const STEPS_ORDER = [
  'ONBOARDING', 'NAME', 'NAME_CONFIRM', 'GENDER', 'AGE',
  'PHOTO_VALIDATION', 'TOPIC', 'ADDITIONAL_CHARACTERS', 'GET_CHAR_DETAILS',
  'PARENT_PHOTO', 'THIRD_CHOICE', 'THIRD_PHOTO', 'STYLE', 'DEDICATION', 'EMAIL', 'CONFIRMATION', 'COMPLETED'
];

const getProgressPercentage = (currentStep: string) => {
  const index = STEPS_ORDER.indexOf(currentStep);
  if (index === -1) return 0;
  return Math.round(((index + 1) / STEPS_ORDER.length) * 100);
};

interface ChatInterfaceProps {
  onComplete: (inputs: UserInputs) => void;
  initialValues?: Partial<UserInputs>;
  onBack?: () => void;
  topError?: string;
  onDismissError?: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ onComplete, initialValues, onBack, topError, onDismissError }) => {
  // console.debug("💬 ChatInterface mounted with initialValues:", initialValues);
  const {
    messages,
    step,
    isTyping,
    suggestedTitles,
    isGeneratingTitles,
    handlers,
    inputs,
    setInputs,
    imageToCrop,
    isCropperOpen
  } = useChatFlow(onComplete, initialValues);

  // Local state for custom input in choice steps
  const [showCustomInput, setShowCustomInput] = useState(false);
  const inputDockRef = useRef<HTMLDivElement>(null);
  const [composerLift, setComposerLift] = useState(0);
  const [scrollToLatestSignal, setScrollToLatestSignal] = useState(0);

  // Reset custom input when step changes
  React.useEffect(() => {
    setShowCustomInput(false);
  }, [step]);

  // Prevent body scroll and zoom on mobile when chat is open
  React.useEffect(() => {
    if (window.innerWidth < 768) {
      document.body.classList.add('chat-open');
      document.documentElement.classList.add('chat-open');

      // Prevent zoom on input focus
      const preventZoom = (e: TouchEvent) => {
        if (e.touches.length > 1) {
          e.preventDefault();
        }
      };

      // Prevent double-tap zoom
      let lastTouchEnd = 0;
      const preventDoubleTapZoom = (e: TouchEvent) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
          e.preventDefault();
        }
        lastTouchEnd = now;
      };

      document.addEventListener('touchstart', preventZoom, { passive: false });
      document.addEventListener('touchend', preventDoubleTapZoom, { passive: false });

      return () => {
        document.body.classList.remove('chat-open');
        document.documentElement.classList.remove('chat-open');
        document.removeEventListener('touchstart', preventZoom);
        document.removeEventListener('touchend', preventDoubleTapZoom);
      };
    }
  }, []);

  React.useEffect(() => {
    if (window.innerWidth >= 768 || !window.visualViewport) {
      setComposerLift(0);
      return;
    }

    const viewport = window.visualViewport;
    let frameId = 0;

    const syncComposerLift = () => {
      cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const dock = inputDockRef.current;
        if (!dock) return;

        const visibleBottom = viewport.height + viewport.offsetTop;
        const dockRect = dock.getBoundingClientRect();
        const desiredGap = 8;
        const overlap = dockRect.bottom + desiredGap - visibleBottom;
        const nextLift = Math.max(0, Math.round(overlap));

        setComposerLift((currentLift) =>
          Math.abs(nextLift - currentLift) < 2 ? currentLift : nextLift
        );
      });
    };

    const resetComposerLift = () => {
      cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        setComposerLift(0);
      });
    };

    viewport.addEventListener('resize', syncComposerLift);
    viewport.addEventListener('scroll', syncComposerLift);
    document.addEventListener('focusin', syncComposerLift);
    document.addEventListener('focusout', resetComposerLift);

    syncComposerLift();

    return () => {
      cancelAnimationFrame(frameId);
      viewport.removeEventListener('resize', syncComposerLift);
      viewport.removeEventListener('scroll', syncComposerLift);
      document.removeEventListener('focusin', syncComposerLift);
      document.removeEventListener('focusout', resetComposerLift);
    };
  }, [messages.length, step]);

  React.useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!inputDockRef.current?.contains(target)) return;
      setScrollToLatestSignal((current) => current + 1);
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);

  return (
    <div className="chat-shell h-[100dvh] md:h-[700px] w-full md:max-w-4xl md:mx-auto flex flex-col fixed md:relative inset-0 md:inset-auto z-50 md:z-auto touch-none md:touch-auto md:rounded-3xl md:overflow-hidden bg-[#F4F5F7] md:border md:border-gray-200 font-sans">
      {/* Header */}
      <div className="shrink-0 bg-[#FFC72C] px-4 md:px-8 py-3 md:py-6 md:border-b md:border-gray-100 flex flex-col items-center justify-center relative gap-2 pt-[max(12px,calc(12px+env(safe-area-inset-top,0px)))] md:pt-6">
        <div
          className="md:hidden absolute right-4 z-10"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 30px)', transform: 'translateY(-50%)' }}
        >
          <button
            type="button"
            onClick={onBack}
            aria-label="חזרה לדף הבית"
            className="inline-flex items-center justify-center bg-transparent p-0 text-black leading-none opacity-90"
            style={{ color: '#000000' }}
          >
            <ChevronRight size={22} strokeWidth={2.75} />
          </button>
        </div>
        <h2 className="text-xl md:text-2xl font-heading font-black text-black text-center" style={{ color: '#000000' }}>
          בואו נעשה מזה סיפור
        </h2>
        {/* Progress Bar */}
        <div className="w-full max-w-xs h-1.5 bg-black/10 rounded-full overflow-hidden mt-1">
          <div
            className="h-full bg-black/80 transition-all duration-500 ease-out"
            style={{ width: `${getProgressPercentage(step)}%` }}
          />
        </div>
      </div>

      {topError && (
        <div className="shrink-0 bg-red-50 border-b border-red-200 px-4 py-3 text-center">
          <p className="text-red-700 text-sm md:text-base font-semibold break-words">{topError}</p>
          <button
            onClick={onDismissError}
            className="mt-2 text-red-700 underline text-sm font-semibold"
          >
            סגור
          </button>
        </div>
      )}

      {/* Messages Area */}
      <MessageList
        messages={messages}
        isTyping={isTyping}
        scrollToLatestSignal={scrollToLatestSignal}
        step={step}
        selectedStyle={inputs.artStyle}
        stylePreviewImage={inputs.characterImage || inputs.parentImage}
        onStyleSelect={step === 'STYLE' ? (style) => handlers.handleStyleSelect(style) : undefined}
      />

      {/* Input / Interaction Area - Darkened for better contrast */}
      <div
        ref={inputDockRef}
        className="shrink-0 bg-[#E5E7EB] px-3 md:px-8 py-3 md:py-6 border-t border-gray-200 transition-[margin] duration-200 ease-out"
        style={{ marginBottom: composerLift > 0 ? `${composerLift}px` : undefined }}
      >
        <div className="max-w-4xl mx-auto w-full">

          {step === 'STYLE' && (
            <div className="flex gap-2 w-full items-center">
              <div
                className="flex-1 bg-white border border-gray-300 rounded-full px-4 py-2.5"
                dir="rtl"
                style={{
                  fontSize: '19px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
                  color: '#6B7280',
                  textAlign: 'right'
                }}
              >
                גללו שמאלה לעוד סגנונות
              </div>
              <button
                type="button"
                aria-label="גללו שמאלה לעוד סגנונות"
                onClick={() => window.dispatchEvent(new Event('style-picker-scroll-left'))}
                className="bg-[#f6c85b] hover:bg-[#f6c85b]/90 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full shrink-0 transition-colors"
                style={{ color: '#000000' }}
              >
                <ArrowUp size={20} className="text-black" />
              </button>
            </div>
          )}

          {step !== 'STYLE' && (
          <>
          {step === 'ONBOARDING' && (
            <div className="flex flex-col gap-3 w-full">
              <div className="flex justify-center w-full">
                <button
                  onClick={handlers.handleStart}
                  data-track-id="chat-start-button"
                  className="bg-[#f6c85b] hover:bg-[#f6c85b]/90 text-black px-10 py-4 rounded-full text-lg font-heading font-black transition-all shadow-md hover:scale-105"
                  style={{ color: '#000000' }}
                >
                  יאללה, בוא נתחיל!
                </button>
              </div>
            </div>
          )}

          {step === 'NAME' && (
            <InputArea
              placeholder="למשל מאיה בת 4"
              onSubmit={handlers.handleNameSubmit}
              autoFocus
            />
          )}

          {step === 'NAME_CONFIRM' && (
            <div className="flex flex-col gap-3 w-full">
              <div className="flex justify-start gap-3 w-full" dir="rtl">
                <button
                  onClick={() => handlers.handleNameConfirm(true)}
                  className="px-6 py-2 bg-white border border-gray-300 rounded-full text-black text-base font-normal transition-all hover:border-[#f6c85b] active:scale-95"
                  style={{ color: '#000000' }}
                >
                  כן, זה השם
                </button>
                <button
                  onClick={() => handlers.handleNameConfirm(false)}
                  className="px-6 py-2 bg-white border border-gray-300 rounded-full text-black text-base font-normal transition-all hover:border-[#f6c85b] active:scale-95"
                  style={{ color: '#000000' }}
                >
                  לא, בוא נתקן
                </button>
              </div>
              <InputArea
                placeholder="תיקון שם (אם צריך)..."
                onSubmit={handlers.handleNameSubmit}
              />
            </div>
          )}

          {step === 'GENDER' && (
            <div className="flex flex-col gap-4 w-full">
              <div className="flex justify-start gap-3 w-full" dir="rtl">
                <button
                  onClick={() => handlers.handleGenderSubmit('boy')}
                  className="px-6 py-2 bg-white border border-gray-300 rounded-full text-black text-base font-normal transition-all hover:border-[#f6c85b] active:scale-95"
                  style={{ color: '#000000' }}
                >
                  בן
                </button>
                <button
                  onClick={() => handlers.handleGenderSubmit('girl')}
                  className="px-6 py-2 bg-white border border-gray-300 rounded-full text-black text-base font-normal transition-all hover:border-[#f6c85b] active:scale-95"
                  style={{ color: '#000000' }}
                >
                  בת
                </button>
              </div>
              <InputArea
                placeholder="או כתבו כאן..."
                onSubmit={handlers.handleGenderSubmit}
              />
            </div>
          )}

          {step === 'AGE' && (
            <div className="w-full">
              <InputArea
                placeholder="הקלידו גיל במספרים"
                onSubmit={handlers.handleAgeSubmit}
              />
            </div>
          )}

          {step === 'PHOTO_VALIDATION' && (
            <Uploader
              label="העלאת תמונה 📸"
              subLabel="לחצו כאן לבחירת תמונה ברורה"
              onFileSelect={handlers.handleChildPhotoUpload}
            />
          )}

          {step === 'TOPIC' && (
            <div className="flex flex-col gap-3 w-full">
              {inputs.topic && inputs.topic.length > 2 && (
                <div className="flex justify-start w-full" dir="rtl">
                  <button
                    onClick={() => handlers.handleTopicSubmit("המשך")}
                    className="bg-white border border-gray-300 hover:bg-gray-50 text-black px-6 py-2 rounded-full text-base font-normal transition-all shadow-sm hover:scale-105"
                    style={{ color: '#000000' }}
                  >
                    מצוין, המשך עם זה
                  </button>
                </div>
              )}
              <InputArea
                placeholder="תארו את ההרפתקה"
                onSubmit={handlers.handleTopicSubmit}
              />
            </div>
          )}

          {step === 'ADDITIONAL_CHARACTERS' && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2 justify-start w-full" dir="rtl">
                {[
                  ...(inputs.age && inputs.age > 13 ? [
                    { id: 'partner', label: 'בן/בת זוג' },
                    { id: 'friend', label: 'חבר/ה' },
                    { id: 'child', label: 'ילד/ה' },
                    { id: 'pet', label: 'כלב/חתול' }
                  ] : [
                    { id: 'mother', label: 'אמא' },
                    { id: 'father', label: 'אבא' },
                    { id: 'grandmother', label: 'סבתא' },
                    { id: 'pet', label: 'כלב/חתול' }
                  ])
                ].map(char => (
                  <button
                    key={char.id}
                    onClick={() => handlers.handleAdditionalCharacterChoice(char.id as any)}
                    className="px-5 py-2 bg-white border border-gray-300 rounded-full text-black text-sm md:text-base font-normal transition-all hover:border-[#f6c85b] active:scale-95"
                    style={{ color: '#000000' }}
                  >
                    {char.label}
                  </button>
                ))}
                <button
                  onClick={() => handlers.handleAdditionalCharacterChoice('skip')}
                  className="px-5 py-2 bg-gray-100 border border-gray-200 rounded-full text-black text-sm md:text-base font-normal transition-all hover:bg-gray-200"
                  style={{ color: '#000000' }}
                >
                  רק {inputs.childName}
                </button>
              </div>
              <InputArea
                placeholder="או כתבו דמות אחרת"
                onSubmit={(val) => handlers.handleAdditionalCharacterChoice('other', val)}
              />
            </div>
          )}



          {step === 'GET_CHAR_DETAILS' && (
            <InputArea
              placeholder="כתבו את השם (וגם גיל/מין אם בא לכם)..."
              onSubmit={handlers.handleCharDetailsSubmit}
            />
          )}

          {step === 'PARENT_PHOTO' && (
            <div className="flex flex-col gap-4 w-full">
              <Uploader
                label={`העלו תמונה של ${inputs.parentCharacter}`}
                subLabel="או דלגו לדמות גנרית"
                onFileSelect={handlers.handleParentPhotoUpload}
              />
              <button
                onClick={() => handlers.handleParentPhotoUpload(null)}
                className="py-2.5 px-6 bg-white border border-gray-300 rounded-full text-black text-sm font-bold hover:bg-gray-50 transition-colors"
                style={{ color: '#000000' }}
              >
                דלג - צור דמות גנרית
              </button>
            </div>
          )}

          {step === 'THIRD_CHOICE' && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2 justify-start w-full" dir="rtl">
                {[
                  ...(inputs.age && inputs.age > 13 ? [
                    { id: 'child', label: 'ילד/ה' },
                    { id: 'friend', label: 'חבר/ה' },
                    { id: 'pet', label: 'כלב/חתול' }
                  ] : [
                    { id: 'grandmother', label: 'סבתא' },
                    { id: 'grandfather', label: 'סבא' },
                    { id: 'brother', label: 'אח' },
                    { id: 'sister', label: 'אחות' },
                    { id: 'pet', label: 'כלב/חתול' }
                  ])
                ].map(char => (
                  <button
                    key={char.id}
                    onClick={() => handlers.handleThirdCharacterChoice(char.id as any)}
                    className="px-5 py-2 bg-white border border-gray-300 rounded-full text-black text-sm md:text-base font-normal transition-all hover:border-[#f6c85b] active:scale-95"
                    style={{ color: '#000000' }}
                  >
                    {char.label}
                  </button>
                ))}
                <button
                  onClick={() => handlers.handleThirdCharacterChoice('skip')}
                  className="px-5 py-2 bg-gray-100 border border-gray-200 rounded-full text-black text-sm md:text-base font-normal transition-all hover:bg-gray-200"
                  style={{ color: '#000000' }}
                >
                  לא, זה הכל
                </button>
              </div>
              <InputArea
                placeholder="או כתבו דמות אחרת"
                onSubmit={(val) => handlers.handleThirdCharacterChoice('other', val)}
              />
            </div>
          )}

          {step === 'THIRD_PHOTO' && (
            <div className="flex flex-col gap-4 w-full">
              <Uploader
                label={`העלו תמונה של ${inputs.thirdCharacter}`}
                subLabel="או דלגו לדמות גנרית"
                onFileSelect={handlers.handleThirdPhotoUpload}
              />
              <button
                onClick={() => handlers.handleThirdPhotoUpload(null)}
                className="py-2.5 px-6 bg-white border border-gray-300 rounded-full text-black text-sm font-bold hover:bg-gray-50 transition-colors"
                style={{ color: '#000000' }}
              >
                דלג - צור דמות גנרית
              </button>
            </div>
          )}

          {step === 'DEDICATION' && (
            <div className="flex flex-col gap-3 w-full">
              <div className="flex gap-2 justify-start" dir="rtl">
                <button
                  onClick={() => handlers.handleDedicationSubmit('לא')}
                  className="bg-white hover:border-[#f6c85b] text-black px-5 py-2 rounded-full text-sm md:text-base font-normal transition-colors border border-gray-300"
                  style={{ color: '#000000' }}
                >
                  בלי הקדשה
                </button>
              </div>
              <InputArea
                placeholder='למשל: "לנכד שלי, באהבה מסבתא"'
                onSubmit={handlers.handleDedicationSubmit}
              />
            </div>
          )}

          {step === 'EMAIL' && (
            <div className="flex flex-col gap-3 w-full">
              <InputArea
                placeholder="כתבו את המייל שלכם..."
                onSubmit={handlers.handleEmailSubmit}
                dir="ltr"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                enterKeyHint="done"
                textAlign="right"
              />
            </div>
          )}

          {step === 'CONFIRMATION' && (
            <div className="flex flex-col gap-6 w-full">
              <div className="flex justify-center w-full">
                <button
                  onClick={handlers.handleConfirm}
                  className="bg-[#FFC72C] hover:bg-[#FFC72C]/90 text-black px-12 py-4 rounded-full text-xl font-heading font-black transition-all shadow-md hover:scale-105 active:scale-95"
                  style={{ color: '#000000' }}
                >
                  תעשו מזה ספר
                </button>
              </div>
              <InputArea
                placeholder="צריך לתקן משהו? כתבו לי כאן..."
                onSubmit={handlers.handleCorrection}
              />
            </div>
          )}

          {step === 'PHOTO_REPLACE_CLARIFY' && (
            <div className="flex justify-start gap-3 w-full" dir="rtl">
              <button
                onClick={() => handlers.handlePhotoReplacementClarify('hero')}
                className="px-6 py-2 bg-white border border-gray-300 rounded-full text-black text-base font-normal transition-all hover:border-[#FFC72C] active:scale-95"
                style={{ color: '#000000' }}
              >
                תמונה של {inputs.childName}
              </button>
              <button
                onClick={() => handlers.handlePhotoReplacementClarify('companion')}
                className="px-6 py-2 bg-white border border-gray-300 rounded-full text-black text-base font-normal transition-all hover:border-[#FFC72C] active:scale-95"
                style={{ color: '#000000' }}
              >
                תמונה של {inputs.parentCharacter}
              </button>
            </div>
          )}

          {step === 'CROP_QUALITY_CONFIRM' && (
            <div className="flex justify-start gap-3 w-full" dir="rtl">
              <button
                onClick={() => handlers.handleCropRetryDecision('use_anyway')}
                className="px-6 py-2 bg-white border border-gray-300 rounded-full text-black text-base font-normal transition-all hover:border-[#FFC72C] active:scale-95"
                style={{ color: '#000000' }}
              >
                כן, זה בסדר
              </button>
              <button
                onClick={() => handlers.handleCropRetryDecision('retry')}
                className="px-6 py-2 bg-white border border-gray-300 rounded-full text-black text-base font-normal transition-all hover:border-[#FFC72C] active:scale-95"
                style={{ color: '#000000' }}
              >
                לא, נסה לחתוך שוב
              </button>
            </div>
          )}

          {step === 'CROP_RETRY_CONFIRM' && (
            <div className="flex justify-start gap-3 w-full" dir="rtl">
              <button
                onClick={() => handlers.handleCropRetryDecision('retry')}
                className="px-6 py-2 bg-white border border-gray-300 rounded-full text-black text-base font-normal transition-all hover:border-[#FFC72C] active:scale-95"
                style={{ color: '#000000' }}
              >
                כן, נסה לחתוך שוב
              </button>
              <button
                onClick={() => handlers.handleCropRetryDecision('new_photo')}
                className="px-6 py-2 bg-white border border-gray-300 rounded-full text-black text-base font-normal transition-all hover:border-[#FFC72C] active:scale-95"
                style={{ color: '#000000' }}
              >
                עזוב, אעלה תמונה אחרת
              </button>
            </div>
          )}
          </>
          )}
        </div>
      </div>

      {/* Image Cropper Modal */}
      {imageToCrop && (
        <ImageCropper
          imageSrc={imageToCrop}
          isOpen={isCropperOpen}
          onClose={() => handlers.setIsCropperOpen(false)}
          onCropComplete={handlers.handleCropComplete}
        />
      )}
    </div>
  );
};

export default ChatInterface;
