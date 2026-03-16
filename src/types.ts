

export enum ArtStyle {
  Pixar = "3D Pixar Style",
  Watercolor = "Watercolor Illustration",
  Comic = "Comic Book",
  Pencil = "Detailed Pencil Sketch",
  Dreamy = "Dreamy Oil Painting",
  Anime = "Japanese Anime Style",
  Claymation = "Claymation / Stop Motion Style",
  DisneyClassic = "Classic Hand-Drawn Disney Style",
  Cyberpunk = "Cyberpunk / Neon Glow Style"
}

export interface UserInputs {
  childName: string;
  age?: number;
  gender?: 'boy' | 'girl';
  vibe?: 'KIDS' | 'ADULTS';
  topic: string;
  artStyle: ArtStyle;
  title?: string; // User-confirmed book title
  characterImage?: string;
  parentImage?: string;
  // Display label shown in UI/summary (e.g. "אבא", "רותם", "חבר/ה")
  parentCharacter?: 'father' | 'mother' | 'grandmother' | 'partner' | 'friend' | 'child' | string;
  // Canonical role for prompt/control logic (kept separate from display label)
  parentCharacterRole?: 'father' | 'mother' | 'grandmother' | 'partner' | 'friend' | 'child' | 'pet' | 'other' | string;
  parentName?: string;
  parentGender?: 'male' | 'female';
  parentAge?: number;
  thirdCharacterImage?: string;
  // Display label shown in UI/summary (e.g. "סבא", "כלב", "נועה")
  thirdCharacter?: 'father' | 'mother' | 'grandmother' | 'pet' | string;
  // Canonical role for prompt/control logic
  thirdCharacterRole?: 'father' | 'mother' | 'grandmother' | 'grandfather' | 'brother' | 'sister' | 'partner' | 'friend' | 'child' | 'pet' | 'other' | string;
  dedication?: string; // Personal dedication text for the first page
  email?: string; // Captured in chat for "book ready" notification
  isGift?: boolean; // Whether this book is a gift
  giftRecipientEmail?: string; // If gift, send to this email
}

export type AppPhase = 'landing' | 'chat' | 'thinking' | 'title_confirm' | 'teaser' | 'register' | 'payment' | 'view' | 'test' | 'gallery' | 'my-books' | 'terms' | 'privacy' | 'contact' | 'accessibility' | 'cancellation' | 'not-found';

export type ChatStep =
  | 'ONBOARDING'
  | 'NAME'
  | 'NAME_CONFIRM'
  | 'GENDER'
  | 'AGE'
  | 'PHOTO_VALIDATION'
  | 'TOPIC'
  | 'ADDITIONAL_CHARACTERS'
  | 'GET_CHAR_DETAILS'
  | 'PARENT_PHOTO'
  | 'THIRD_CHOICE'
  | 'THIRD_PHOTO'
  | 'STYLE'
  | 'DEDICATION'
  | 'CONFIRMATION'
  | 'PHOTO_REPLACE_CLARIFY'
  | 'CROP_QUALITY_CONFIRM'
  | 'CROP_RETRY_CONFIRM'
  | 'EMAIL'
  | 'COMPLETED';

export interface ChatMessage {
  id: string;
  sender: 'agent' | 'user';
  text: string;
  type: 'text' | 'image_request' | 'topic_request' | 'name_request' | 'style_request' | 'parent_request' | 'title_confirmation' | 'image' | 'multi-image' | 'choice';
  isBlue?: boolean;
  imageUrl?: string;
  imageUrls?: string[]; // For side-by-side display
}

export interface Story {
  title: string;
  heroName: string;
  segments: string[];
  composite_image_url: string;
  display_image_url?: string;
  source_image_url?: string;
  is_unlocked: boolean;
}
