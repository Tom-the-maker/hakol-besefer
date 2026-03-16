
import React from 'react';
import { Camera, Shield } from 'lucide-react';

interface UploaderProps {
    label: string;
    subLabel: string;
    onFileSelect: (file: File) => void;
}

import { compressImage, dataURLtoFile } from '../../lib/imageUtils';

export const Uploader: React.FC<UploaderProps> = ({ label, subLabel, onFileSelect }) => {
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [consent, setConsent] = React.useState(false);
    const inputId = React.useId();

    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const originalFile = e.target.files[0];
            setIsProcessing(true);

            try {
                const compressedDataUrl = await compressImage(originalFile, 1500, 0.8);
                const compressedFile = dataURLtoFile(compressedDataUrl, originalFile.name);
                onFileSelect(compressedFile);
            } catch (error) {
                console.error("Compression failed, using original:", error);
                onFileSelect(originalFile);
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const handleUploadClick = (e: React.MouseEvent<HTMLLabelElement>) => {
        if (!consent || isProcessing) {
            e.preventDefault();
        }
    };

    return (
        <div className="space-y-3 w-full">
            <input
                id={inputId}
                type="file"
                className="sr-only"
                accept="image/*"
                onChange={handleChange}
                disabled={isProcessing || !consent}
            />
            <label
                htmlFor={inputId}
                onClick={handleUploadClick}
                className={`flex items-center justify-center gap-4 p-8 bg-white hover:bg-gray-50 rounded-3xl transition-all border-2 border-dashed group w-full ${
                    !consent
                        ? 'border-gray-200 opacity-60 cursor-not-allowed'
                        : isProcessing
                            ? 'border-gray-300 opacity-50 pointer-events-none'
                            : 'border-gray-300 hover:border-[#f6c85b] cursor-pointer'
                }`}
            >
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-[#f6c85b]/20 transition-colors">
                    {isProcessing ? (
                        <div className="w-8 h-8 border-4 border-gray-300 border-t-[#f6c85b] rounded-full animate-spin" />
                    ) : (
                        <Camera size={32} className="text-black group-hover:text-black transition-colors" />
                    )}
                </div>
                <div className="text-right">
                    <div className="font-heading font-black text-lg text-black" style={{ color: '#000000' }}>
                        {isProcessing ? 'מעבד תמונה...' : label}
                    </div>
                    <div className="text-sm font-normal text-black" style={{ color: '#000000' }}>{subLabel}</div>
                </div>
            </label>

            {/* Privacy consent */}
            <label className="flex items-start gap-3 cursor-pointer px-1" dir="rtl">
                <div className="relative mt-0.5 shrink-0">
                    <input
                        type="checkbox"
                        checked={consent}
                        onChange={e => setConsent(e.target.checked)}
                        className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center ${
                        consent ? 'bg-[#f6c85b] border-[#f6c85b]' : 'bg-white border-gray-300'
                    }`}>
                        {consent && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6L5 9L10 3" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        )}
                    </div>
                </div>
                <div className="flex items-start gap-1.5">
                    <Shield size={14} className="text-[#4b947d] mt-0.5 shrink-0" />
                    <span className="text-xs text-black/60 leading-relaxed font-normal">
                        אני מאשר/ת שיש לי הרשאה להעלות את התמונה. התמונה תישלח לשירות AI חיצוני לצורך יצירת האיורים בלבד. התמונה המקורית לא נשמרת במערכת שלנו.{' '}
                        <a href="/privacy" className="underline text-black/70 hover:text-black">מדיניות פרטיות</a>
                    </span>
                </div>
            </label>
        </div>
    );
};
