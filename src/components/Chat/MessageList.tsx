
import React, { useEffect, useRef, useState } from 'react';
import { ArtStyle, ChatMessage, ChatStep } from '../../types';
import { designSystem } from '../../lib/designSystem'; // Assuming absolute import or relative adjustment
import { trackEvent } from '../../lib/analytics';
import { StylePicker } from './StylePicker';

interface MessageListProps {
    messages: ChatMessage[];
    isTyping: boolean;
    scrollToLatestSignal?: number;
    step?: ChatStep;
    selectedStyle?: ArtStyle;
    onStyleSelect?: (style: ArtStyle) => void;
    stylePreviewImage?: string;
}

export const MessageList: React.FC<MessageListProps> = ({
    messages,
    isTyping,
    scrollToLatestSignal = 0,
    step,
    selectedStyle,
    onStyleSelect,
    stylePreviewImage
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const isInitialMount = useRef(true);
    const previousMessagesLength = useRef(0);
    const scrollMilestonesRef = useRef<Set<number>>(new Set());
    const [shouldBottomAlign, setShouldBottomAlign] = useState(true);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateLayoutMode = () => {
            const hasScrollableOverflow = container.scrollHeight > container.clientHeight + 1;
            setShouldBottomAlign(!hasScrollableOverflow);
        };

        updateLayoutMode();

        const resizeObserver = new ResizeObserver(updateLayoutMode);
        resizeObserver.observe(container);

        return () => resizeObserver.disconnect();
    }, [messages, isTyping, scrollToLatestSignal]);

    useEffect(() => {
        if (containerRef.current) {
            // On initial mount, start at top to show first message
            if (isInitialMount.current) {
                isInitialMount.current = false;
                requestAnimationFrame(() => {
                    if (containerRef.current) {
                        containerRef.current.scrollTop = 0;
                    }
                });
            } else {
                // After initial mount, scroll to bottom only when new messages arrive
                const hasNewMessages = messages.length > previousMessagesLength.current;
                if (hasNewMessages || isTyping) {
                    requestAnimationFrame(() => {
                        if (containerRef.current) {
                            containerRef.current.scrollTop = containerRef.current.scrollHeight;
                        }
                    });
                }
            }
            previousMessagesLength.current = messages.length;
        }
    }, [messages, isTyping]);

    useEffect(() => {
        if (!scrollToLatestSignal || !containerRef.current) return;

        const scrollToBottom = () => {
            if (containerRef.current) {
                containerRef.current.scrollTop = containerRef.current.scrollHeight;
            }
        };

        requestAnimationFrame(scrollToBottom);
        const timeoutId = window.setTimeout(scrollToBottom, 220);

        return () => window.clearTimeout(timeoutId);
    }, [scrollToLatestSignal]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const milestones = [10, 25, 50, 75, 90, 100];

        const reportMilestones = () => {
            const pagePath = window.location.pathname;
            const scrollableHeight = Math.max(container.scrollHeight - container.clientHeight, 1);
            const percentage = Math.min(100, Math.max(0, Math.round((container.scrollTop / scrollableHeight) * 100)));

            for (const milestone of milestones) {
                if (percentage < milestone || scrollMilestonesRef.current.has(milestone)) continue;
                scrollMilestonesRef.current.add(milestone);
                trackEvent('ui_scroll', {
                    scope: 'chat_messages',
                    milestone_percent: milestone,
                    scroll_top: Math.round(container.scrollTop),
                    scroll_height: container.scrollHeight,
                    viewport_height: container.clientHeight,
                    message_count: messages.length,
                    _dedupe_key: `chat_messages:${pagePath}:${milestone}`
                }, pagePath);
            }
        };

        container.addEventListener('scroll', reportMilestones, { passive: true });
        reportMilestones();
        return () => container.removeEventListener('scroll', reportMilestones);
    }, [messages.length]);

    return (
        <div
            ref={containerRef}
            data-track-id="chat-messages-list"
            className="flex-1 overflow-y-auto px-4 md:px-8 pt-8 pb-6 md:pb-4 space-y-4 custom-scrollbar relative bg-[#F4F5F7]"
        >
            <div className={`flex min-h-full flex-col gap-4 ${shouldBottomAlign ? 'justify-end' : ''}`}>
                {messages.map((m) => (
                    <div
                        key={m.id}
                        className={`flex w-full ${m.sender === 'agent' ? 'justify-start' : 'justify-end'}`}
                    >
                        <div
                            className={`${m.type === 'image' ? 'p-1' : 'px-5 py-3'} max-w-[85%] md:max-w-[70%] rounded-2xl font-normal text-lg md:text-lg leading-relaxed ${m.sender === 'agent'
                                ? 'rounded-tl-none bg-white text-black border border-gray-100'
                                : 'bg-[#f6c85b] text-black rounded-tr-none'
                                }`}
                            dir="rtl"
                            style={{
                                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
                                backgroundColor: m.isBlue ? '#3c70b2' : undefined,
                                color: m.isBlue ? '#FFFFFF' : '#000000'
                            }}
                        >
                            {m.type === 'image' && m.imageUrl ? (
                                <div className="overflow-hidden rounded-xl">
                                    <img
                                        src={m.imageUrl}
                                        alt="Uploaded content"
                                        className="max-w-full h-auto object-cover max-h-[300px] block"
                                    />
                                </div>
                            ) : m.type === 'multi-image' && m.imageUrls ? (
                                <div className="flex flex-wrap gap-2 justify-start" dir="rtl">
                                    {m.imageUrls.map((url, idx) => (
                                        <div key={idx} className="w-16 h-16 md:w-20 md:h-20 overflow-hidden rounded-lg border border-gray-100 shadow-sm shrink-0">
                                            <img
                                                src={url}
                                                alt={`Summary ${idx}`}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                m.text
                            )}
                        </div>
                    </div>
                ))}

                {isTyping && (
                    <div className="flex justify-start">
                        <div className="px-5 py-4 rounded-2xl rounded-tl-none flex gap-1.5 items-center bg-white border border-gray-100">
                            <span className="w-2 h-2 bg-[#000000] rounded-full animate-bounce"></span>
                            <span className="w-2 h-2 bg-[#000000] rounded-full animate-bounce [animation-delay:0.2s]"></span>
                            <span className="w-2 h-2 bg-[#000000] rounded-full animate-bounce [animation-delay:0.4s]"></span>
                        </div>
                    </div>
                )}

                {step === 'STYLE' && onStyleSelect && (
                    <div className="flex justify-start w-full">
                        <div className="max-w-[92%] md:max-w-[78%] rounded-[28px] rounded-tl-none border border-gray-100 bg-white p-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                            <StylePicker
                                onSelect={onStyleSelect}
                                selectedStyle={selectedStyle}
                                previewImage={stylePreviewImage}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
