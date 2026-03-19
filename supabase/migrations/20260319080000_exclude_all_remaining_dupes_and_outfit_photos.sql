-- Exclude exact name+type duplicates (keep oldest photo-uploaded version per garment).
UPDATE garments SET exclude_from_wardrobe = true
WHERE id IN (
  'g_1773168949332_cilx0','g_1773168970942_lgqdn','g_1773168980454_n6t1x',
  'g_1773168980870_2f1pz','g_1773168985946_3stwu','g_1773168986109_zndoj',
  'g_1773168996926_tqnij','g_1773168997301_da1qm','g_1773169025458_kxw2b',
  'g_1773169030200_l19z6','g_1773169057176_jzmvg','g_1773169062375_nyfxh',
  'g_1773169066930_w74k4','g_1773169070882_6jmve','g_1773169089352_9ldth',
  'g_1773169099289_qoqxs','g_1773169108083_ssvde','g_1773169116678_x90l4',
  'g_1773169120897_ev6k1','g_1773169130342_cewzc','g_1773169185616_2xgai',
  'g_1773169185671_pidcf','g_1773177564662_to038','g_1773177564977_5oj56',
  'g_1773180556291_zn7qo','g_1773488386248_c6ddw','g_1773488472007_o7x7t',
  'g_1773488495515_gojyp','g_1773490029572_l7vmn','g_1773490558087_6ii23',
  'g_1773605827435_02can','g_1773605891260_njifc','g_1773605895542_0lmeq',
  'g_1773605942720_b4iqh','g_1773605988780_wg1t4','g_1773605997441_pdimq',
  'g_1773606041798_lzzvn','g_1773612125301_hrudr','g_1773612156503_k9022'
);

-- Exclude ALL outfit-photos (selfie/outfit shots are not wardrobe items).
UPDATE garments SET exclude_from_wardrobe = true
WHERE type = 'outfit-photo';

-- Exclude watch entries (not wardrobe items).
UPDATE garments SET exclude_from_wardrobe = true
WHERE type = 'watch';
