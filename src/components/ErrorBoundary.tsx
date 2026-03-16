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

export const ErrorFallbackView: React.FC<ErrorFallbackViewProps> = ({
  message = 'קרתה שגיאה בלתי צפויה. אל דאגה, המידע שלכם לא נמחק.',
  details,
  onReset,
  compact = false,
}) => (
  <div className={`min-h-screen flex items-center justify-center bg-[#F4F5F7] p-6 ${compact ? 'min-h-0 bg-transparent p-0' : ''}`} dir="rtl">
    <div className="relative max-w-md w-full bg-white rounded-3xl border border-[#f6c85b] p-8 text-center space-y-6">
      <button
        type="button"
        onClick={onReset}
        className="absolute top-4 left-4 w-10 h-10 rounded-full border border-gray-200 text-black/60 hover:text-black hover:border-[#f6c85b] transition-all"
        aria-label="סגירה"
      >
        ×
      </button>
      <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-4xl mx-auto">
        😵
      </div>
      <h2 className="text-2xl font-heading font-black text-black">
        אופס, משהו השתבש
      </h2>
      <p className="text-black font-normal leading-relaxed">
        {message}
      </p>
      {details && (
        <details className="text-xs text-black/60 text-left bg-[#F4F5F7] p-3 rounded-xl border border-gray-200">
          <summary className="cursor-pointer text-right font-bold">פרטי השגיאה</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words">
            {details}
          </pre>
        </details>
      )}
      <button
        onClick={onReset}
        className="w-full py-4 bg-[#F9C922] hover:bg-[#f6c85b] text-black font-heading font-black text-lg rounded-full transition-all"
      >
        חזרה לדף הבית
      </button>
    </div>
  </div>
);

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
      return this.props.fallback;
      }

      return (
        <ErrorFallbackView
          message="קרתה שגיאה בלתי צפויה. אל דאגה, המידע שלכם לא נמחק."
          details={this.state.error?.message}
          onReset={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
