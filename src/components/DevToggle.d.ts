import React from 'react';
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
declare const DevToggle: React.FC<DevToggleProps>;
export default DevToggle;
