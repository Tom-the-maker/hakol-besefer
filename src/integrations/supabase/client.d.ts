import type { Database } from './types';
export declare const supabase: import("@supabase/supabase-js").SupabaseClient<Database, "public", "public", {
    Tables: {
        admins: {
            Row: {
                created_at: string;
                id: string;
            };
            Insert: {
                created_at?: string;
                id: string;
            };
            Update: {
                created_at?: string;
                id?: string;
            };
            Relationships: [];
        };
        books: {
            Row: {
                child_age: number | null;
                child_gender: string | null;
                child_name: string;
                cover_url: string | null;
                created_at: string;
                display_order: number | null;
                id: string;
                photo_url: string | null;
                preview_pages: import("./types").Json | null;
                status: string | null;
                story_id: number;
                title: string;
                updated_at: string;
                user_id: string | null;
            };
            Insert: {
                child_age?: number | null;
                child_gender?: string | null;
                child_name: string;
                cover_url?: string | null;
                created_at?: string;
                display_order?: number | null;
                id?: string;
                photo_url?: string | null;
                preview_pages?: import("./types").Json | null;
                status?: string | null;
                story_id: number;
                title: string;
                updated_at?: string;
                user_id?: string | null;
            };
            Update: {
                child_age?: number | null;
                child_gender?: string | null;
                child_name?: string;
                cover_url?: string | null;
                created_at?: string;
                display_order?: number | null;
                id?: string;
                photo_url?: string | null;
                preview_pages?: import("./types").Json | null;
                status?: string | null;
                story_id?: number;
                title?: string;
                updated_at?: string;
                user_id?: string | null;
            };
            Relationships: [];
        };
        stories: {
            Row: {
                background_color: string;
                created_at: string;
                description: string;
                id: number;
                image_url: string;
                slug: string;
                title: string;
                updated_at: string;
            };
            Insert: {
                background_color?: string;
                created_at?: string;
                description: string;
                id?: number;
                image_url: string;
                slug: string;
                title: string;
                updated_at?: string;
            };
            Update: {
                background_color?: string;
                created_at?: string;
                description?: string;
                id?: number;
                image_url?: string;
                slug?: string;
                title?: string;
                updated_at?: string;
            };
            Relationships: [];
        };
        orders: {
            Row: {
                id: string;
                book_id: string | null;
                email: string;
                child_name: string;
                is_paid: boolean;
                pdf_url: string | null;
                created_at: string;
            };
            Insert: {
                id?: string;
                book_id?: string | null;
                email: string;
                child_name: string;
                is_paid?: boolean;
                pdf_url?: string | null;
                created_at?: string;
            };
            Update: {
                id?: string;
                book_id?: string | null;
                email?: string;
                child_name?: string;
                is_paid?: boolean;
                pdf_url?: string | null;
                created_at?: string;
            };
            Relationships: [];
        };
    };
    Views: { [_ in never]: never; };
    Functions: { [_ in never]: never; };
    Enums: { [_ in never]: never; };
    CompositeTypes: { [_ in never]: never; };
}, {
    PostgrestVersion: "12";
}>;
