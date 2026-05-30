import { ListRafflesQuerySchema, MAX_PAGE_LIMIT } from './list-raffles-query.dto';
import { PurchaseTicketSchema, MAX_TICKET_QUANTITY } from './purchase-ticket.dto';
import { BatchMetadataQuerySchema, MAX_BATCH_IDS } from './batch-metadata-query.dto';
import {
  UpsertMetadataSchema,
  METADATA_TITLE_MAX,
  METADATA_DESCRIPTION_MAX,
  METADATA_CATEGORY_MAX,
  METADATA_IMAGE_URLS_MAX_COUNT,
} from '../metadata.schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ok = <T>(result: { success: boolean; data?: T }) => {
  expect(result.success).toBe(true);
  return (result as { success: true; data: T }).data;
};

const err = (result: { success: boolean; error?: { errors: { message: string }[] } }) => {
  expect(result.success).toBe(false);
  return (result as { success: false; error: { errors: { message: string }[] } }).error.errors;
};

const messages = (result: { success: boolean; error?: { errors: { message: string }[] } }) =>
  err(result).map((e) => e.message);

// ---------------------------------------------------------------------------
// ListRafflesQuerySchema — pagination & filter validation
// ---------------------------------------------------------------------------

describe('ListRafflesQuerySchema', () => {
  describe('limit', () => {
    it('accepts limit at the maximum allowed value', () => {
      const data = ok(ListRafflesQuerySchema.safeParse({ limit: MAX_PAGE_LIMIT }));
      expect(data.limit).toBe(MAX_PAGE_LIMIT);
    });

    it('rejects limit above the maximum', () => {
      const msgs = messages(ListRafflesQuerySchema.safeParse({ limit: MAX_PAGE_LIMIT + 1 }));
      expect(msgs.some((m) => m.includes(`must not exceed ${MAX_PAGE_LIMIT}`))).toBe(true);
    });

    it('rejects limit of zero', () => {
      const msgs = messages(ListRafflesQuerySchema.safeParse({ limit: 0 }));
      expect(msgs.some((m) => m.includes('at least 1'))).toBe(true);
    });

    it('rejects negative limit', () => {
      const msgs = messages(ListRafflesQuerySchema.safeParse({ limit: -5 }));
      expect(msgs.some((m) => m.includes('at least 1'))).toBe(true);
    });

    it('coerces string numbers', () => {
      const data = ok(ListRafflesQuerySchema.safeParse({ limit: '10' }));
      expect(data.limit).toBe(10);
    });

    it('rejects non-numeric limit string', () => {
      const msgs = messages(ListRafflesQuerySchema.safeParse({ limit: 'abc' }));
      expect(msgs.some((m) => /number|integer/i.test(m))).toBe(true);
    });

    it('defaults to 20 when omitted', () => {
      const data = ok(ListRafflesQuerySchema.safeParse({}));
      expect(data.limit).toBe(20);
    });
  });

  describe('offset', () => {
    it('accepts zero', () => {
      const data = ok(ListRafflesQuerySchema.safeParse({ offset: 0 }));
      expect(data.offset).toBe(0);
    });

    it('rejects negative offset', () => {
      const msgs = messages(ListRafflesQuerySchema.safeParse({ offset: -1 }));
      expect(msgs.some((m) => m.includes('at least 0'))).toBe(true);
    });
  });

  describe('creator', () => {
    it('accepts a valid Stellar G-address', () => {
      const validAddress = 'G' + 'A'.repeat(55);
      const data = ok(ListRafflesQuerySchema.safeParse({ creator: validAddress }));
      expect(data.creator).toBe(validAddress);
    });

    it('rejects an address that is too short', () => {
      const msgs = messages(ListRafflesQuerySchema.safeParse({ creator: 'GABC123' }));
      expect(msgs.some((m) => /stellar|public key/i.test(m))).toBe(true);
    });

    it('rejects an address that does not start with G', () => {
      const msgs = messages(ListRafflesQuerySchema.safeParse({ creator: 'S' + 'A'.repeat(55) }));
      expect(msgs.some((m) => /stellar|public key/i.test(m))).toBe(true);
    });

    it('rejects arbitrary strings', () => {
      const msgs = messages(ListRafflesQuerySchema.safeParse({ creator: 'not-an-address' }));
      expect(msgs.some((m) => /stellar|public key/i.test(m))).toBe(true);
    });

    it('is optional — omitting it is valid', () => {
      expect(ListRafflesQuerySchema.safeParse({}).success).toBe(true);
    });
  });

  describe('asset', () => {
    it('accepts valid alphanumeric asset codes', () => {
      expect(ListRafflesQuerySchema.safeParse({ asset: 'XLM' }).success).toBe(true);
      expect(ListRafflesQuerySchema.safeParse({ asset: 'USDC' }).success).toBe(true);
    });

    it('rejects asset codes with special characters', () => {
      const msgs = messages(ListRafflesQuerySchema.safeParse({ asset: 'US-DC' }));
      expect(msgs.some((m) => /alphanumeric/i.test(m))).toBe(true);
    });

    it('rejects asset codes longer than 12 characters', () => {
      const msgs = messages(ListRafflesQuerySchema.safeParse({ asset: 'A'.repeat(13) }));
      expect(msgs.some((m) => /12/i.test(m))).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// PurchaseTicketSchema — quantity validation
// ---------------------------------------------------------------------------

describe('PurchaseTicketSchema', () => {
  it('accepts a valid positive integer quantity', () => {
    const data = ok(PurchaseTicketSchema.safeParse({ quantity: 5 }));
    expect(data.quantity).toBe(5);
  });

  it('accepts the maximum allowed quantity', () => {
    const data = ok(PurchaseTicketSchema.safeParse({ quantity: MAX_TICKET_QUANTITY }));
    expect(data.quantity).toBe(MAX_TICKET_QUANTITY);
  });

  it('rejects zero', () => {
    const msgs = messages(PurchaseTicketSchema.safeParse({ quantity: 0 }));
    expect(msgs.some((m) => m.includes('at least 1'))).toBe(true);
  });

  it('rejects negative quantities', () => {
    const msgs = messages(PurchaseTicketSchema.safeParse({ quantity: -1 }));
    expect(msgs.some((m) => m.includes('at least 1'))).toBe(true);
  });

  it('rejects quantities above the maximum', () => {
    const msgs = messages(PurchaseTicketSchema.safeParse({ quantity: MAX_TICKET_QUANTITY + 1 }));
    expect(msgs.some((m) => m.includes(`must not exceed ${MAX_TICKET_QUANTITY}`))).toBe(true);
  });

  it('rejects non-integer float', () => {
    const msgs = messages(PurchaseTicketSchema.safeParse({ quantity: 1.5 }));
    expect(msgs.some((m) => /integer/i.test(m))).toBe(true);
  });

  it('coerces numeric strings', () => {
    const data = ok(PurchaseTicketSchema.safeParse({ quantity: '3' }));
    expect(data.quantity).toBe(3);
  });

  it('rejects non-numeric strings', () => {
    const msgs = messages(PurchaseTicketSchema.safeParse({ quantity: 'abc' }));
    expect(msgs.some((m) => /number/i.test(m))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BatchMetadataQuerySchema — ID list validation
// ---------------------------------------------------------------------------

describe('BatchMetadataQuerySchema', () => {
  it('parses a valid comma-separated list of IDs', () => {
    const data = ok(BatchMetadataQuerySchema.safeParse({ ids: '1,2,3' }));
    expect(data.ids).toEqual([1, 2, 3]);
  });

  it('trims whitespace around IDs', () => {
    const data = ok(BatchMetadataQuerySchema.safeParse({ ids: ' 1 , 2 , 3 ' }));
    expect(data.ids).toEqual([1, 2, 3]);
  });

  it('rejects alphabetic IDs', () => {
    const result = BatchMetadataQuerySchema.safeParse({ ids: 'abc,def' });
    expect(result.success).toBe(false);
  });

  it('rejects negative IDs', () => {
    const result = BatchMetadataQuerySchema.safeParse({ ids: '-1,2' });
    expect(result.success).toBe(false);
  });

  it('rejects zero as an ID', () => {
    const result = BatchMetadataQuerySchema.safeParse({ ids: '0,1' });
    expect(result.success).toBe(false);
  });

  it('rejects mixed valid and invalid IDs — e.g. "123abc"', () => {
    const result = BatchMetadataQuerySchema.safeParse({ ids: '1,123abc' });
    expect(result.success).toBe(false);
  });

  it('rejects empty ids string', () => {
    const result = BatchMetadataQuerySchema.safeParse({ ids: '' });
    expect(result.success).toBe(false);
  });

  it(`rejects more than ${MAX_BATCH_IDS} IDs`, () => {
    const ids = Array.from({ length: MAX_BATCH_IDS + 1 }, (_, i) => i + 1).join(',');
    const msgs = messages(BatchMetadataQuerySchema.safeParse({ ids }));
    expect(msgs.some((m) => m.includes(`${MAX_BATCH_IDS}`))).toBe(true);
  });

  it(`accepts exactly ${MAX_BATCH_IDS} IDs`, () => {
    const ids = Array.from({ length: MAX_BATCH_IDS }, (_, i) => i + 1).join(',');
    const data = ok(BatchMetadataQuerySchema.safeParse({ ids }));
    expect(data.ids).toHaveLength(MAX_BATCH_IDS);
  });

  it('rejects float IDs', () => {
    const result = BatchMetadataQuerySchema.safeParse({ ids: '1.5,2' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UpsertMetadataSchema — metadata payload validation
// ---------------------------------------------------------------------------

describe('UpsertMetadataSchema', () => {
  it('accepts a fully valid payload', () => {
    const result = UpsertMetadataSchema.safeParse({
      title: 'My Raffle',
      description: 'A great raffle',
      image_url: 'https://example.com/image.png',
      image_urls: ['https://example.com/a.png', 'https://example.com/b.png'],
      category: 'art',
      metadata_cid: 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
    });
    expect(result.success).toBe(true);
  });

  describe('title', () => {
    it(`rejects titles longer than ${METADATA_TITLE_MAX} characters`, () => {
      const msgs = messages(UpsertMetadataSchema.safeParse({ title: 'x'.repeat(METADATA_TITLE_MAX + 1) }));
      expect(msgs.some((m) => m.includes(`${METADATA_TITLE_MAX}`))).toBe(true);
    });

    it(`accepts titles up to ${METADATA_TITLE_MAX} characters`, () => {
      expect(UpsertMetadataSchema.safeParse({ title: 'x'.repeat(METADATA_TITLE_MAX) }).success).toBe(true);
    });

    it('is optional', () => {
      expect(UpsertMetadataSchema.safeParse({}).success).toBe(true);
    });
  });

  describe('description', () => {
    it(`rejects descriptions longer than ${METADATA_DESCRIPTION_MAX} characters`, () => {
      const msgs = messages(UpsertMetadataSchema.safeParse({ description: 'x'.repeat(METADATA_DESCRIPTION_MAX + 1) }));
      expect(msgs.some((m) => m.includes(`${METADATA_DESCRIPTION_MAX}`))).toBe(true);
    });

    it(`accepts descriptions up to ${METADATA_DESCRIPTION_MAX} characters`, () => {
      expect(
        UpsertMetadataSchema.safeParse({ description: 'x'.repeat(METADATA_DESCRIPTION_MAX) }).success,
      ).toBe(true);
    });
  });

  describe('image_url', () => {
    it('accepts a valid https URL', () => {
      expect(
        UpsertMetadataSchema.safeParse({ image_url: 'https://cdn.example.com/photo.jpg' }).success,
      ).toBe(true);
    });

    it('accepts a valid http URL', () => {
      expect(
        UpsertMetadataSchema.safeParse({ image_url: 'http://cdn.example.com/photo.jpg' }).success,
      ).toBe(true);
    });

    it('rejects javascript: URLs', () => {
      const msgs = messages(UpsertMetadataSchema.safeParse({ image_url: 'javascript:alert(1)' }));
      expect(msgs.some((m) => /http|https|valid/i.test(m))).toBe(true);
    });

    it('rejects data: URLs', () => {
      const msgs = messages(UpsertMetadataSchema.safeParse({ image_url: 'data:text/html,<h1>xss</h1>' }));
      expect(msgs.some((m) => /http|https|valid/i.test(m))).toBe(true);
    });

    it('rejects plain strings that are not URLs', () => {
      const msgs = messages(UpsertMetadataSchema.safeParse({ image_url: 'not-a-url' }));
      expect(msgs.some((m) => /http|https|valid/i.test(m))).toBe(true);
    });

    it('accepts null (to clear the image)', () => {
      expect(UpsertMetadataSchema.safeParse({ image_url: null }).success).toBe(true);
    });
  });

  describe('image_urls', () => {
    it(`rejects arrays with more than ${METADATA_IMAGE_URLS_MAX_COUNT} entries`, () => {
      const urls = Array.from(
        { length: METADATA_IMAGE_URLS_MAX_COUNT + 1 },
        (_, i) => `https://example.com/${i}.png`,
      );
      const msgs = messages(UpsertMetadataSchema.safeParse({ image_urls: urls }));
      expect(msgs.some((m) => m.includes(`${METADATA_IMAGE_URLS_MAX_COUNT}`))).toBe(true);
    });

    it('rejects any invalid URL within the array', () => {
      const urls = ['https://example.com/ok.png', 'javascript:alert(1)'];
      const result = UpsertMetadataSchema.safeParse({ image_urls: urls });
      expect(result.success).toBe(false);
    });

    it('rejects data: URLs within the array', () => {
      const urls = ['https://example.com/ok.png', 'data:image/png;base64,abc'];
      const result = UpsertMetadataSchema.safeParse({ image_urls: urls });
      expect(result.success).toBe(false);
    });

    it('accepts an empty array', () => {
      expect(UpsertMetadataSchema.safeParse({ image_urls: [] }).success).toBe(true);
    });

    it('accepts null', () => {
      expect(UpsertMetadataSchema.safeParse({ image_urls: null }).success).toBe(true);
    });
  });

  describe('category', () => {
    it(`rejects categories longer than ${METADATA_CATEGORY_MAX} characters`, () => {
      const msgs = messages(UpsertMetadataSchema.safeParse({ category: 'x'.repeat(METADATA_CATEGORY_MAX + 1) }));
      expect(msgs.some((m) => m.includes(`${METADATA_CATEGORY_MAX}`))).toBe(true);
    });

    it('accepts null', () => {
      expect(UpsertMetadataSchema.safeParse({ category: null }).success).toBe(true);
    });
  });
});
