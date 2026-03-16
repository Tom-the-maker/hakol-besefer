// Demo books data for presentation purposes
// This is used when Supabase is not available

export interface DemoBook {
  id: string;
  slug: string;
  title: string;
  description: string;
  image_url: string;
  created_at?: string;
}

export const demoBooks: DemoBook[] = [
  {
    id: '1',
    slug: 'bike',
    title: 'Bike',
    description: 'A boy who is always with his bike',
    image_url: '/placeholder.svg',
  },
  {
    id: '2',
    slug: 'baby-yoga',
    title: 'Baby Yoga',
    description: 'Learn yoga and animals',
    image_url: '/placeholder.svg',
  },
  {
    id: '3',
    slug: 'nogas-trip-to-space',
    title: 'Noga\'s Trip to Space',
    description: 'This is not a space book',
    image_url: '/placeholder.svg',
  },
  {
    id: '4',
    slug: 'leo-dino',
    title: 'Leo & Dino',
    description: 'An adventure with Leo and Dino',
    image_url: '/placeholder.svg',
  },
];

