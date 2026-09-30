(() => {
 'use strict';
 const key='factorytoolbox-theme',root=document.documentElement,system=matchMedia('(prefers-color-scheme: dark)');
 let preference=null;try{const value=localStorage.getItem(key);if(value==='light'||value==='dark')preference=value;}catch{}
 const labels={
 'pt-BR':['Ativar tema escuro','Ativar tema claro'],'en-US':['Switch to dark theme','Switch to light theme'],
 'es-ES':['Activar tema oscuro','Activar tema claro'],'zh-CN':['切换到深色主题','切换到浅色主题'],
 'hi-IN':['डार्क थीम चालू करें','लाइट थीम चालू करें'],'ar-SA':['تفعيل المظهر الداكن','تفعيل المظهر الفاتح'],
 'fr-FR':['Activer le thème sombre','Activer le thème clair'],'bn-BD':['ডার্ক থিম চালু করুন','লাইট থিম চালু করুন'],
 'ru-RU':['Включить тёмную тему','Включить светлую тему'],'de-DE':['Dunkles Design aktivieren','Helles Design aktivieren'],
 'it-IT':['Attiva tema scuro','Attiva tema chiaro'],'ja-JP':['ダークテーマに切り替え','ライトテーマに切り替え']
 };
 let button;
 function refreshLabel(){if(!button)return;const dark=root.dataset.theme==='dark',label=(labels[root.lang]||labels['pt-BR'])[dark?1:0];button.setAttribute('aria-label',label);button.title=label;button.setAttribute('aria-pressed',String(dark));}
 function apply(){const theme=preference||(system.matches?'dark':'light');root.dataset.theme=theme;refreshLabel();document.dispatchEvent(new CustomEvent('themechange',{detail:{theme,dark:theme==='dark'}}));}
 apply();
 system.addEventListener('change',()=>{if(!preference)apply();});
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null){preference=event.newValue==='light'||event.newValue==='dark'?event.newValue:null;apply();}});
 new MutationObserver(refreshLabel).observe(root,{attributes:true,attributeFilter:['lang']});
 document.addEventListener('DOMContentLoaded',()=>{
  const picker=document.getElementById('languagePicker');if(!picker)return;
  button=document.createElement('button');button.type='button';button.id='themeToggle';button.className='theme-toggle';
  button.innerHTML='<span class="theme-thumb" aria-hidden="true"></span><svg class="theme-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg><svg class="theme-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15a8 8 0 0 1-11-11A8.5 8.5 0 1 0 20 15Z"/></svg>';
  picker.before(button);refreshLabel();button.addEventListener('click',()=>{preference=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem(key,preference);}catch{}apply();});
 });
})();
