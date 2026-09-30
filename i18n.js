const response=await fetch(new URL('./locales/messages.json?v=1',import.meta.url));
if(!response.ok)throw new Error('Translation catalog unavailable');
export const messages=await response.json();
export const languageMeta={
 'pt-BR':{label:'Português',flag:'br'},'en-US':{label:'English',flag:'us'},'es-ES':{label:'Español',flag:'es'},
 'zh-CN':{label:'中文',flag:'cn'},'hi-IN':{label:'हिन्दी',flag:'in'},'ar-SA':{label:'العربية',flag:'sa'},
 'fr-FR':{label:'Français',flag:'fr'},'bn-BD':{label:'বাংলা',flag:'bd'},'ru-RU':{label:'Русский',flag:'ru'},
 'de-DE':{label:'Deutsch',flag:'de'},'it-IT':{label:'Italiano',flag:'it'},'ja-JP':{label:'日本語',flag:'jp'}
};
let language='pt-BR';try{const saved=localStorage.getItem('viewconvert-language');if(languageMeta[saved])language=saved;}catch{}
export const getLanguage=()=>language;
const reverse=new Map(),patterns=[];
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
for(const dictionary of Object.values(messages))for(const [key,value]of Object.entries(dictionary)){
 if(!key.includes('{'))reverse.set(value,key);
 else{const slots=[];let cursor=0,pattern='^';for(const match of value.matchAll(/\{(\d+)\}/g)){pattern+=escape(value.slice(cursor,match.index))+'(.*?)';slots.push(Number(match[1]));cursor=match.index+match[0].length;}pattern+=escape(value.slice(cursor))+'$';patterns.push({key,slots,regex:new RegExp(pattern,'s')});}
}
export function t(source,values){
 if(source==null)return '';source=String(source);let key=source;
 if(!Object.hasOwn(messages['pt-BR'],key)){
  key=reverse.get(source);
  if(!key){for(const item of patterns){const match=source.match(item.regex);if(match){key=item.key;values=[];item.slots.forEach((slot,i)=>values[slot]=match[i+1]);break;}}}
 }
 if(!key)return source;
 const template=messages[language][key]??messages['pt-BR'][key]??source;
 return template.replace(/\{(\d+)\}/g,(match,index)=>values?.[index]??match);
}
const bindings=new WeakMap(),staticText=[],staticAttributes=[];
// Bind only application-owned labels. File names and user annotations remain verbatim.
export function bindText(element,render){bindings.set(element,render);element.dataset.localizedText="";element.textContent=render();}
function applyStatic(){
 for(const {node,source}of staticText)if(node.isConnected)node.nodeValue=source.replace(source.trim(),t(source.trim()));
 for(const {node,attribute,source}of staticAttributes)if(node.isConnected)node.setAttribute(attribute,t(source));
}
function menu(open){const panel=document.getElementById('languageMenu'),button=document.getElementById('languageButton');panel.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open)panel.querySelector(`[data-language="${language}"]`)?.focus();}
export function setLanguage(value,persist=true){
 if(!languageMeta[value])return;language=value;document.documentElement.lang=value;document.documentElement.dir=value==='ar-SA'?'rtl':'ltr';
 applyStatic();document.querySelectorAll('[data-localized-text]').forEach(node=>{const render=bindings.get(node);if(render)node.textContent=render();});
 const info=languageMeta[value];document.getElementById('languageSelect').value=value;document.getElementById('currentLanguage').textContent=info.label;document.getElementById('currentFlag').src=`flags/${info.flag}.svg`;
 document.getElementById('languageButton').setAttribute('aria-label',`${t('Idioma')}: ${info.label}`);document.getElementById('languageMenu').setAttribute('aria-label',t('Idioma'));
 document.querySelectorAll('[data-language]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.language===value)));
 if(persist)try{localStorage.setItem('viewconvert-language',value);}catch{}
 document.dispatchEvent(new Event('languagechange'));
}
export function initLanguage(){
 const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);let node;
 while(node=walker.nextNode())if(!node.parentElement.closest('script,style,#languagePicker')&&Object.hasOwn(messages['pt-BR'],node.nodeValue.trim()))staticText.push({node,source:node.nodeValue});
 document.querySelectorAll('[title],[aria-label],[placeholder],meta[name="description"]').forEach(node=>{for(const attribute of ['title','aria-label','placeholder','content']){const source=node.getAttribute(attribute);if(source&&Object.hasOwn(messages['pt-BR'],source))staticAttributes.push({node,attribute,source});}});
 const select=document.getElementById('languageSelect'),button=document.getElementById('languageButton'),list=document.getElementById('languageMenu');
 select.addEventListener('change',()=>setLanguage(select.value));button.addEventListener('click',()=>menu(list.hidden));
 list.addEventListener('click',event=>{const option=event.target.closest('[data-language]');if(option){setLanguage(option.dataset.language);menu(false);button.focus();}});
 document.addEventListener('click',event=>{if(!event.target.closest('#languagePicker'))menu(false);});
 document.getElementById('languagePicker').addEventListener('keydown',event=>{
  if(event.key==='Escape'){menu(false);button.focus();event.stopPropagation();}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();if(list.hidden){menu(true);return;}const buttons=[...list.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}
 });
 setLanguage(language,false);
}
