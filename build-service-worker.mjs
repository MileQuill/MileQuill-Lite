// Asset integrity is separate from the normalized agreement-content hash.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url));
const files=["index.html","styles.css","app.js","model.js","db.js","offline.js","manifest.webmanifest","assets/icon-192.png","assets/icon-512.png","assets/maskable-512.png","assets/touch.png","terms.mjs","terms-ui.mjs","terms-entry.mjs","terms.css","terms.json","privacy.html","privacy.css","consent.mjs","LICENSE","THIRD-PARTY-NOTICES.md"];
const digest=b=>createHash('sha256').update(b).digest('hex');
const hashes=Object.fromEntries(files.map(file=>{let bytes=fs.readFileSync(path.join(root,file));if(!file.endsWith('.png'))bytes=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'));return [file,digest(bytes)];}));
const version=digest(JSON.stringify(hashes)).slice(0,20);
const sw=path.join(root,'sw.js');let text=fs.readFileSync(sw,'utf8');
text=text.replace(/const release = .*;/,'const release = '+JSON.stringify({version,assets:hashes})+';');
if(process.argv.includes('--check')){if(text!==fs.readFileSync(sw,'utf8'))throw Error('Service-worker inventory is stale');}else fs.writeFileSync(sw,text);
console.log('MileQuill-Lite asset inventory '+version);
