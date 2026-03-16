import { Story, UserInputs } from '../types';
export interface BookRecord {
    id: string;
    slug: string;
    created_at: string;
    title: string;
    hero_name: string;
    segments: string[];
    segment_count?: number;
    composite_image_url: string;
    is_unlocked: boolean;
    payment_status: 'pending' | 'paid' | 'free';
    email?: string;
    access_token?: string;
    child_name?: string;
    age?: number;
    gender?: string;
    topic?: string;
    art_style?: string;
    metadata?: Record<string, unknown>;
}
export interface BookGenerationArtifacts {
    created_at: string;
    story?: {
        model: string;
        usage?: {
            input?: number;
            output?: number;
        };
        prompt_token?: string;
        request_json?: Record<string, unknown>;
        response_json?: Record<string, unknown>;
    };
    image?: {
        model?: string;
        usage?: {
            input?: number;
            output?: number;
        };
        image_resolution?: string | null;
        prompt_token?: string;
        request_json?: Record<string, unknown>;
        response_json?: Record<string, unknown>;
        mock?: boolean;
        mock_reason?: string;
    };
}
export interface SaveBookOptions {
    generationArtifacts?: BookGenerationArtifacts;
}
interface UploadedAsset {
    path: string;
    url: string;
}
export declare function saveBookOwnership(slug: string, token: string): void;
export declare function getBookToken(slug: string): string | null;
export declare function getOwnedBooks(): Record<string, {
    token: string;
    savedAt: number;
}>;
export declare function getOwnedBookSlugs(): string[];
export declare function removeBookOwnership(slug: string): void;
export declare function removeBookStorageAssets(paths: string[]): Promise<void>;
export declare function uploadBookPdf(slug: string, pdfBlob: Blob, fileName: string): Promise<UploadedAsset | null>;
export declare function appendBookPdfArtifact(slug: string, asset: UploadedAsset, fileName: string, sizeBytes: number): Promise<boolean>;
export declare function saveBook(story: Story, inputs: UserInputs, sessionId: string, options?: SaveBookOptions): Promise<BookRecord | null>;
export declare function loadBookBySlug(slug: string): Promise<BookRecord | null>;
export declare function updateBookEmail(slug: string, email: string): Promise<boolean>;
export declare function bookRecordToStory(book: BookRecord): Story;
export declare function resolveBookCardImageUrl(book: BookRecord): string;
export {};
