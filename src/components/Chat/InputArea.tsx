
import React, { useRef, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { designSystem } from '../../lib/designSystem';

interface InputAreaProps {
    placeholder: string;
    onSubmit: (value: string) => void;
    autoFocus?: boolean;
    dir?: 'rtl' | 'ltr' | 'auto';
    type?: React.HTMLInputTypeAttribute;
    inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
    autoComplete?: string;
    autoCapitalize?: string;
    spellCheck?: boolean;
    enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';
    textAlign?: 'right' | 'left' | 'center';
}

export const InputArea: React.FC<InputAreaProps> = ({
    placeholder,
    onSubmit,
    autoFocus = false,
    dir = 'rtl',
    type = 'text',
    inputMode,
    autoComplete = 'off',
    autoCapitalize = 'sentences',
    spellCheck = false,
    enterKeyHint = 'done',
    textAlign = 'right'
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
        }
    }, [autoFocus]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputRef.current?.value.trim()) {
            onSubmit(inputRef.current.value);
            inputRef.current.value = '';
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex gap-2 w-full items-center">
            <input
                ref={inputRef}
                type={type}
                data-track-id="chat-input-field"
                placeholder={placeholder}
                className="flex-1 bg-white border border-gray-300 rounded-full px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#f6c85b]/50"
                autoComplete={autoComplete}
                autoCapitalize={autoCapitalize}
                spellCheck={spellCheck}
                enterKeyHint={enterKeyHint}
                inputMode={inputMode}
                dir={dir}
                style={{
                    fontSize: '19px',
                    transform: 'scale(1)',
                    WebkitAppearance: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
                    color: '#000000',
                    textAlign
                }}
            />
            <button
                type="submit"
                data-track-id="chat-input-submit"
                className="bg-[#f6c85b] hover:bg-[#f6c85b]/90 w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full shrink-0 transition-colors"
                style={{ color: '#000000' }}
            >
                <ArrowUp size={20} className="text-black" />
            </button>
        </form>
    );
};
