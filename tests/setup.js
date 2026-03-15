/**
 * Vitest global setup — provides a minimal IndexedDB stub so that
 * src/services/db.js (which calls openDB at module level) does not
 * throw "indexedDB is not defined" in jsdom.
 *
 * We stub the full IDB API surface that the `idb` library checks via instanceof.
 */

if (typeof globalThis.indexedDB === "undefined") {
  const noop = () => {};

  // ── IDB class stubs (idb uses instanceof checks) ────────────────────────
  class IDBRequest {
    constructor() {
      this.result = undefined;
      this.error = null;
      this.readyState = "pending";
      this.onsuccess = null;
      this.onerror = null;
      this.onupgradeneeded = null;
    }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {}
  }

  class IDBOpenDBRequest extends IDBRequest {}

  class IDBCursor {
    advance() {}
    continue() {}
    continuePrimaryKey() {}
    delete() { return new IDBRequest(); }
    update() { return new IDBRequest(); }
  }

  class IDBCursorWithValue extends IDBCursor {}

  class IDBTransaction {
    constructor() {
      this.objectStoreNames = [];
      this.mode = "readonly";
      this.db = null;
      this.error = null;
      this.onabort = null;
      this.oncomplete = null;
      this.onerror = null;
    }
    abort() {}
    objectStore() { return new IDBObjectStore(); }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {}
  }

  class IDBIndex {
    get() { return new IDBRequest(); }
    getKey() { return new IDBRequest(); }
    getAll() { return new IDBRequest(); }
    getAllKeys() { return new IDBRequest(); }
    count() { return new IDBRequest(); }
    openCursor() { return new IDBRequest(); }
    openKeyCursor() { return new IDBRequest(); }
  }

  class IDBObjectStore {
    constructor() {
      this.indexNames = [];
      this.autoIncrement = false;
    }
    put() { return new IDBRequest(); }
    add() { return new IDBRequest(); }
    delete() { return new IDBRequest(); }
    clear() { return new IDBRequest(); }
    get() { return new IDBRequest(); }
    getKey() { return new IDBRequest(); }
    getAll() { return new IDBRequest(); }
    getAllKeys() { return new IDBRequest(); }
    count() { return new IDBRequest(); }
    openCursor() { return new IDBRequest(); }
    openKeyCursor() { return new IDBRequest(); }
    index() { return new IDBIndex(); }
    createIndex() { return new IDBIndex(); }
    deleteIndex() {}
  }

  class IDBDatabase {
    constructor() {
      this.name = "";
      this.version = 0;
      this.objectStoreNames = { contains: () => false, length: 0 };
    }
    createObjectStore() { return new IDBObjectStore(); }
    deleteObjectStore() {}
    transaction() { return new IDBTransaction(); }
    close() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {}
  }

  class IDBKeyRange {
    static bound() { return new IDBKeyRange(); }
    static only() { return new IDBKeyRange(); }
    static lowerBound() { return new IDBKeyRange(); }
    static upperBound() { return new IDBKeyRange(); }
  }

  // ── indexedDB global ────────────────────────────────────────────────────
  globalThis.indexedDB = {
    open(name, version) {
      const db = new IDBDatabase();
      db.name = name;
      db.version = version || 1;

      const req = new IDBOpenDBRequest();
      req.result = db;
      req.readyState = "done";

      // Fire upgrade + success asynchronously (like real IDB)
      queueMicrotask(() => {
        // Upgrade
        const tx = new IDBTransaction();
        tx.db = db;
        if (req.onupgradeneeded) {
          req.onupgradeneeded({ target: req, oldVersion: 0, newVersion: version, transaction: tx });
        }
        // Success
        if (req.onsuccess) req.onsuccess({ target: req });
      });

      return req;
    },
    deleteDatabase() {
      const req = new IDBOpenDBRequest();
      req.readyState = "done";
      queueMicrotask(() => { if (req.onsuccess) req.onsuccess({ target: req }); });
      return req;
    },
    cmp: () => 0,
  };

  // Expose all IDB classes globally (idb uses instanceof checks)
  globalThis.IDBRequest = IDBRequest;
  globalThis.IDBOpenDBRequest = IDBOpenDBRequest;
  globalThis.IDBCursor = IDBCursor;
  globalThis.IDBCursorWithValue = IDBCursorWithValue;
  globalThis.IDBTransaction = IDBTransaction;
  globalThis.IDBIndex = IDBIndex;
  globalThis.IDBObjectStore = IDBObjectStore;
  globalThis.IDBDatabase = IDBDatabase;
  globalThis.IDBKeyRange = IDBKeyRange;
}
