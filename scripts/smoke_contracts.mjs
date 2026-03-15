import assert from 'node:assert/strict';
import {
  FORBIDDEN_BOOK_METADATA_KEYS,
  createBookSchema,
  hasForbiddenKeys,
  serializeBookDetail,
  serializeDashboardBookSummary,
  serializeLibraryBookSummary,
} from '../server/lib/books.js';

function createFakeSupabase() {
  return {
    storage: {
      from(bucket) {
        return {
          getPublicUrl(path) {
            return {
              data: {
                publicUrl: `https://assets.example/${bucket}/${path}`,
              },
            };
          },
          async createSignedUrl(path) {
            return {
              data: {
                signedUrl: `https://signed.example/${bucket}/${path}`,
              },
            };
          },
        };
      },
    },
  };
}

async function run() {
  const supabase = createFakeSupabase();
  const baseBook = {
    id: 'book-1',
    slug: 'hakol-book-1',
    session_id: 'session-1',
    created_at: '2026-03-16T00:00:00.000Z',
    updated_at: '2026-03-16T00:00:00.000Z',
    title: 'המסע של נעם',
    hero_name: 'נעם',
    hero_age: 8,
    hero_gender: 'male',
    topic: 'אומץ',
    art_style: 'watercolor',
    parent_character: null,
    parent_name: null,
    source_image_path: 'hakol-book-1/source/scene-source-a1.png',
    display_image_path: 'hakol-book-1/display/scene-display-a1.jpg',
    thumb_image_path: 'hakol-book-1/thumb/scene-thumb-a1.jpg',
    story_segments: Array.from({ length: 10 }, (_, index) => `segment-${index + 1}`),
    preview_excerpt: 'קטע קצר למסכי רשימות',
    is_unlocked: false,
    payment_status: 'pending',
    email: 'reader@example.com',
    user_id: '7ceebc9a-f0bc-4baf-b6f4-b2a3f63eb0ca',
    access_token_hash: 'hash',
    latest_pdf_path: 'hakol-book-1/pdf/book-1.pdf',
    latest_pdf_file_name: 'book-1.pdf',
    latest_pdf_size_bytes: 1234,
    latest_pdf_exported_at: '2026-03-16T00:10:00.000Z',
    metadata: {
      generation: {
        story_model: 'story-crafter-v1',
      },
    },
  };

  const libraryCard = serializeLibraryBookSummary(supabase, baseBook);
  assert.equal(libraryCard.slug, 'hakol-book-1');
  assert.equal('storySegments' in libraryCard, false);
  assert.equal(libraryCard.thumbImageUrl, 'https://assets.example/book-public-assets/hakol-book-1/thumb/scene-thumb-a1.jpg');

  const dashboardCard = serializeDashboardBookSummary(supabase, baseBook);
  assert.equal(dashboardCard.sessionId, 'session-1');
  assert.equal(dashboardCard.thumbImageUrl, 'https://assets.example/book-public-assets/hakol-book-1/thumb/scene-thumb-a1.jpg');

  const previewDetail = await serializeBookDetail(supabase, baseBook, { isOwner: false });
  assert.deepEqual(previewDetail.storySegments, []);
  assert.equal(previewDetail.sourceImageUrl, null);
  assert.equal(previewDetail.displayImageUrl, 'https://assets.example/book-public-assets/hakol-book-1/display/scene-display-a1.jpg');

  const ownerDetail = await serializeBookDetail(supabase, { ...baseBook, is_unlocked: true }, { isOwner: true });
  assert.equal(ownerDetail.storySegments.length, 10);
  assert.equal(ownerDetail.sourceImageUrl, 'https://signed.example/book-private-assets/hakol-book-1/source/scene-source-a1.png');
  assert.equal(ownerDetail.latestPdf?.signedUrl, 'https://signed.example/book-private-assets/hakol-book-1/pdf/book-1.pdf');

  const validPayload = createBookSchema.safeParse({
    slug: 'hakol-book-1',
    sessionId: 'session-1',
    title: 'המסע של נעם',
    heroName: 'נעם',
    topic: 'אומץ',
    artStyle: 'watercolor',
    sourceImagePath: 'hakol-book-1/source/scene-source-a1.png',
    displayImagePath: 'hakol-book-1/display/scene-display-a1.jpg',
    thumbImagePath: 'hakol-book-1/thumb/scene-thumb-a1.jpg',
    storySegments: Array.from({ length: 10 }, (_, index) => `segment-${index + 1}`),
    metadata: {
      generation: {
        story_model: 'story-crafter-v1',
      },
    },
  });
  assert.equal(validPayload.success, true);

  const invalidPayload = createBookSchema.safeParse({
    slug: 'hakol-book-1',
    sessionId: 'session-1',
    title: 'המסע של נעם',
    heroName: 'נעם',
    topic: 'אומץ',
    artStyle: 'watercolor',
    sourceImagePath: 'hakol-book-1/source/scene-source-a1.png',
    displayImagePath: 'hakol-book-1/display/scene-display-a1.jpg',
    thumbImagePath: 'hakol-book-1/thumb/scene-thumb-a1.jpg',
    storySegments: Array.from({ length: 10 }, (_, index) => `segment-${index + 1}`),
    metadata: {
      display_image_url: 'https://bad.example/heavy.jpg',
    },
  });
  assert.equal(invalidPayload.success, false);
  assert.equal(hasForbiddenKeys({ display_image_url: 'https://bad.example/heavy.jpg' }, FORBIDDEN_BOOK_METADATA_KEYS), true);

  console.log('smoke_contracts: ok');
}

await run();
