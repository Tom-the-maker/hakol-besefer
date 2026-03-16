import React from 'react';
import 'react-image-crop/dist/ReactCrop.css';
interface ImageCropperProps {
    imageSrc: string;
    isOpen: boolean;
    onClose: () => void;
    onCropComplete: (croppedBase64: string, width: number, height: number) => void;
    aspectRatio?: number;
}
export declare const ImageCropper: React.FC<ImageCropperProps>;
export {};
