import React from 'react';
interface MyBooksProps {
    onBookClick: (slug: string) => void;
    onBack: () => void;
    onLoginClick?: () => void;
}
declare const MyBooks: React.FC<MyBooksProps>;
export default MyBooks;
