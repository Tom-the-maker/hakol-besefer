import React from 'react';
import { ChevronRight } from 'lucide-react';
import { inspirationCategories, InspirationExample } from '../data/inspirationCategories';
import { InspirationBookCard } from './InspirationBookCard';
import MainContainer from './MainContainer';

interface CategoryGalleryPageProps {
    categoryId: string;
    onBack: () => void;
    onExampleClick: (example: InspirationExample) => void;
}

const CategoryGalleryPage: React.FC<CategoryGalleryPageProps> = ({ categoryId, onBack, onExampleClick }) => {
    const category = inspirationCategories[categoryId];

    if (!category) {
        return <div>Category not found</div>;
    }

    return (
        <div className="bg-white">
            <MainContainer>
                <div className="pt-24 md:pt-32 pb-10 md:pb-14">
                    <button
                        onClick={onBack}
                        className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-gray-200 bg-white text-black font-bold hover:border-[#f6c85b] transition-colors"
                        style={{ color: '#000000' }}
                    >
                        <ChevronRight className="w-4 h-4" />
                        חזרה לדף הבית
                    </button>

                    <div className="text-center mt-6 md:mt-8">
                        <h1 className="font-heading font-extrabold text-black text-2xl sm:text-3xl md:text-5xl leading-tight px-2 mb-3" style={{ color: '#000000' }}>
                            {category.title}
                        </h1>
                        <p className="font-normal text-black text-sm md:text-base leading-relaxed max-w-3xl mx-auto px-2" style={{ color: '#000000' }}>
                            {category.subtitle}
                        </p>
                    </div>
                </div>

                <div className="pb-20 md:pb-24">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                        {category.examples.map((example) => (
                            <div key={example.id} className="h-full">
                                <InspirationBookCard
                                    example={example}
                                    onClick={() => onExampleClick(example)}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </MainContainer>
        </div>
    );
};

export default CategoryGalleryPage;
