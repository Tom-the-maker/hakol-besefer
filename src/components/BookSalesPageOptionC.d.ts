import React from 'react';
import { Story, UserInputs } from '../types';
interface BookSalesPageOptionProps {
    story: Story;
    inputs: UserInputs;
    onUnlock: () => void;
    onSave: () => void;
}
declare const BookSalesPageOptionC: React.FC<BookSalesPageOptionProps>;
export default BookSalesPageOptionC;
