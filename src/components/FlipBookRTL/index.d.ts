import React from "react";
import "./FlipBook.css";
export type Spread = {
    imageUrl: string;
    text: string;
};
export type FlipBookRTLProps = {
    width: number;
    height: number;
    coverFront: {
        imageUrl: string;
    };
    coverBack: {
        imageUrl?: string;
        backText?: string;
    };
    spreads: Spread[];
    startClosed?: boolean;
    onOpen?: () => void;
    onClose?: (side: "front" | "back") => void;
    className?: string;
};
export declare const FlipBookRTL: React.FC<FlipBookRTLProps>;
export default FlipBookRTL;
