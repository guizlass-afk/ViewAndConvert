import {t,getLanguage,bindText} from './i18n.js?v=1';
const scripts=new Map();
function loadScript(url){if(!scripts.has(url))scripts.set(url,new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=url;script.onload=resolve;script.onerror=()=>{scripts.delete(url);script.remove();reject(new Error(t("Não foi possível carregar a biblioteca de exportação. Verifique a conexão.")));};document.head.append(script);}));return scripts.get(url);}
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export async function exportDrawingPdf(primitives,name){
  await loadScript('https://cdn.jsdelivr.net/npm/jspdf@3.0.3/dist/jspdf.umd.min.js');
  const doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
  doc.setProperties({title:name,creator:'View & Convert'});doc.setDrawColor(23,46,58);doc.setTextColor(23,46,58);doc.setLineWidth(.22);doc.setFont('helvetica','normal');
  for(const p of primitives){if(p.type==='line')doc.line(p.x1,p.y1,p.x2,p.y2);else{doc.setFontSize(p.size*72/25.4);if(/[^\u0000-\u00ff]/.test(p.value))drawUnicodeText(doc,p);else doc.text(p.value,p.x,p.y,{align:p.align==='middle'?'center':p.align==='start'?'left':'right'});}}
  download(doc.output('arraybuffer'),`${name}.pdf`,'application/pdf');
}
export async function exportDrawingDwg(primitives,name){
  const bytes=await new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./drawing-dwg-worker.js?v=2',import.meta.url),{type:'module'});
    const timer=setTimeout(()=>{worker.terminate();reject(new Error(t("O motor DWG demorou demais para responder. Tente novamente.")));},120000);
    const finish=(error,result)=>{clearTimeout(timer);worker.terminate();error?reject(error):resolve(result);};
    worker.onmessage=({data})=>data.error?finish(new Error(data.error)):finish(null,data.buffer);
    worker.onerror=event=>finish(new Error(event.message||t("Falha ao carregar o motor DWG.")));
    worker.postMessage(primitives);
  });download(bytes,`${name}.dwg`,'application/acad');
}

// Browser shaping keeps CJK, Indic and Arabic text readable in the PDF.
// Geometry and Latin text stay vector; other scripts use transparent 300 dpi labels.
function drawUnicodeText(doc,p){
 const resolution=12,fontSize=p.size*resolution,padding=Math.ceil(fontSize*.5),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 const font=`${fontSize}px Arial, "Nirmala UI", "Segoe UI", sans-serif`;ctx.font=font;
 const width=ctx.measureText(p.value).width;canvas.width=Math.ceil(width+padding*2);canvas.height=Math.ceil(fontSize*2.5);
 ctx.font=font;ctx.fillStyle='#172e3a';ctx.direction=/[\u0600-\u06ff]/.test(p.value)?'rtl':'ltr';ctx.textAlign='left';ctx.fillText(p.value,padding,padding+fontSize);
 const offset=p.align==='middle'?width/2:p.align==='end'?width:0;
 doc.addImage(canvas,'PNG',p.x-(padding+offset)/resolution,p.y-(padding+fontSize)/resolution,canvas.width/resolution,canvas.height/resolution);
}
