import React from 'react';
import { Story, UserInputs } from '../types';
interface BookEditorViewProps {
    story: Story;
    inputs: UserInputs;
    devPopup?: string | null;
}
declare const BookEditorView: React.FC<BookEditorViewProps>;
export default BookEditorView;
