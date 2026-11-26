# Terms and development notices

Keep the “Early Development” label, Early Development Build notice, feedback links and Terms of Service available in future releases, including after launch. Change the terms version only when issuing new terms. Review copies require publisher approval.

The current agreement is publisher-approved. Keep legal text in terms.json separate from the MIT license. Assent keys include appId, approved version and SHA-256 of LF-normalized UTF-8 agreement text. consent.mjs pins only the known historical agreement for migrating previous version-only receipts. Never extend that map to a changed agreement merely to avoid a prompt. Decline saves no assent.

After changing shipped files, run `node build-service-worker.mjs`, then `node build-service-worker.mjs --check`. CurbQuill hashes raw file bytes; MileQuill Lite normalizes CRLF to LF for text and hashes PNG bytes unchanged. These inventories identify builds, not agreements. Keep LICENSE and THIRD-PARTY-NOTICES.md in distributions. Run `node --test consent.test.mjs`; browser upgrade evidence is in the portfolio handoff.
