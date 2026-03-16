import React from 'react';
import { Story, UserInputs } from '../types';
interface BookSalesPageProps {
    story: Story;
    inputs: UserInputs;
    onUnlock: () => void;
    onSave: () => void;
}
declare const BookSalesPage: React.FC<BookSalesPageProps>;
export default BookSalesPage;
