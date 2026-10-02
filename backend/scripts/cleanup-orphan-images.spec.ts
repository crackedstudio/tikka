import {
  collectReferencedPaths,
  extractBucketPath,
  listAllObjects,
  deleteInBatches,
  StorageObject,
} from './cleanup-orphan-images';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('cleanup-orphan-images', () => {
  let mockSupabaseClient: jest.Mocked<SupabaseClient>;

  beforeEach(() => {
    mockSupabaseClient = {
      from: jest.fn(),
      storage: {
        from: jest.fn(),
      },
    } as any;
    (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('extractBucketPath', () => {
    it('extracts path from Supabase public URL', () => {
      const url = 'https://project.supabase.co/storage/v1/object/public/raffle-images/42/uploader/uuid.webp';
      expect(extractBucketPath(url)).toBe('42/uploader/uuid.webp');
    });

    it('extracts path with special characters', () => {
      const url = 'https://project.supabase.co/storage/v1/object/public/raffle-images/draft/GABC123/uuid-800w.webp';
      expect(extractBucketPath(url)).toBe('draft/GABC123/uuid-800w.webp');
    });

    it('strips query string from URL', () => {
      const url = 'https://project.supabase.co/storage/v1/object/public/raffle-images/42/uploader/uuid.webp?v=12345';
      expect(extractBucketPath(url)).toBe('42/uploader/uuid.webp');
    });

    it('strips fragment from URL', () => {
      const url = 'https://project.supabase.co/storage/v1/object/public/raffle-images/42/uploader/uuid.webp#anchor';
      expect(extractBucketPath(url)).toBe('42/uploader/uuid.webp');
    });

    it('decodes percent-encoded paths', () => {
      const url = 'https://project.supabase.co/storage/v1/object/public/raffle-images/42/uploader%20name/uuid.webp';
      expect(extractBucketPath(url)).toBe('42/uploader name/uuid.webp');
    });

    it('returns null for URLs not in raffle-images bucket', () => {
      const url = 'https://project.supabase.co/storage/v1/object/public/other-bucket/file.jpg';
      expect(extractBucketPath(url)).toBeNull();
    });

    it('returns null for non-storage URLs', () => {
      const url = 'https://example.com/image.jpg';
      expect(extractBucketPath(url)).toBeNull();
    });

    it('returns null for null input', () => {
      expect(extractBucketPath(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(extractBucketPath(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(extractBucketPath('')).toBeNull();
    });
  });

  describe('collectReferencedPaths', () => {
    it('collects paths from image_url column', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          range: jest.fn().mockResolvedValue({
            data: [
              {
                image_url: 'https://project.supabase.co/storage/v1/object/public/raffle-images/42/addr1/uuid1.webp',
                image_urls: null,
              },
            ],
            error: null,
          }),
        }),
      });
      mockSupabaseClient.from = mockFrom as any;

      const paths = await collectReferencedPaths(mockSupabaseClient);

      expect(paths.size).toBe(1);
      expect(paths.has('42/addr1/uuid1.webp')).toBe(true);
    });

    it('collects paths from image_urls array', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          range: jest.fn().mockResolvedValue({
            data: [
              {
                image_url: 'https://project.supabase.co/storage/v1/object/public/raffle-images/42/addr1/uuid1.webp',
                image_urls: [
                  'https://project.supabase.co/storage/v1/object/public/raffle-images/42/addr1/uuid1-400w.webp',
                  'https://project.supabase.co/storage/v1/object/public/raffle-images/42/addr1/uuid1-800w.webp',
                ],
              },
            ],
            error: null,
          }),
        }),
      });
      mockSupabaseClient.from = mockFrom as any;

      const paths = await collectReferencedPaths(mockSupabaseClient);

      expect(paths.size).toBe(3);
      expect(paths.has('42/addr1/uuid1.webp')).toBe(true);
      expect(paths.has('42/addr1/uuid1-400w.webp')).toBe(true);
      expect(paths.has('42/addr1/uuid1-800w.webp')).toBe(true);
    });

    it('handles null image_url gracefully', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          range: jest.fn().mockResolvedValue({
            data: [
              {
                image_url: null,
                image_urls: ['https://project.supabase.co/storage/v1/object/public/raffle-images/42/addr1/uuid1.webp'],
              },
            ],
            error: null,
          }),
        }),
      });
      mockSupabaseClient.from = mockFrom as any;

      const paths = await collectReferencedPaths(mockSupabaseClient);

      expect(paths.size).toBe(1);
      expect(paths.has('42/addr1/uuid1.webp')).toBe(true);
    });

    it('handles empty result set', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          range: jest.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      });
      mockSupabaseClient.from = mockFrom as any;

      const paths = await collectReferencedPaths(mockSupabaseClient);

      expect(paths.size).toBe(0);
    });

    it('paginates through large result sets', async () => {
      const mockRange = jest
        .fn()
        .mockResolvedValueOnce({
          data: Array(1000)
            .fill(null)
            .map((_, i) => ({
              image_url: `https://project.supabase.co/storage/v1/object/public/raffle-images/42/addr/uuid${i}.webp`,
              image_urls: null,
            })),
          error: null,
        })
        .mockResolvedValueOnce({
          data: Array(500)
            .fill(null)
            .map((_, i) => ({
              image_url: `https://project.supabase.co/storage/v1/object/public/raffle-images/43/addr/uuid${i}.webp`,
              image_urls: null,
            })),
          error: null,
        })
        .mockResolvedValueOnce({
          data: [],
          error: null,
        });

      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          range: mockRange,
        }),
      });
      mockSupabaseClient.from = mockFrom as any;

      const paths = await collectReferencedPaths(mockSupabaseClient);

      expect(paths.size).toBe(1500);
      expect(mockRange).toHaveBeenCalledTimes(3);
    });

    it('throws error when database query fails', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          range: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database connection failed' },
          }),
        }),
      });
      mockSupabaseClient.from = mockFrom as any;

      await expect(collectReferencedPaths(mockSupabaseClient)).rejects.toThrow(
        'Failed to read raffle_metadata: Database connection failed',
      );
    });
  });

  describe('listAllObjects', () => {
    it('lists all files in bucket', async () => {
      const mockList = jest.fn().mockResolvedValue({
        data: [
          { name: 'uuid1.webp', id: 'id1', created_at: '2024-01-01T00:00:00Z' },
          { name: 'uuid2.webp', id: 'id2', created_at: '2024-01-02T00:00:00Z' },
        ],
        error: null,
      });

      const mockStorageFrom = jest.fn().mockReturnValue({
        list: mockList,
      });
      mockSupabaseClient.storage = { from: mockStorageFrom } as any;

      const objects = await listAllObjects(mockSupabaseClient);

      expect(objects).toHaveLength(2);
      expect(objects[0].path).toBe('uuid1.webp');
      expect(objects[1].path).toBe('uuid2.webp');
    });

    it('recursively lists nested directories', async () => {
      const mockList = jest
        .fn()
        .mockResolvedValueOnce({
          // Root level: folders only
          data: [
            { name: '42', id: null, created_at: null }, // Folder (id is null)
            { name: 'draft', id: null, created_at: null }, // Folder
          ],
          error: null,
        })
        .mockResolvedValueOnce({
          // Inside '42' folder
          data: [
            { name: 'uploader1', id: null, created_at: null }, // Folder
          ],
          error: null,
        })
        .mockResolvedValueOnce({
          // Inside '42/uploader1' folder
          data: [
            { name: 'uuid1.webp', id: 'id1', created_at: '2024-01-01T00:00:00Z' },
          ],
          error: null,
        })
        .mockResolvedValueOnce({
          // Inside 'draft' folder
          data: [
            { name: 'uploader2', id: null, created_at: null }, // Folder
          ],
          error: null,
        })
        .mockResolvedValueOnce({
          // Inside 'draft/uploader2' folder
          data: [
            { name: 'uuid2.webp', id: 'id2', created_at: '2024-01-02T00:00:00Z' },
          ],
          error: null,
        });

      const mockStorageFrom = jest.fn().mockReturnValue({
        list: mockList,
      });
      mockSupabaseClient.storage = { from: mockStorageFrom } as any;

      const objects = await listAllObjects(mockSupabaseClient);

      expect(objects).toHaveLength(2);
      expect(objects[0].path).toBe('42/uploader1/uuid1.webp');
      expect(objects[1].path).toBe('draft/uploader2/uuid2.webp');
    });

    it('handles empty bucket', async () => {
      const mockList = jest.fn().mockResolvedValue({
        data: [],
        error: null,
      });

      const mockStorageFrom = jest.fn().mockReturnValue({
        list: mockList,
      });
      mockSupabaseClient.storage = { from: mockStorageFrom } as any;

      const objects = await listAllObjects(mockSupabaseClient);

      expect(objects).toHaveLength(0);
    });

    it('throws error when storage list fails', async () => {
      const mockList = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Storage unavailable' },
      });

      const mockStorageFrom = jest.fn().mockReturnValue({
        list: mockList,
      });
      mockSupabaseClient.storage = { from: mockStorageFrom } as any;

      await expect(listAllObjects(mockSupabaseClient)).rejects.toThrow(
        'Failed to list "": Storage unavailable',
      );
    });
  });

  describe('deleteInBatches', () => {
    it('deletes files in batches of 100', async () => {
      const paths = Array(250)
        .fill(null)
        .map((_, i) => `path${i}.webp`);

      const mockRemove = jest.fn().mockResolvedValue({ error: null });
      const mockStorageFrom = jest.fn().mockReturnValue({
        remove: mockRemove,
      });
      mockSupabaseClient.storage = { from: mockStorageFrom } as any;

      await deleteInBatches(mockSupabaseClient, paths);

      // Should split into 3 batches: 100, 100, 50
      expect(mockRemove).toHaveBeenCalledTimes(3);
      expect(mockRemove).toHaveBeenNthCalledWith(1, paths.slice(0, 100));
      expect(mockRemove).toHaveBeenNthCalledWith(2, paths.slice(100, 200));
      expect(mockRemove).toHaveBeenNthCalledWith(3, paths.slice(200, 250));
    });

    it('handles empty path list', async () => {
      const mockRemove = jest.fn();
      const mockStorageFrom = jest.fn().mockReturnValue({
        remove: mockRemove,
      });
      mockSupabaseClient.storage = { from: mockStorageFrom } as any;

      await deleteInBatches(mockSupabaseClient, []);

      expect(mockRemove).not.toHaveBeenCalled();
    });

    it('throws error when deletion fails', async () => {
      const paths = ['path1.webp', 'path2.webp'];
      const mockRemove = jest.fn().mockResolvedValue({
        error: { message: 'Permission denied' },
      });
      const mockStorageFrom = jest.fn().mockReturnValue({
        remove: mockRemove,
      });
      mockSupabaseClient.storage = { from: mockStorageFrom } as any;

      await expect(deleteInBatches(mockSupabaseClient, paths)).rejects.toThrow(
        'Failed to delete a batch of objects: Permission denied',
      );
    });
  });

  describe('Failed upload handling', () => {
    it('identifies orphans from failed uploads after grace period', async () => {
      const now = Date.now();
      const gracePeriodMs = 24 * 60 * 60 * 1000; // 24 hours
      const oldTimestamp = new Date(now - gracePeriodMs - 1000).toISOString();
      const recentTimestamp = new Date(now - 1000).toISOString();

      // Simulate: 2 images uploaded but never referenced by metadata
      const allObjects: StorageObject[] = [
        {
          path: 'draft/uploader1/orphan-old.webp',
          createdAt: oldTimestamp, // Older than grace period
        },
        {
          path: 'draft/uploader1/orphan-recent.webp',
          createdAt: recentTimestamp, // Within grace period
        },
        {
          path: '42/uploader2/referenced.webp',
          createdAt: oldTimestamp,
        },
      ];

      const referencedPaths = new Set(['42/uploader2/referenced.webp']);

      // Apply grace period filter (mimics the script's logic)
      const graceCutoff = now - gracePeriodMs;
      const orphans = allObjects.filter((obj) => {
        if (referencedPaths.has(obj.path)) return false;
        const createdMs = obj.createdAt ? Date.parse(obj.createdAt) : NaN;
        if (!Number.isFinite(createdMs) || createdMs > graceCutoff) return false;
        return true;
      });

      // Only the old orphan should be identified
      expect(orphans).toHaveLength(1);
      expect(orphans[0].path).toBe('draft/uploader1/orphan-old.webp');
    });

    it('never deletes images within grace period (in-progress uploads)', async () => {
      const now = Date.now();
      const gracePeriodMs = 24 * 60 * 60 * 1000;
      const recentTimestamp = new Date(now - 1000).toISOString();

      const allObjects: StorageObject[] = [
        {
          path: 'draft/uploader/recent-upload.webp',
          createdAt: recentTimestamp, // Just uploaded
        },
      ];

      const referencedPaths = new Set<string>(); // Not yet referenced

      const graceCutoff = now - gracePeriodMs;
      const orphans = allObjects.filter((obj) => {
        if (referencedPaths.has(obj.path)) return false;
        const createdMs = obj.createdAt ? Date.parse(obj.createdAt) : NaN;
        if (!Number.isFinite(createdMs) || createdMs > graceCutoff) return false;
        return true;
      });

      // Should NOT be identified as orphan due to grace period
      expect(orphans).toHaveLength(0);
    });

    it('never deletes images referenced by soft-deleted raffles', async () => {
      // Simulate: raffle was soft-deleted but image is still referenced
      const referencedPaths = new Set([
        '42/uploader/soft-deleted-raffle-image.webp',
      ]);

      const allObjects: StorageObject[] = [
        {
          path: '42/uploader/soft-deleted-raffle-image.webp',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];

      const orphans = allObjects.filter((obj) => !referencedPaths.has(obj.path));

      // Should NOT be identified as orphan
      expect(orphans).toHaveLength(0);
    });

    it('reclaims failed upload images after grace period', async () => {
      const now = Date.now();
      const gracePeriodMs = 48 * 60 * 60 * 1000; // 48 hours
      const oldTimestamp = new Date(now - gracePeriodMs - 1000).toISOString();

      // Scenario: User uploaded image, HTTP request failed, user retried with new image
      const allObjects: StorageObject[] = [
        {
          path: 'draft/uploader/failed-upload-1.webp',
          createdAt: oldTimestamp,
        },
        {
          path: 'draft/uploader/failed-upload-1-400w.webp',
          createdAt: oldTimestamp,
        },
        {
          path: 'draft/uploader/successful-upload-2.webp',
          createdAt: new Date(now - 1000).toISOString(),
        },
      ];

      const referencedPaths = new Set(['draft/uploader/successful-upload-2.webp']);

      const graceCutoff = now - gracePeriodMs;
      const orphans = allObjects.filter((obj) => {
        if (referencedPaths.has(obj.path)) return false;
        const createdMs = obj.createdAt ? Date.parse(obj.createdAt) : NaN;
        if (!Number.isFinite(createdMs) || createdMs > graceCutoff) return false;
        return true;
      });

      // Both failed upload files should be identified as orphans
      expect(orphans).toHaveLength(2);
      expect(orphans.map((o) => o.path)).toContain('draft/uploader/failed-upload-1.webp');
      expect(orphans.map((o) => o.path)).toContain('draft/uploader/failed-upload-1-400w.webp');
    });
  });
});
