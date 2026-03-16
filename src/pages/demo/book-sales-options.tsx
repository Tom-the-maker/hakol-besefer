import React, { useMemo, useState } from 'react';
import { ArtStyle, Story, UserInputs } from '../../types';
import { demoStory } from '../../data/demoStory';
import BookSalesPageOptionA from '../../components/BookSalesPageOptionA';
import BookSalesPageOptionB from '../../components/BookSalesPageOptionB';
import BookSalesPageOptionC from '../../components/BookSalesPageOptionC';

type OptionKey = 'option-a' | 'option-b' | 'option-c';

export default function BookSalesOptionsDemo() {
  const [active, setActive] = useState<OptionKey>('option-a');
  const [unlockClicks, setUnlockClicks] = useState(0);

  const previewStory: Story = useMemo(() => ({ ...demoStory, is_unlocked: false }), []);
  const demoInputs: UserInputs = useMemo(
    () => ({
      childName: previewStory.heroName,
      topic: 'הרפתקה עירונית',
      artStyle: ArtStyle.Pixar,
      age: 7,
      gender: 'girl',
    }),
    [previewStory.heroName]
  );

  const onUnlock = () => setUnlockClicks((n) => n + 1);
  const onSave = () => window.alert('Demo only: save action triggered');

  return (
    <div>
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] bg-white/95 backdrop-blur border border-gray-200 rounded-full px-3 py-2 shadow-lg flex items-center gap-2" dir="rtl">
        <button
          onClick={() => setActive('option-a')}
          className={`h-9 px-4 rounded-full text-sm font-bold ${active === 'option-a' ? 'bg-[#f6c85b] text-black' : 'bg-[#F4F5F7] text-black'}`}
        >
          Option A
        </button>
        <button
          onClick={() => setActive('option-b')}
          className={`h-9 px-4 rounded-full text-sm font-bold ${active === 'option-b' ? 'bg-[#3c70b2] text-white' : 'bg-[#F4F5F7] text-black'}`}
        >
          Option B
        </button>
        <button
          onClick={() => setActive('option-c')}
          className={`h-9 px-4 rounded-full text-sm font-bold ${active === 'option-c' ? 'bg-black text-white' : 'bg-[#F4F5F7] text-black'}`}
        >
          Option C
        </button>
        <span className="text-xs text-black/60 px-1">Unlock clicks: {unlockClicks}</span>
      </div>

      {active === 'option-a' ? (
        <BookSalesPageOptionA story={previewStory} inputs={demoInputs} onUnlock={onUnlock} onSave={onSave} />
      ) : active === 'option-b' ? (
        <BookSalesPageOptionB story={previewStory} inputs={demoInputs} onUnlock={onUnlock} onSave={onSave} />
      ) : (
        <BookSalesPageOptionC story={previewStory} inputs={demoInputs} onUnlock={onUnlock} onSave={onSave} />
      )}
    </div>
  );
}
