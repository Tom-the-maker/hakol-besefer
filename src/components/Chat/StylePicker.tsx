import React, { useEffect, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';
import { ArtStyle } from '../../types';
import { getStyleDisplayLabel } from '../../lib/styleLabels';

type StyleOption = {
    style: ArtStyle;
    accent: string;
    surface: string;
    imageFilter: string;
};

const STYLE_OPTIONS: StyleOption[] = [
    { style: ArtStyle.Pixar, accent: '#FFB84C', surface: '#FFF4D8', imageFilter: 'saturate(1.18) contrast(1.04) brightness(1.05)' },
    { style: ArtStyle.Watercolor, accent: '#8CC5FF', surface: '#F4F8FF', imageFilter: 'saturate(0.88) contrast(0.92) brightness(1.08)' },
    { style: ArtStyle.Comic, accent: '#FF5B2E', surface: '#FFF1EA', imageFilter: 'saturate(1.45) contrast(1.2) brightness(1.02)' },
    { style: ArtStyle.Pencil, accent: '#4B5563', surface: '#F4F4F5', imageFilter: 'grayscale(1) contrast(1.18) brightness(1.06)' },
    { style: ArtStyle.Dreamy, accent: '#8F6BFF', surface: '#F7F2FF', imageFilter: 'saturate(0.92) contrast(0.96) brightness(1.1)' },
    { style: ArtStyle.Anime, accent: '#FF6FB5', surface: '#FFF1F8', imageFilter: 'saturate(1.28) contrast(1.08) brightness(1.04)' },
    { style: ArtStyle.Claymation, accent: '#C96A3C', surface: '#FFF2E9', imageFilter: 'saturate(1.06) contrast(1.16) brightness(1.01)' },
    { style: ArtStyle.DisneyClassic, accent: '#2E8A68', surface: '#EFFBF6', imageFilter: 'saturate(1.04) contrast(1.02) brightness(1.08)' },
    { style: ArtStyle.Cyberpunk, accent: '#00C8FF', surface: '#EDF8FF', imageFilter: 'saturate(1.38) contrast(1.22) brightness(0.92)' },
];

const renderOverlay = (style: ArtStyle, accent: string) => {
    switch (style) {
        case ArtStyle.Pixar:
            return (
                <>
                    <div className="absolute inset-x-0 bottom-0 h-[38%] bg-[linear-gradient(180deg,transparent_0%,rgba(255,184,76,0.2)_35%,rgba(255,184,76,0.42)_100%)]" />
                    <div className="absolute left-5 top-5 h-14 w-14 rounded-full bg-white/28 blur-xl" />
                </>
            );
        case ArtStyle.Watercolor:
            return (
                <>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_24%,rgba(140,197,255,0.32),transparent_32%),radial-gradient(circle_at_78%_26%,rgba(255,183,210,0.26),transparent_28%),radial-gradient(circle_at_56%_78%,rgba(255,224,153,0.26),transparent_30%)]" />
                    <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.35)_1px,transparent_1px)] [background-size:24px_24px]" />
                </>
            );
        case ArtStyle.Comic:
            return (
                <>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.2)_1.1px,transparent_0)] [background-size:12px_12px] opacity-60 mix-blend-multiply" />
                    <div className="absolute inset-0 ring-1 ring-black/10" />
                    <div
                        className="absolute left-4 top-4 rounded-full px-3 py-1 text-[10px] font-black text-white shadow-sm"
                        style={{ backgroundColor: accent }}
                    >
                        POP
                    </div>
                </>
            );
        case ArtStyle.Pencil:
            return (
                <>
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(82,82,91,0.09)_1px,transparent_1px)] [background-size:100%_10px] opacity-75" />
                    <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.35)_40%,rgba(82,82,91,0.06)_100%)]" />
                </>
            );
        case ArtStyle.Dreamy:
            return (
                <>
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(143,107,255,0.32)_0%,rgba(246,166,193,0.24)_55%,rgba(255,255,255,0.08)_100%)]" />
                    <div className="absolute right-5 top-5 h-3 w-3 rounded-full bg-white/90 shadow-[0_0_14px_rgba(255,255,255,0.75)]" />
                    <div className="absolute left-6 top-10 h-2 w-2 rounded-full bg-white/70 shadow-[0_0_10px_rgba(255,255,255,0.6)]" />
                </>
            );
        case ArtStyle.Anime:
            return (
                <>
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(143,208,255,0.24)_0%,transparent_36%,rgba(255,111,181,0.22)_100%)]" />
                    <div className="absolute inset-x-0 bottom-0 h-[32%] bg-[linear-gradient(180deg,transparent_0%,rgba(255,255,255,0.22)_100%)]" />
                </>
            );
        case ArtStyle.Claymation:
            return (
                <>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(255,255,255,0.18),transparent_18%),linear-gradient(180deg,rgba(201,106,60,0.08)_0%,rgba(201,106,60,0.3)_100%)]" />
                    <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(rgba(255,255,255,0.5)_0.7px,transparent_0.7px)] [background-size:12px_12px]" />
                </>
            );
        case ArtStyle.DisneyClassic:
            return (
                <>
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.2)_0%,transparent_35%,rgba(46,138,104,0.18)_100%)]" />
                    <div className="absolute right-6 top-6 h-2.5 w-2.5 rounded-full bg-white/95 shadow-[0_0_10px_rgba(255,255,255,0.65)]" />
                    <div className="absolute right-10 top-10 h-2 w-2 rounded-full bg-white/80" />
                </>
            );
        case ArtStyle.Cyberpunk:
            return (
                <>
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,11,34,0.16)_0%,rgba(0,200,255,0.18)_40%,rgba(255,79,216,0.2)_100%)]" />
                    <div className="absolute inset-y-0 left-[48%] w-px bg-[#00C8FF]/70 shadow-[0_0_12px_rgba(0,200,255,0.8)]" />
                    <div className="absolute inset-y-0 left-[61%] w-px bg-[#FF4FD8]/50 shadow-[0_0_10px_rgba(255,79,216,0.7)]" />
                </>
            );
    }
};

