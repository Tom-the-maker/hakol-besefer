import { PixelCrop } from 'react-image-crop';
/**
 * Compresses and resizes an image file in the browser.
 * Maintains aspect ratio while ensuring max dimensions are not exceeded.
 * Returns a Data URL string optimized for sending to APIs.
 *
 * @param file The original File object from input
 * @param maxWidthOrHeight The maximum dimension (width or height)
 * @param quality JPEG quality (0 to 1)
 */
export declare const compressImage: (file: File, maxWidthOrHeight?: number, // Increased from 1500 to allow high-res cropping for external AI processing
quality?: number) => Promise<string>;
/**
 * Helper to convert Data URL back to a File object if needed API-side
 * (though usually we send Base64 string directly)
 */
export declare const dataURLtoFile: (dataurl: string, filename: string) => File;
export declare function canvasPreview(image: HTMLImageElement, crop: PixelCrop, scale?: number, rotate?: number): Promise<Blob>;
