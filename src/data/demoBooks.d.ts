export interface DemoBook {
    id: string;
    slug: string;
    title: string;
    description: string;
    image_url: string;
    created_at?: string;
}
export declare const demoBooks: DemoBook[];
