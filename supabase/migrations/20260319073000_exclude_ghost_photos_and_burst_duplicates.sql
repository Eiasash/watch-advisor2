-- Exclude ghost/pile/raw-filename photos (not real garments).
UPDATE garments SET exclude_from_wardrobe = true
WHERE id IN (
  'g_1773169213103_kg0wa',  -- Folded Denim Jeans Stack (pile photo)
  'g_1773168928327_447vb',  -- Mixed Denim Jeans Lot (pile photo)
  'g_1773169177472_c7otr',  -- IMG 20260207 WA0339 (raw filename)
  'g_1773169208217_shajj'   -- Stacked Cable Knit Sweaters (pile photo)
);

-- Exclude sub-1-second camera-burst duplicates (keep oldest, drop rest).
UPDATE garments SET exclude_from_wardrobe = true
WHERE id IN (
  'g_1773169016668_0v06a',  -- Tan Leather Jacket (burst dupe of Tan Zip Bomber)
  'g_1773169016760_lldlx',  -- Tan Zip Jacket (burst dupe of Tan Zip Bomber)
  'g_1773605818964_wqyjx',  -- Red Solid Crewneck Pullover (burst dupe of Red Crewneck)
  'g_1773169094325_z5llp',  -- Light Blue Dress Shirt (burst dupe of Light Blue Button Shirt)
  'g_1773169062272_rp3l2',  -- Cream Cotton Polo Shirt (burst dupe of Cream GANT Polo)
  'g_1773177581902_04itl',  -- Tan Knit Sweater (burst dupe of Tan Textured Knit)
  'g_1773169030000_jv6ez',  -- Plaid Tweed Shirt (burst dupe of Blue Plaid Flannel)
  'g_1773168921247_rs1ov'   -- Tan Knit Zip Sweater (burst dupe of Tan Knit Half-Zip)
);
