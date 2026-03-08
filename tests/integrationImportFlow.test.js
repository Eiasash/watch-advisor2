import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration test: import flow
 * Tests the chain: classifyFromFilename → _applyDecision → normalizeType → store update
 * Verifies that a garment imported from camera survives the full classification chain.
 */

vi.mock("../src/services/localCache.js", () => ({
  getCachedState: vi.fn().mockResolvedValue({ garments: [], history: [] }),
  setCachedState: vi.fn().mockResolvedValue(undefined),
  saveImage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/services/supabaseSync.js", () => ({
  pushGarment: vi.fn().mockResolvedValue(undefined),
  pushHistoryEntry: vi.fn().mockResolvedValue(undefined),
  pullCloudState: vi.fn().mockResolvedValue({ garments: [], history: [] }),
  subscribeSyncState: vi.fn(() => () => {}),
  uploadPhoto: vi.fn().mockResolvedValue("https://storage.url/photo.jpg"),
}));

import { classifyFromFilename, _applyDecision } from "../src/features/wardrobe/classifier.js";
import { normalizeType } from "../src/classifier/normalizeType.js";
import { useWardrobeStore } from "../src/stores/wardrobeStore.js";
import { pushGarment } from "../src/services/supabaseSync.js";
import { setCachedState } from "../src/services/localCache.js";

const blankPx = () => ({
  total: 0, topF: 0, midF: 0, botF: 0, bilatBalance: 0,
  flatLay: false,
  personLike: false,
  shoes:     { fires: false, reason: null },
  shirt:     { fires: false, reason: null },
  pants:     { fires: false, reason: null },
  ambiguous: { fires: false, reason: null },
  likelyType: null,
});

describe("integration — import flow: classify → normalize → store → sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWardrobeStore.setState({ garments: [] });
  });

  it("shirt filename → classify → normalizeType → store with correct type/color", () => {
    // Step 1: classify from filename
    const fn = classifyFromFilename("navy_shirt.jpg");
    expect(fn.type).toBe("shirt");
    expect(fn.color).toBe("navy");

    // Step 2: apply decision
    const result = _applyDecision(fn, blankPx(), null, undefined);
    expect(result.type).toBe("shirt");
    expect(result.color).toBe("navy");

    // Step 3: normalizeType
    const normalized = normalizeType(result.type);
    expect(normalized).toBe("shirt");

    // Step 4: build garment and add to store
    const garment = {
      id: "import-1",
      name: "Navy Shirt",
      type: normalized,
      color: result.color,
      formality: result.formality,
      needsReview: result.needsReview,
      photoType: result.photoType,
    };

    useWardrobeStore.getState().addGarment(garment);
    const stored = useWardrobeStore.getState().garments;
    expect(stored).toHaveLength(1);
    expect(stored[0].type).toBe("shirt");
    expect(stored[0].color).toBe("navy");
    expect(stored[0].needsReview).toBe(false);
  });

  it("shoes filename → full chain → shoes in store", () => {
    const fn = classifyFromFilename("brown_derby.jpg");
    const result = _applyDecision(fn, blankPx(), null, undefined);
    const normalized = normalizeType(result.type);

    expect(normalized).toBe("shoes");
    expect(result.formality).toBe(8); // derby formality

    const garment = {
      id: "import-2",
      type: normalized,
      color: result.color,
      formality: result.formality,
      needsReview: false,
    };

    useWardrobeStore.getState().addGarment(garment);
    expect(useWardrobeStore.getState().garments[0].type).toBe("shoes");
    expect(useWardrobeStore.getState().garments[0].formality).toBe(8);
  });

  it("camera-roll shoes with pixel signal → shoes via image-shoes-upgrade", () => {
    // Camera roll filename with pants keyword
    const fn = classifyFromFilename("IMG_1234_pants.jpg");
    expect(fn.confidence).toBe("medium");

    // But pixel analysis detects shoes
    const px = {
      ...blankPx(),
      shoes: { fires: true, reason: "bottom-heavy" },
    };

    const result = _applyDecision(fn, px, null, undefined);
    expect(result.type).toBe("shoes");
    expect(result._typeSource).toBe("image-shoes-upgrade");

    const garment = {
      id: "import-3",
      type: normalizeType(result.type),
      color: result.color,
    };

    useWardrobeStore.getState().addGarment(garment);
    expect(useWardrobeStore.getState().garments[0].type).toBe("shoes");
  });

  it("flat-lay with bot-heavy zones → pants via flat-lay bias", () => {
    const fn = classifyFromFilename("IMG_5678.jpg");
    const px = {
      ...blankPx(),
      total: 500, flatLay: true,
      topF: 0.25, midF: 0.30, botF: 0.45, // botF - topF = 0.20 > 0.08
    };

    const result = _applyDecision(fn, px, "grey", undefined);
    expect(result.type).toBe("pants");
    expect(result._typeSource).toBe("flat-lay");

    const garment = {
      id: "import-4",
      type: normalizeType(result.type),
      color: result.color,
    };

    useWardrobeStore.getState().addGarment(garment);
    expect(useWardrobeStore.getState().garments[0].type).toBe("pants");
    expect(useWardrobeStore.getState().garments[0].color).toBe("grey");
  });

  it("selfie filename → outfit-shot, needsReview, store correctly", () => {
    const fn = classifyFromFilename("mirror_selfie_ootd.jpg");
    const result = _applyDecision(fn, blankPx(), null, undefined);

    expect(result.type).toBe("shirt"); // safe fallback
    expect(result.photoType).toBe("outfit-shot");
    expect(result.needsReview).toBe(true);

    const garment = {
      id: "import-5",
      type: normalizeType(result.type),
      photoType: result.photoType,
      needsReview: result.needsReview,
    };

    useWardrobeStore.getState().addGarment(garment);
    expect(useWardrobeStore.getState().garments[0].needsReview).toBe(true);
    expect(useWardrobeStore.getState().garments[0].photoType).toBe("outfit-shot");
  });

  it("duplicate detected → garment gets duplicateOf field", () => {
    const fn = classifyFromFilename("shirt_white.jpg");
    const result = _applyDecision(fn, blankPx(), null, "existing-garment-id");

    expect(result.duplicateOf).toBe("existing-garment-id");

    const garment = {
      id: "import-6",
      type: normalizeType(result.type),
      duplicateOf: result.duplicateOf,
    };

    useWardrobeStore.getState().addGarment(garment);
    expect(useWardrobeStore.getState().garments[0].duplicateOf).toBe("existing-garment-id");
  });
});
