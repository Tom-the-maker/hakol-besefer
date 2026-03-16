import React from 'react';
import { Story, UserInputs, ArtStyle } from '../../types';
import { demoStory } from '../../data/demoStory';
import BookSalesPage from '../../components/BookSalesPage';

const demoInputs: UserInputs = {
  childName: demoStory.heroName || 'הילד/ה',
  topic: 'הרפתקה קסומה',
  artStyle: ArtStyle.Pixar,
  age: 7,
  gender: 'girl',
};

export default function BookSalesContextDemo() {
  const stateParam =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('state')
      : null;
  const isUnlockedPreview = stateParam === 'unlocked';

  const story: Story = {
    ...demoStory,
    is_unlocked: isUnlockedPreview,
  };

    return (
    <BookSalesPage
      story={story}
      inputs={demoInputs}
      onUnlock={() => window.alert('Demo: unlock clicked')}
      onSave={() => window.alert('Demo: save clicked')}
    />
  );
}
