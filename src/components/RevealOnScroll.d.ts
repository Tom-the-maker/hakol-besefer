import React, { ReactNode } from 'react';
interface RevealOnScrollProps {
    children: ReactNode;
    className?: string;
    delayMs?: number;
    eager?: boolean;
}
declare const RevealOnScroll: React.FC<RevealOnScrollProps>;
export default RevealOnScroll;
