import React, { Component, ErrorInfo, ReactNode } from 'react';
interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}
interface State {
    hasError: boolean;
    error: Error | null;
}
interface ErrorFallbackViewProps {
    message?: string;
    details?: string;
    onReset?: () => void;
    compact?: boolean;
}
export declare const ErrorFallbackView: React.FC<ErrorFallbackViewProps>;
declare class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props);
    static getDerivedStateFromError(error: Error): State;
    componentDidCatch(error: Error, errorInfo: ErrorInfo): void;
    handleReset: () => void;
    render(): string | number | boolean | import("react/jsx-runtime").JSX.Element | Iterable<React.ReactNode>;
}
export default ErrorBoundary;
