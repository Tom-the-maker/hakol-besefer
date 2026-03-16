import React from 'react';

interface LogoProps {
  className?: string;
  onClick?: () => void;
  textClassName?: string;
  imageClassName?: string;
  src?: string;
}

const Logo = ({ className = "", onClick, textClassName = "", imageClassName = "", src = "/logo/Logo_Wide.png" }: LogoProps) => {
  const logoSizeClass = imageClassName.trim().length > 0 ? imageClassName : 'h-6 md:h-10';

  return (
    <div
      onClick={onClick}
      className={`flex items-center ${className}`}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <img
        src={src}
        alt="סוףסיפור"
        className={`w-auto h-auto object-contain shrink-0 ${textClassName} ${logoSizeClass}`}
      />
    </div>
  );
};

export default Logo;
