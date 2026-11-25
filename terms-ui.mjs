import { appName } from './terms.mjs';

const developmentNotice = 'This app is in Early Development. Errors can happen, and some features may be missing or incomplete. Please report bugs or tell me which features you’d like to see.';
const realRecords = 'You can use this Early Development Build for real-world records. Keep backups and double-check important results.';
const contact = 'NaiomiSummersDevelopment@gmail.com';
const dialog = document.createElement('dialog');
dialog.className = 'terms-sheet';
dialog.setAttribute('aria-labelledby', 'terms-heading');
dialog.innerHTML = `<div class="terms-frame">
  <div class="terms-title"><strong>Early Development</strong> · <a class="privacy-link" href="./privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a><h1 id="terms-heading" tabindex="-1"></h1></div>
  <div class="terms-scroll" tabindex="0" role="region" aria-label="Development notice and full Terms of Service">
    <p class="terms-development"></p><p class="terms-use"></p><p class="terms-feedback"></p><p>When reporting a problem, describe the steps using sample data. Omit private records, passwords, backups and screenshots containing personal information.</p>
    <p class="terms-review"><strong>Draft for publisher review</strong></p><article aria-label="Agreement text"></article>
  </div>
  <div class="terms-foot"><p class="terms-error" role="alert"></p><button type="button"></button></div>
</div>`;
const title = dialog.querySelector('h1');
const button = dialog.querySelector('button');
const error = dialog.querySelector('.terms-error');
dialog.querySelector('.terms-development').textContent = developmentNotice;
dialog.querySelector('.terms-use').textContent = realRecords;
const feedback = dialog.querySelector('.terms-feedback');
for (const label of ['Report a Bug', 'Request a Feature']) {
  const link = document.createElement('a');
  link.textContent = label;
  link.href = 'mailto:' + contact + '?subject=' + encodeURIComponent(appName + ' — ' + label);
  feedback.append(link);
}
export function displayDocument(doc) {
  bar.hidden = false;
  dialog.querySelector('.terms-review').hidden = doc.status !== 'draft';
  dialog.querySelector('article').replaceChildren();
  for (const [index, paragraph] of doc.text.trim().split(/\n\s*\n/).entries()) {
    const heading = index === 0 || (index > 1 && paragraph.length < 80 && !/[.!?]$/.test(paragraph));
    const element = document.createElement(heading ? (index === 0 ? 'h2' : 'h3') : 'p');
    element.textContent = paragraph;
    dialog.querySelector('article').append(element);
  }
}
const bar = document.createElement('div');
bar.hidden = true;
bar.className = 'terms-bar';
bar.innerHTML = '<span><strong>Early Development</strong> Build</span><button type="button">Terms of Service</button><a class="privacy-link" href="./privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>';
bar.querySelector('button').addEventListener('click', () => showTerms());
document.body.prepend(bar);
document.body.append(dialog);

let required = false;
dialog.addEventListener('cancel', event => { if (required) event.preventDefault(); });

export function showTerms(save, message = '') {
  required = typeof save === 'function';
  title.textContent = required ? 'Welcome to ' + appName : appName + ' Terms of Service';
  error.textContent = message;
  button.disabled = false;
  button.textContent = required ? 'I agree to the Terms of Service' : 'Close';
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('.terms-scroll').scrollTop = 0;
  title.focus();
  return new Promise(resolve => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        const result = save ? await save() : undefined;
        required = false;
        dialog.close();
        resolve(result);
      } catch (cause) {
        error.textContent = cause.message || 'Could not save your agreement. Please try again.';
      } finally {
        button.disabled = false;
      }
    };
  });
}
