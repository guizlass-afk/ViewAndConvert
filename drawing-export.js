const scripts=new Map();
function loadScript(url){if(!scripts.has(url))scripts.set(url,new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=url;script.onload=resolve;script.onerror=()=>{scripts.delete(url);script.remove();reject(new Error('Não foi possível carregar a biblioteca de exportação. Verifique a conexão.'));};document.head.append(script);}));return scripts.get(url);}
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export async function exportDrawingPdf(primitives,name){
  await loadScript('https://cdn.jsdelivr.net/npm/jspdf@3.0.3/dist/jspdf.umd.min.js');
  const doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
  doc.setProperties({title:name,creator:'View & Convert'});doc.setDrawColor(23,46,58);doc.setTextColor(23,46,58);doc.setLineWidth(.22);doc.setFont('helvetica','normal');
  for(const p of primitives){if(p.type==='line')doc.line(p.x1,p.y1,p.x2,p.y2);else{doc.setFontSize(p.size*72/25.4);doc.text(p.value,p.x,p.y,{align:p.align==='middle'?'center':p.align==='start'?'left':'right'});}}
  download(doc.output('arraybuffer'),`${name}.pdf`,'application/pdf');
}
export async function exportDrawingDwg(primitives,name){
  const bytes=await new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./drawing-dwg-worker.js',import.meta.url),{type:'module'});
    const timer=setTimeout(()=>{worker.terminate();reject(new Error('O motor DWG demorou demais para responder. Tente novamente.'));},120000);
    const finish=(error,result)=>{clearTimeout(timer);worker.terminate();error?reject(error):resolve(result);};
    worker.onmessage=({data})=>data.error?finish(new Error(data.error)):finish(null,data.buffer);
    worker.onerror=event=>finish(new Error(event.message||'Falha ao carregar o motor DWG.'));
    worker.postMessage(primitives);
  });download(bytes,`${name}.dwg`,'application/acad');
}
