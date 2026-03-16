import { ArtStyle } from '../types';
export interface InspirationExample {
    id: string;
    title: string;
    prompt: string;
    artStyle: ArtStyle;
    coverImage: string;
    storyId?: string;
}
export interface InspirationCategory {
    id: string;
    title: string;
    subtitle: string;
    ctaText: string;
    examples: InspirationExample[];
}
export declare const inspirationCategories: Record<string, InspirationCategory>;
