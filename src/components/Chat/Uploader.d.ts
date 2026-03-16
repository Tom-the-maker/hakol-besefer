import React from 'react';
interface UploaderProps {
    label: string;
    subLabel: string;
    onFileSelect: (file: File) => void;
}
export declare const Uploader: React.FC<UploaderProps>;
export {};
