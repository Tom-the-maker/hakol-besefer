import React from 'react';
import { Story } from '../types';
interface MobileBookViewProps {
    story: Story;
    onUnlock: () => void;
    onRequestFlipbook: () => void;
    onSave?: () => void;
    heroName?: string;
    cleanMode?: boolean;
    editorMode?: boolean;
    isPreviewMode?: boolean;
    hideSecondaryControls?: boolean;
    devPopup?: string | null;
}
declare const MobileBookView: React.FC<MobileBookViewProps>;
export default MobileBookView;
