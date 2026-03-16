import React from 'react';
interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}
declare const AuthModal: React.FC<AuthModalProps>;
export declare const UserMenu: React.FC<{
    onMyBooks: () => void;
}>;
export default AuthModal;
