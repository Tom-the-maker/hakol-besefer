import React from 'react';
import { InspirationExample } from '../data/inspirationCategories';
interface InspirationBookCardProps {
    example: InspirationExample;
    onClick: (example: InspirationExample) => void;
}
export declare const InspirationBookCard: React.FC<InspirationBookCardProps>;
export {};