const renderFallbackPreview = (surface: string, accent: string) => (
    <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: surface }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_24%,rgba(255,255,255,0.75),transparent_28%),radial-gradient(circle_at_72%_68%,rgba(0,0,0,0.05),transparent_22%)]" />
        <div
            className="absolute bottom-5 left-1/2 h-24 w-20 -translate-x-1/2 rounded-[28px] blur-[1px]"
            style={{ backgroundColor: `${accent}55` }}
        />
        <div
            className="absolute bottom-[108px] left-1/2 h-14 w-14 -translate-x-1/2 rounded-full"
            style={{ backgroundColor: `${accent}33` }}
        />
    </div>
);

interface StylePickerProps {
    onSelect: (style: ArtStyle) => void;
    selectedStyle?: ArtStyle;
    previewImage?: string;
}

export const StylePicker: React.FC<StylePickerProps> = ({ onSelect, selectedStyle, previewImage }) => {
    const railRef = useRef<HTMLDivElement>(null);

    const scrollRailLeft = () => {
        railRef.current?.scrollBy({ left: -180, behavior: 'smooth' });
    };

    useEffect(() => {
        const handleExternalScroll = () => {
            scrollRailLeft();
        };

        window.addEventListener('style-picker-scroll-left', handleExternalScroll);
        return () => window.removeEventListener('style-picker-scroll-left', handleExternalScroll);
    }, []);

    return (
        <div className="relative w-full">
            <style>{`
                @keyframes styleArrowNudge {
                    0%, 100% { transform: translateX(0); opacity: 0.92; }
                    50% { transform: translateX(-5px); opacity: 1; }
                }
            `}</style>

            <button
                type="button"
                onClick={scrollRailLeft}
                aria-label="גללו שמאלה לעוד סגנונות"
                className="absolute -left-10 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black text-white shadow-[0_10px_20px_rgba(0,0,0,0.16)] md:flex"
            >
                <ChevronLeft size={18} className="animate-[styleArrowNudge_1.6s_ease-in-out_infinite]" />
            </button>

            <button
                type="button"
                onClick={scrollRailLeft}
                aria-label="גללו שמאלה לעוד סגנונות"
                className="absolute -left-8 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black text-white shadow-[0_10px_20px_rgba(0,0,0,0.16)] md:hidden"
            >
                <ChevronLeft size={18} className="animate-[styleArrowNudge_1.6s_ease-in-out_infinite]" />
            </button>

            <div className="overflow-visible">
                <div
                    ref={railRef}
                    className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                {STYLE_OPTIONS.map((option) => {
                    const label = getStyleDisplayLabel(option.style);

                    return (
                        <button
                            key={option.style}
                            type="button"
                            onClick={() => onSelect(option.style)}
                            aria-label={`בחרו סגנון ${label}`}
                            className="group relative w-[146px] shrink-0 snap-start text-right transition-transform duration-200 active:scale-[0.985] md:w-[174px]"
                            dir="rtl"
                        >
                            <div className="overflow-hidden rounded-[24px] border border-[#E5E7EB] bg-white shadow-[0_6px_20px_rgba(15,23,42,0.05)] transition-all duration-200 group-hover:border-[#d8dce2]">
                                <div className="relative aspect-[3/4] overflow-hidden rounded-t-[24px]" style={{ backgroundColor: option.surface }}>
                                    {previewImage ? (
                                        <>
                                            <img
                                                src={previewImage}
                                                alt={label}
                                                className="absolute inset-0 h-full w-full object-cover"
                                                style={{ filter: option.imageFilter, transform: 'scale(1.04)' }}
                                            />
                                            {renderOverlay(option.style, option.accent)}
                                        </>
                                    ) : (
                                        renderFallbackPreview(option.surface, option.accent)
                                    )}

                                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08)_0%,rgba(0,0,0,0.22)_100%)]" />
                                </div>

                                <div className="px-3 py-3">
                                    <div className="text-center text-[15px] font-bold leading-none text-black md:text-base">
                                        {label}
                                    </div>
                                </div>
                            </div>
                        </button>
                    );
                })}
                </div>
            </div>
        </div>
    );
};
