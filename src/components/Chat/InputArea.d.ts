import React from 'react';
interface InputAreaProps {
    placeholder: string;
    onSubmit: (value: string) => void;
    autoFocus?: boolean;
}
export declare const InputArea: React.FC<InputAreaProps>;
export {};
