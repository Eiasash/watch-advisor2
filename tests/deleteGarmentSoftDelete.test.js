/**
 * Regression guard for the chambray-deletion incident (May 22 2026):
 * `deleteGarment()` was doing a hard DELETE on the `garments` table from the
 * cloud, while the local Zustand store only removed the garment from the
 * in-memory map. The result: any "trash" press in GarmentEditor, AuditPanel,
 * or WardrobeGrid permanently dropped the row from Supabase, breaking history
 * references and losing photos forever.
 *
 * The fix (v1.13.50): convert to a soft-delete that sets
 * `exclude_from_wardrobe = true` instead. This test verifies the contract
 * by mocking the supabase client and asserting the call shape. If anyone
 * reverts to `.delete()`, this test fails.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase client BEFORE importing the module under test.
const mockEq = vi.fn(() => Promise.resolve({ error: null }));
const mockUpdate = vi.fn(() => ({ eq: mockEq }));
const mockDelete = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ update: mockUpdate, delete: mockDelete }));

vi.mock("../src/services/supabaseClient.js", () => ({
  supabase: { from: mockFrom },
}));

vi.mock("../src/services/supabaseSyncState.js", () => ({
  IS_PLACEHOLDER: false,
  getSyncState: () => ({ queued: 0 }),
  setSyncState: vi.fn(),
}));

vi.mock("../src/services/authedFetch.js", () => ({
  authedFetch: vi.fn(),
}));

const { deleteGarment } = await import("../src/services/supabaseGarments.js");

describe("deleteGarment (soft-delete contract)", () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockUpdate.mockClear();
    mockDelete.mockClear();
    mockEq.mockClear();
  });

  it("calls UPDATE with exclude_from_wardrobe=true, never DELETE", async () => {
    await deleteGarment("g_test_id_001");

    // The right call shape: from('garments').update({exclude_from_wardrobe:true}).eq('id', id)
    expect(mockFrom).toHaveBeenCalledWith("garments");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({ exclude_from_wardrobe: true });
    expect(mockEq).toHaveBeenCalledWith("id", "g_test_id_001");

    // CRITICAL: never hard-delete. If this fails, the chambray bug is back.
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("does not throw if supabase update errors", async () => {
    mockEq.mockResolvedValueOnce({ error: { message: "rls denied" } });
    await expect(deleteGarment("g_test_id_002")).resolves.toBeUndefined();
  });
});
