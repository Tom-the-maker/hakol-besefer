import React from 'react';
import { UserInputs } from '../types';
interface ChatInterfaceProps {
    onComplete: (inputs: UserInputs) => void;
    initialValues?: Partial<UserInputs>;
    onBack?: () => void;
}
declare const ChatInterface: React.FC<ChatInterfaceProps>;
export default ChatInterface;
