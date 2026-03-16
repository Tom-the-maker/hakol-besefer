import React from 'react';
interface HeroProps {
    onStart: (initialTopic?: string) => void;
    inputValue: string;
    onInputChange: (value: string) => void;
}
declare const Hero: React.FC<HeroProps>;
export default Hero;
