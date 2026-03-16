export interface OutputFileConfig {
    fileName: string;
    timestamp: string;
    folder: 'pdf' | 'images';
}
/**
 * Generates a standardized filename for PDF output
 * @param storyTitle - The title of the story/book
 * @returns Formatted filename with timestamp
 */
export declare function getPDFFileName(storyTitle: string): string;
/**
 * Generates a standardized filename for image output
 * @param prefix - Prefix for the filename (e.g., 'scene', 'cover', 'page')
 * @param index - Optional index number
 * @returns Formatted filename with timestamp
 */
export declare function getImageFileName(prefix: string, index?: number): string;
/**
 * Gets the virtual folder path for organizing outputs
 * Used for logging and organization purposes
 */
export declare function getOutputFolder(folder: 'pdf' | 'images'): string;
