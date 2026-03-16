import React from 'react';
import { ChatMessage } from '../../types';
interface MessageListProps {
    messages: ChatMessage[];
    isTyping: boolean;
}
export declare const MessageList: React.FC<MessageListProps>;
export {};
