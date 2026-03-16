import React from 'react';
import { Story } from '../types';
import '../lib/turn';
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
declare const FlipbookView: React.FC<FlipbookViewProps>;
export default FlipbookView;
