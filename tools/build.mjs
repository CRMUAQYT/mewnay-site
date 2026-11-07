// Builds the landing page in each language from page.html and copy.json:
//   node tools/build.mjs
// Writes /index.html (Russian), /kk/index.html and /en/index.html.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const tools = dirname(fileURLToPath(import.meta.url));
const root = join(tools, '..');
const template = readFileSync(join(tools, 'page.html'), 'utf8');
const copy = JSON.parse(readFileSync(join(tools, 'copy.json'), 'utf8'));

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The root page is Russian; a first visit from a Kazakh or other-language phone moves to its page.
const redirect = `<script>try{var q=location.search,s=localStorage.getItem('mewnay-lang'),m=/[?&]lang=(ru|kk|en)/.exec(q);if(m){localStorage.setItem('mewnay-lang',m[1]);s=m[1];}var n=((navigator.languages&&navigator.languages[0])||navigator.language||'ru').slice(0,2).toLowerCase();var to=s||(n==='kk'?'kk':(n==='ru'||n==='uk'||n==='be'||n==='uz'||n==='ky')?'ru':'en');if(to!=='ru')location.replace('/'+to+'/'+location.hash);}catch(e){}</script>`;

for (const [lang, strings] of Object.entries(copy)) {
  const values = { ...strings, redirect: lang === 'ru' ? redirect : '', cur: { ru: '', kk: '', en: '' } };
  values.cur[lang] = 'is-on';
  const items = strings.ticker.map((w, i) => `<span class="${i % 2 ? 'ghost' : ''}">${escape(w)}</span><i></i>`).join('');
  values.tickerHtml = items + items;
  const html = template.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    const value = key.split('.').reduce((node, part) => node?.[part], values);
    if (value === undefined) throw new Error(`${lang}: missing ${key}`);
    return key === 'redirect' || key === 'tickerHtml' ? value : escape(value);
  });
  const file = lang === 'ru' ? join(root, 'index.html') : join(root, lang, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  console.log('built', file.replace(root, '').replace(/\\/g, '/'));
}
