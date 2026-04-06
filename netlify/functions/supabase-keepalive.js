/**
 * Supabase keep-alive — prevents free tier pause after 7 days inactivity.
 * Scheduled: every 5 days via netlify.toml
 * [functions.supabase-keepalive]
 *   schedule = "0 6 */5 * *"
 */
import { createClient } from '@supabase/supabase-js';

export async function handler() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('[keepalive] Missing SUPABASE_URL or key');
    return { statusCode: 500, body: 'Missing env vars' };
  }
  const supabase = createClient(url, key);
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('app_config')
    .upsert({ key: 'supabase_keepalive_last', value: JSON.stringify(now), updated_at: now }, { onConflict: 'key' });
  if (error) console.error('[keepalive] Upsert error:', error.message);
  console.log('[keepalive] Supabase pinged', now);
  return { statusCode: 200, body: JSON.stringify({ ok: true, pingedAt: now }) };
}
