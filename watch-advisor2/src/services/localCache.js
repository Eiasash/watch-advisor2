import { openDB } from "idb";

const dbPromise = openDB("watch-advisor2", 1, {
  upgrade(db) {
    db.createObjectStore("state");
    db.createObjectStore("images");
  }
});

export async function getCachedState() {
  const db = await dbPromise;
  return (await db.get("state", "app")) || { watches: [], garments: [], history: [] };
}

export async function setCachedState(state) {
  const db = await dbPromise;
  await db.put("state", state, "app");
}

export async function saveImage(key, blob) {
  const db = await dbPromise;
  await db.put("images", blob, key);
}
