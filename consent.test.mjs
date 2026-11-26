import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {agreementHash,receiptKey,hasAgreement} from './consent.mjs';
const doc=JSON.parse(await readFile(new URL('./terms.json',import.meta.url),'utf8'));
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}};
test('assent uses normalized agreement content, never build bytes',async()=>{
 const hash=await agreementHash(doc.text),s=storage();
 assert.equal(await agreementHash(doc.text.replace(/\n/g,'\r\n')),hash);
 assert.equal(hasAgreement(s,doc.appId,doc.version,hash),false);
 s.setItem(receiptKey(doc.appId,doc.version,hash),'agreed');
 assert.equal(hasAgreement(s,doc.appId,doc.version,hash),true);
 assert.equal(hasAgreement(s,doc.appId,'1.1',hash),false);
 assert.equal(hasAgreement(s,doc.appId,doc.version,await agreementHash(doc.text+'Changed')),false);
});
test('only the verified legacy agreement migrates',async()=>{
 const hash=await agreementHash(doc.text),s=storage();s.setItem(doc.appId+':terms:'+doc.version,'agreed');
 assert.equal(hasAgreement(s,doc.appId,doc.version,await agreementHash(doc.text+'Changed')),false);
 assert.equal(hasAgreement(s,doc.appId,doc.version,hash),true);
 assert.equal(s.getItem(receiptKey(doc.appId,doc.version,hash)),'agreed');
 assert.equal(hasAgreement({getItem(){throw Error('denied')}},doc.appId,doc.version,hash),false);
});
