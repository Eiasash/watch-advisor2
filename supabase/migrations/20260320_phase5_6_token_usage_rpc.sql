-- Token usage tracking RPC — called fire-and-forget by _claudeClient.js
CREATE OR REPLACE FUNCTION increment_token_usage(p_input int, p_output int)
RETURNS void AS $$
DECLARE
  current_month text := to_char(NOW(), 'YYYY-MM');
  current_val jsonb;
BEGIN
  SELECT value INTO current_val FROM app_config WHERE key = 'monthly_token_usage';
  IF current_val IS NULL OR current_val->>'month' != current_month THEN
    UPDATE app_config SET value = jsonb_build_object(
      'month', current_month, 'input', p_input, 'output', p_output,
      'cost_usd', ROUND(((p_input * 0.000003) + (p_output * 0.000015))::numeric, 4)
    ), updated_at = NOW() WHERE key = 'monthly_token_usage';
  ELSE
    UPDATE app_config SET value = jsonb_build_object(
      'month', current_month,
      'input', (current_val->>'input')::int + p_input,
      'output', (current_val->>'output')::int + p_output,
      'cost_usd', ROUND((((current_val->>'input')::int + p_input) * 0.000003 +
                         ((current_val->>'output')::int + p_output) * 0.000015)::numeric, 4)
    ), updated_at = NOW() WHERE key = 'monthly_token_usage';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Wardrobe health by category RPC — called by skill-snapshot.js
CREATE OR REPLACE FUNCTION wardrobe_health_by_category()
RETURNS TABLE(category text, cnt bigint, wear_rate_30d numeric, idle_count bigint) AS $$
BEGIN
  RETURN QUERY
  WITH active AS (
    SELECT id, type FROM garments
    WHERE exclude_from_wardrobe IS NOT TRUE
    AND type NOT IN ('outfit-photo', 'watch')
  ),
  worn_30d AS (
    SELECT DISTINCT g.gid
    FROM history h,
      LATERAL jsonb_array_elements_text(h.payload->'garmentIds') AS g(gid)
    WHERE h.created_at > NOW() - INTERVAL '30 days'
  )
  SELECT
    a.type as category,
    COUNT(*) as cnt,
    ROUND(COUNT(*) FILTER (WHERE w.gid IS NOT NULL)::numeric / NULLIF(COUNT(*), 0), 2) as wear_rate_30d,
    COUNT(*) FILTER (WHERE w.gid IS NULL) as idle_count
  FROM active a
  LEFT JOIN worn_30d w ON w.gid = a.id
  GROUP BY a.type
  ORDER BY cnt DESC;
END;
$$ LANGUAGE plpgsql;

-- Backfill payload_version on existing history entries
UPDATE history
SET payload = jsonb_set(payload, '{payload_version}', '"v1"')
WHERE payload->>'payload_version' IS NULL
AND payload IS NOT NULL;
