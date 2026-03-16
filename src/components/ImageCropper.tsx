import React, { useState, useRef, useEffect } from 'react';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { canvasPreview } from '../lib/imageUtils'; // We'll need to create or import this helper

// Helper to center the crop initially
function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number) {
    return centerCrop(
        makeAspectCrop(
            {
                unit: '%',
                width: 90,
            },
            aspect,
            mediaWidth,
            mediaHeight,
        ),
        mediaWidth,
        mediaHeight,
    )
}

function defaultFreeCrop() {
    return {
        unit: '%',
        x: 2,
        y: 2,
        width: 96,
        height: 96,
    } satisfies Crop;
}

function toPixelCrop(crop: Crop, mediaWidth: number, mediaHeight: number): PixelCrop {
    if (crop.unit === 'px') {
        return {
            unit: 'px',
            x: crop.x ?? 0,
            y: crop.y ?? 0,
            width: crop.width ?? mediaWidth,
            height: crop.height ?? mediaHeight,
        };
    }

    return {
        unit: 'px',
        x: Math.round(((crop.x ?? 0) / 100) * mediaWidth),
        y: Math.round(((crop.y ?? 0) / 100) * mediaHeight),
        width: Math.round(((crop.width ?? 100) / 100) * mediaWidth),
        height: Math.round(((crop.height ?? 100) / 100) * mediaHeight),
    };
}

interface ImageCropperProps {
    imageSrc: string;
    isOpen: boolean;
    onClose: () => void;
    onCropComplete: (croppedBase64: string, width: number, height: number) => void;
    aspectRatio?: number;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({
    imageSrc,
    isOpen,
    onClose,
    onCropComplete,
    aspectRatio
}) => {
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const imgRef = useRef<HTMLImageElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const hasUserAdjustedCropRef = useRef(false);

    // Reset crop when image changes
    useEffect(() => {
        setCrop(undefined);
        setCompletedCrop(undefined);
        hasUserAdjustedCropRef.current = false;
    }, [imageSrc]);

    function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
        const { width, height } = e.currentTarget;
        const nextCrop =
            typeof aspectRatio === 'number'
                ? centerAspectCrop(width, height, aspectRatio)
                : defaultFreeCrop();

        hasUserAdjustedCropRef.current = false;
        setCrop(nextCrop);
        setCompletedCrop(toPixelCrop(nextCrop, width, height));
    }

