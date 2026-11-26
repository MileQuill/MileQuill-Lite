// Agreement hashes are independent of asset inventories and build versions.
export const normalizedText = text => text.replace(/\r\n?/g, '\n');
export async function agreementHash(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedText(text)));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
}
// Verified agreement shipped by the previous version-only receipt workflow.
const legacy = {"1.0":"89f9b9210ab1095598e10c5d0f2c3bb263e77930c375ea6db52b09c67d4e02e5"};
export function receiptKey(appId, version, digest) { return appId + ':terms:' + version + ':' + digest; }
export function hasAgreement(storage, appId, version, digest) {
  const key = receiptKey(appId, version, digest);
  try {
    if (storage.getItem(key) === 'agreed') return true;
    if (legacy[version] === digest && storage.getItem(appId + ':terms:' + version) === 'agreed') {
      storage.setItem(key, 'agreed');
      return true;
    }
  } catch {}
  return false;
}
