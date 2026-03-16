import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Lock, Unlock, Eye, EyeOff, GripVertical } from 'lucide-react';

interface DevToggleProps {
    isUnlocked: boolean;
    onToggleUnlocked: (val: boolean) => void;
    onViewBook?: () => void;
    visible?: boolean;
}

/**
 * Draggable floating Dev toggle.
 * - Dragaable to any position on screen (won't obstruct design)
 * - Toggle is_unlocked to switch pre/post purchase views
 * - Mini "View Book" shortcut
 */
const DevToggle: React.FC<DevToggleProps> = ({
    isUnlocked,
    onToggleUnlocked,
    onViewBook,
    visible = true,
}) => {
    const [expanded, setExpanded] = useState(false);

    // Dragging state
    const [position, setPosition] = useState({ x: 16, y: window.innerHeight - 120 });
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef<HTMLDivElement>(null);
    const dragOffset = useRef({ x: 0, y: 0 });
    const hasMoved = useRef(false);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        setIsDragging(true);
        hasMoved.current = false;
        const rect = dragRef.current?.getBoundingClientRect();
        if (rect) {
            dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging) return;
        hasMoved.current = true;
        const newX = e.clientX - dragOffset.current.x;
        const newY = e.clientY - dragOffset.current.y;
        setPosition({
            x: Math.max(0, Math.min(newX, window.innerWidth - 60)),
            y: Math.max(0, Math.min(newY, window.innerHeight - 60)),
        });
    }, [isDragging]);

    const handlePointerUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Click to toggle expanded (only if not dragged)
    const handleClick = () => {
        if (!hasMoved.current) {
            setExpanded(prev => !prev);
        }
    };

    if (!visible) return null;

    return (
        <div
            ref={dragRef}
            className="fixed z-[9999] select-none"
            style={{
                left: position.x,
                top: position.y,
                touchAction: 'none',
            }}
        >
            {/* Expanded Panel */}
            {expanded && (
                <div className="absolute bottom-14 left-0 bg-black/90 text-white rounded-xl p-3 w-56 space-y-2 animate-in slide-in-from-bottom-2 fade-in duration-200 shadow-2xl backdrop-blur-sm">
                    <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold mb-1">Dev Tools</div>

                    {/* Unlock toggle */}
                    <button
                        onClick={() => onToggleUnlocked(!isUnlocked)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-bold transition-colors ${isUnlocked ? 'bg-[#4b947d]/20 text-[#4b947d]' : 'bg-white/10 text-white/70'
                            }`}
                    >
                        <span className="flex items-center gap-2">
                            {isUnlocked ? <Unlock size={14} /> : <Lock size={14} />}
                            {isUnlocked ? 'Unlocked (Editor)' : 'Locked (Sales)'}
                        </span>
                        <div className={`w-8 h-4 rounded-full relative transition-colors ${isUnlocked ? 'bg-[#4b947d]' : 'bg-white/30'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${isUnlocked ? 'right-0.5' : 'left-0.5'}`} />
                        </div>
                    </button>

                    {/* View Book shortcut */}
                    {onViewBook && (
                        <button
                            onClick={() => { onViewBook(); setExpanded(false); }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                        >
                            <Eye size={14} />
                            View Book
                        </button>
                    )}
                </div>
            )}

            {/* Main Draggable Button */}
            <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onClick={handleClick}
                className={`w-12 h-12 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing shadow-xl transition-transform ${isDragging ? 'scale-110' : 'hover:scale-105'
                    } ${isUnlocked ? 'bg-[#4b947d]' : 'bg-black/80'
                    } text-white backdrop-blur-sm border border-white/20`}
            >
                {isDragging ? (
                    <GripVertical size={18} />
                ) : isUnlocked ? (
                    <Unlock size={18} />
                ) : (
                    <Lock size={18} />
                )}
            </div>
        </div>
    );
};

export default DevToggle;
