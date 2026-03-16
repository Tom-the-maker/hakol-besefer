// components/MainContainer.tsx
import { ReactNode } from 'react';

interface MainContainerProps {
  children: ReactNode;
  className?: string;
}

export default function MainContainer({ children, className = '' }: MainContainerProps) {
  return (
    <div className={`mx-auto max-w-[1300px] px-4 sm:px-6 md:px-8 ${className}`}>
      {children}
    </div>
  );
}
