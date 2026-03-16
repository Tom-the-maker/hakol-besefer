import React from 'react';
import { InspirationExample } from '../data/inspirationCategories';
interface CategoryGalleryPageProps {
    categoryId: string;
    onBack: () => void;
    onExampleClick: (example: InspirationExample) => void;
}
declare const CategoryGalleryPage: React.FC<CategoryGalleryPageProps>;
export default CategoryGalleryPage;
