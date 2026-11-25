import { types } from "./model.js";

const databaseName = "milequill-lite-records";

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      for (const name of types) request.result.createObjectStore(name, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other MileQuill Lite tabs and reload."));
  });
}

function transaction(db, stores, mode, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let failure;
    const abort = error => {
      failure = error;
      tx.abort();
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure || tx.error || new Error("Local storage operation was interrupted."));
    try { run(tx, abort); }
    catch (error) { abort(error); }
  });
}

export async function readRecords(db) {
  const records = {};
  await transaction(db, types, "readonly", tx => {
    for (const type of types) {
      const request = tx.objectStore(type).getAll();
      request.onsuccess = () => { records[type] = request.result; };
    }
  });
  return records;
}

export function changeRecord(db, type, next, previous) {
  return transaction(db, [type], "readwrite", (tx, abort) => {
    const store = tx.objectStore(type);
    if (!previous) {
      store.add(next);
      return;
    }
    const lookup = store.get(previous.id);
    lookup.onsuccess = () => {
      if (JSON.stringify(lookup.result) !== JSON.stringify(previous)) {
        abort(new Error("This record changed in another tab. Close this dialog and review the latest entry."));
        return;
      }
      if (next) store.put(next);
      else store.delete(previous.id);
    };
  });
}

export function replaceRecords(db, records) {
  return transaction(db, types, "readwrite", tx => {
    for (const type of types) {
      const store = tx.objectStore(type);
      store.clear();
      for (const record of records[type]) store.add(record);
    }
  });
}
