import React from 'react';
import { InspirationExample } from '../data/inspirationCategories';

interface InspirationBookCardProps {
    example: InspirationExample;
    onClick: (example: InspirationExample) => void;
}

export const InspirationBookCard: React.FC<InspirationBookCardProps> = ({ example, onClick }) => {
    return (
        <div
            className="group bg-white rounded-2xl overflow-hidden border border-gray-200 transition-all duration-300 hover:-translate-y-0.5 cursor-pointer flex flex-col h-full"
            onClick={() => onClick(example)}
            style={{ color: '#000000' }}
        >
            {/* Cover Image */}
            <div className="relative aspect-square overflow-hidden bg-gray-100">
                <img
                    src={example.coverImage}
                    alt={example.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />

                {/* Style Badge */}
                <div className="absolute top-4 right-4">
                    <span className="inline-block px-3 py-1 bg-white/95 border border-gray-200 text-black rounded-full text-xs font-bold">
                        {example.artStyle.split(' ')[0]}
                    </span>
                </div>
            </div>

            {/* Content */}
            <div className="p-6 flex flex-col flex-grow">
                <h3 className="font-heading font-black text-black text-xl md:text-2xl mb-3 leading-tight" style={{ color: '#000000' }}>
                    {example.title}
                </h3>

                <div className="bg-[#F4F5F7] rounded-xl p-4 mb-4 flex-grow border border-gray-200">
                    <p className="text-xs font-bold mb-1" style={{ color: '#000000' }}>ביקשו:</p>
                    <p
                        className="font-normal text-sm md:text-base leading-relaxed line-clamp-3"
                        style={{ color: '#000000', WebkitTextFillColor: '#000000', opacity: 1 }}
                    >
                        "{example.prompt}"
                    </p>
                </div>

                <div className="mt-auto pt-2">
                    <button
                        className="w-full h-11 rounded-full text-sm font-bold bg-[#f6c85b] border border-[#f6c85b] text-black hover:bg-[#e6b84b] transition-all duration-200"
                    >
                        דפדף בספר
                    </button>
                </div>
            </div>
        </div>
    );
};