    const handleSave = async () => {
        if (!imgRef.current) return;

        setIsLoading(true);
        try {
            if (typeof aspectRatio !== 'number' && !hasUserAdjustedCropRef.current) {
                onCropComplete(imageSrc, imgRef.current.naturalWidth, imgRef.current.naturalHeight);
                setIsLoading(false);
                onClose();
                return;
            }

            if (!completedCrop) {
                setIsLoading(false);
                return;
            }

            const croppedBlob = await canvasPreview(imgRef.current, completedCrop);

            // Calculate actual dimensions
            const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
            const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
            const actualWidth = Math.round(completedCrop.width * scaleX);
            const actualHeight = Math.round(completedCrop.height * scaleY);

            // Convert blob to base64
            const reader = new FileReader();
            reader.readAsDataURL(croppedBlob);
            reader.onloadend = () => {
                const base64data = reader.result as string;
                onCropComplete(base64data, actualWidth, actualHeight);
                setIsLoading(false);
                onClose();
            };
        } catch (e) {
            console.error("Crop failed", e);
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:max-w-xl bg-white text-black p-0 gap-0 overflow-hidden rounded-card max-h-[calc(100dvh-1rem)] grid-rows-[auto_minmax(0,1fr)_auto_auto]">
            <style>{`
                .crop-fit {
                    --rc-drag-handle-size: 14px;
                    --rc-drag-handle-mobile-size: 34px;
                    --rc-drag-bar-size: 18px;
                    --rc-drag-handle-bg-colour: rgba(246, 200, 91, 0.96);
                    --rc-border-color: rgba(255, 255, 255, 0.96);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    max-height: 100%;
                    max-width: 100%;
                }

                .crop-fit .ReactCrop__crop-selection {
                    cursor: grab;
                }

                .crop-fit .ReactCrop__crop-selection:active {
                    cursor: grabbing;
                }

                .crop-fit .ReactCrop__child-wrapper {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100% !important;
                    max-height: 100% !important;
                    width: auto !important;
                    max-width: 100% !important;
                }

                .crop-fit .ReactCrop__child-wrapper > img {
                    display: block;
                    width: auto !important;
                    height: 100% !important;
                    max-width: 100% !important;
                    max-height: 100% !important;
                    object-fit: contain;
                }

                .crop-fit .ReactCrop__drag-handle {
                    border-width: 2px;
                    border-radius: 9999px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
                }

                .crop-fit .ReactCrop__drag-bar {
                    display: block;
                }

                @media (pointer: coarse) {
                    .crop-fit .ReactCrop .ord-n,
                    .crop-fit .ReactCrop .ord-e,
                    .crop-fit .ReactCrop .ord-s,
                    .crop-fit .ReactCrop .ord-w {
                        display: block !important;
                    }
                }
            `}</style>
            <DialogHeader className="px-16 py-4 bg-white border-b border-gray-200">
                <DialogTitle className="text-center text-2xl font-heading font-black text-black">מי הכוכב כאן?</DialogTitle>
                <DialogDescription className="text-center text-base md:text-lg leading-7 text-gray-600">
                    תמרכזו את המסגרת בדיוק על הפנים של מי שיככב בספר
                </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 px-3 py-4 sm:p-4 flex items-center justify-center bg-black overflow-hidden">
                    {imageSrc && (
                        <div className="flex h-[min(46dvh,26rem)] w-full max-w-full items-center justify-center overflow-hidden bg-black sm:h-[min(52dvh,32rem)]">
                            <ReactCrop
                                className="crop-fit"
                                crop={crop}
                                onChange={(_, percentCrop) => {
                                    hasUserAdjustedCropRef.current = true;
                                    setCrop(percentCrop);
                                }}
                                onComplete={(c) => setCompletedCrop(c)}
                                aspect={aspectRatio}
                                circularCrop={false}
                                keepSelection
                                style={{ height: '100%', maxHeight: '100%', maxWidth: '100%' }}
                            >
                                <img
                                    ref={imgRef}
                                    alt="Crop me"
                                    src={imageSrc}
                                    onLoad={onImageLoad}
                                    className="block h-auto max-h-full w-auto max-w-full object-contain"
                                    style={{ maxHeight: '100%', maxWidth: '100%' }}
                                />
                            </ReactCrop>
                        </div>
                    )}
                </div>

                <DialogFooter className="p-4 border-t border-gray-200 gap-2 flex-row-reverse sm:justify-start">
                    <Button
                        onClick={handleSave}
                        disabled={!completedCrop || isLoading}
                        className="bg-[#f6c85b] text-black hover:bg-[#e6b84b] font-bold rounded-full px-8"
                    >
                        {isLoading ? 'מעבד...' : 'שמור וחתוך'}
                    </Button>
                    <Button variant="ghost" onClick={onClose} className="rounded-full">
                        ביטול
                    </Button>
                </DialogFooter>

                {completedCrop && imgRef.current && (
                    <div className="bg-[#fff9eb] p-2 text-center text-xs text-black border-t border-[#f6c85b]">
                        {/* Pixel count hidden as per request */}
                        {(completedCrop.width * (imgRef.current.naturalWidth / imgRef.current.width) < 300 || completedCrop.height * (imgRef.current.naturalHeight / imgRef.current.height) < 300) && (
                            <span className="block font-bold text-black mt-1">זהירות: האיזור שבחרת קטן מאוד ועלול לצאת מטושטש</span>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
