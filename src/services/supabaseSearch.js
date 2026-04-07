/**
 * Garment search — pg_trgm fuzzy search and pgvector semantic search.
 */

import { supabase } from "./supabaseClient.js";
import { IS_PLACEHOLDER } from "./supabaseSyncState.js";

// ---------------------------------------------------------------------------
// pg_trgm fuzzy search — uses GIN index on name/color/type
// Falls back gracefully if DB unavailable. Use when wardrobe > 100 garments
// and you don't want to ship all rows to the client on every keystroke.
// ---------------------------------------------------------------------------
export async function fuzzySearchGarments(query, limit = 12) {
  if (IS_PLACEHOLDER || !query?.trim()) return [];
  try {
    const q = query.trim();
    const { data, error } = await supabase
      .from("garments")
      .select("id,name,type,color,photo_url,thumbnail_url,formality,brand")
      .or(`name.ilike.%${q}%,color.ilike.%${q}%,type.ilike.%${q}%`)
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(row => ({
      ...row,
      thumbnail: row.photo_url ?? row.thumbnail_url ?? null,
    }));
  } catch (e) {
    console.warn("[supabaseSync] fuzzySearchGarments failed:", e.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Vector semantic search — calls match_garments RPC (pgvector cosine distance).
// Requires embeddings to have been generated via generate-embedding function.
// Returns garments ordered by semantic similarity to the query embedding.
// ---------------------------------------------------------------------------
export async function semanticSearchGarments(queryEmbedding, limit = 10) {
  if (IS_PLACEHOLDER || !queryEmbedding?.length) return [];
  try {
    const { data, error } = await supabase.rpc("match_garments", {
      query_embedding: queryEmbedding,
      match_count: limit,
    });
    if (error) throw error;
    return (data ?? []).map(row => ({
      ...row,
      thumbnail: row.photo_url ?? row.thumbnail_url ?? null,
      similarity: row.similarity,
    }));
  } catch (e) {
    console.warn("[supabaseSync] semanticSearchGarments failed:", e.message);
    return [];
  }
}
