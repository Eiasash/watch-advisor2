/**
 * Supabase keep-alive — prevents free tier pause after 7 days inactivity.
 * Scheduled: every 5 days via netlify.toml
 * [functions.supabase-keepalive]
 *   schedule = "0 6 */5 * *"
 */
import { createClient } from '@supabase/supabase-js';

export async function handler() {
  // SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in Netlify dashboard
  // (environment variables). VITE_* build-time vars are NOT available at
  // function runtime — they are here only as a last-ditch fallback for local dev.
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('[keepalive] MISSING env vars — set SUPABASE_URL + SUPABASE_SERVICE_KEY in Netlify dashboard');
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars' }) };
  }
  const supabase = createClient(url, key);
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('app_config')
    .upsert({ key: 'supabase_keepalive_last', value: JSON.stringify(now), updated_at: now }, { onConflict: 'key' });
  if (error) {
    console.error('[keepalive] Upsert error:', error.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: error.message, pingedAt: now }) };
  }
  console.log('[keepalive] Supabase pinged successfully at', now);
  return { statusCode: 200, body: JSON.stringify({ ok: true, pingedAt: now }) };
}
