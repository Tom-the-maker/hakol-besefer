import assert from 'node:assert/strict';
import {
  FORBIDDEN_BOOK_METADATA_KEYS,
  createBookSchema,
  hasForbiddenKeys,
  serializeBookDetail,
  serializeDashboardBookSummary,
  serializeLibraryBookSummary,
} from '../server/lib/books.js';
import {
  serializeDashboardAnalyticsEvent,
  serializeDashboardSystemLog,
} from '../server/lib/dashboard.js';

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

  const dashboardLog = serializeDashboardSystemLog({
    id: 101,
    created_at: '2026-03-16T00:00:00.000Z',
    session_id: 'session-1',
    action_type: 'generateStory',
    model_name: 'story-crafter-v1',
    input_tokens: 1200,
    output_tokens: 2400,
    status: 'success',
    hero_name: 'נעם',
    topic: 'אומץ',
    art_style: 'watercolor',
    hero_gender: 'male',
    hero_age: 8,
    book_title: 'המסע של נעם',
    parent_character: 'אבא',
    provider_model: 'gemini-2.0-flash',
    estimated_cost_usd: 0.0004,
    duration_ms: 1820,
    metadata: {
      requested_model: 'gemini-2.0-flash',
      provider_model_source: 'provider_model_version',
      result_data: 'data:image/png;base64,AAAA',
      request_json: {
        parentName: 'אבא',
        parentCharacter: 'אבא',
        ignored: 'x'.repeat(300),
      },
      response_json: {
        prompt_token: 'prompt-123',
        segments: Array.from({ length: 10 }, (_, index) => `segment-${index + 1}`),
        panel_plan: ['panel-a', 'panel-b'],
        huge_blob: 'x'.repeat(5000),
      },
      reference_analysis: [
        {
          slot: 'hero',
          usage: { input: 123, output: 45 },
          profile: {
            summary: 'short summary',
            identityAnchors: ['anchor-1', 'anchor-2'],
          },
        },
      ],
    },
  });
  assert.equal(dashboardLog.child_name, 'נעם');
  assert.equal(dashboardLog.extra_char_1, 'אבא');
  assert.equal(dashboardLog.metadata.result_data, '[inline-image]');
  assert.equal(dashboardLog.metadata.request_json.parentName, 'אבא');
  assert.equal('ignored' in dashboardLog.metadata.request_json, false);
  assert.equal(dashboardLog.metadata.response_json.prompt_token, 'prompt-123');
  assert.equal(Array.isArray(dashboardLog.metadata.response_json.segments), true);
  assert.equal('huge_blob' in dashboardLog.metadata.response_json, false);

  const dashboardEvent = serializeDashboardAnalyticsEvent({
    session_id: 'session-1',
    event_name: 'ui_click',
    page: '/book/abc',
    device_type: 'desktop',
    created_at: '2026-03-16T00:00:00.000Z',
    event_data: {
      target_label: 'כפתור המשך',
      target_path: 'button > span',
      nested: {
        text_preview: 'x'.repeat(300),
        deeper: {
          impossible: {
            value: 'hidden',
          },
        },
      },
    },
  });
  assert.equal(dashboardEvent.event_data.target_label, 'כפתור המשך');
  assert.equal(typeof dashboardEvent.event_data.nested.text_preview, 'string');
  assert.equal(dashboardEvent.event_data.nested.deeper.impossible, '[max-depth]');

  console.log('smoke_contracts: ok');
}

await run();
