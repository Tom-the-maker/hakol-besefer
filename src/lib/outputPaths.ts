// Utility functions for managing generated files output paths
// Note: In browser environment, files are downloaded to user's default download folder
// These paths are used for consistent file naming conventions

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
export function getPDFFileName(storyTitle: string): string {
  const sanitizedTitle = storyTitle
    .replace(/[^a-zA-Z0-9\u0590-\u05FF\s]/g, '') // Remove special chars, keep Hebrew/English
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .trim();
  
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const time = new Date().toTimeString().slice(0, 8).replace(/:/g, ''); // HHMMSS
  
  return `${sanitizedTitle || 'סיפור_קסום'}_${timestamp}_${time}.pdf`;
}

/**
 * Generates a standardized filename for image output
 * @param prefix - Prefix for the filename (e.g., 'scene', 'cover', 'page')
 * @param index - Optional index number
 * @returns Formatted filename with timestamp
 */
export function getImageFileName(prefix: string, index?: number): string {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const time = new Date().toTimeString().slice(0, 8).replace(/:/g, ''); // HHMMSS
  const indexStr = index !== undefined ? `_${String(index + 1).padStart(2, '0')}` : '';
  
  return `${prefix}${indexStr}_${timestamp}_${time}.png`;
}

/**
 * Gets the virtual folder path for organizing outputs
 * Used for logging and organization purposes
 */
export function getOutputFolder(folder: 'pdf' | 'images'): string {
  return `generated/${folder}`;
}
