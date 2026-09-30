import {t,getLanguage,bindText} from './i18n.js?v=1';
import {prepareDrawingGeometry,projectDrawingView} from './drawing-projection.js?v=2';
import {exportDrawingPdf,exportDrawingDwg} from './drawing-export.js?v=2';
const NS='http://www.w3.org/2000/svg',factors={mm:1,cm:10,in:25.4,m:1000};
const el=(tag,attrs={},text)=>{const node=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);if(text!==undefined)node.textContent=text;return node;};
const line=(x1,y1,x2,y2)=>({type:'line',x1,y1,x2,y2});
const text=(x,y,value,size=2.6,align='middle')=>({type:'text',x,y,value,size,align});
export function linearValue(a,b,direction,isometric=false){return direction==='horizontal'?Math.abs(b.x-a.x):direction==='vertical'?Math.abs(b.y-a.y):isometric?Math.hypot(...a.world.map((v,i)=>b.world[i]-v)):Math.hypot(b.x-a.x,b.y-a.y);}
export function angleValue(a,b,c,isometric=false){const u=isometric?a.world.map((v,i)=>v-b.world[i]):[a.x-b.x,a.y-b.y],v=isometric?c.world.map((v,i)=>v-b.world[i]):[c.x-b.x,c.y-b.y],d=Math.hypot(...u)*Math.hypot(...v);return d?Math.acos(Math.max(-1,Math.min(1,u.reduce((sum,x,i)=>sum+x*v[i],0)/d)))*180/Math.PI:NaN;}
function arrows(output,a,b){const length=Math.hypot(b.x-a.x,b.y-a.y);if(!length)return;const x=(b.x-a.x)/length,y=(b.y-a.y)/length;for(const [p,sign]of [[a,1],[b,-1]]){output.push(line(p.x,p.y,p.x+sign*x*1.6-y*.5,p.y+sign*y*1.6+x*.5),line(p.x,p.y,p.x+sign*x*1.6+y*.5,p.y+sign*y*1.6-x*.5));}}

export function createDrawingSheet({getModel,getName,onLayout=()=>{}}){
  const $=id=>document.getElementById(id),sheet=$('drawingSheet'),panel=$('drawingPanel');
  let items=[],history=[],scale=1,unit='mm',tool='move',selection=null,picks=[],source=null,cache=new Map(),job=null,nextId=1,drag=null;
  const num=v=>new Intl.NumberFormat(getLanguage(),{maximumFractionDigits:2}).format(v);
  const length=v=>`${num(v/factors[unit])} ${unit==='in'?t("pol"):unit}`;
  const scaleText=()=>scale>=1?`${num(scale)}:1`:`1:${num(1/scale)}`;
  const snapshot=()=>({scale,items:items.map(v=>({...v,annotations:v.annotations.map(a=>({...a}))}))});
  function save(previous=snapshot()){history.push(previous);if(history.length>25)history.shift();}
  function hint(message){bindText($('drawingHint'),()=>t(message));}
  function prompt(){
    if(!items.length){hint(t("Escolha uma vista e clique em Inserir vista."));return;}
    const messages={move:t("Arraste as vistas ou as cotas para posicionar. Clique para selecionar e excluir."),linear:[t("Clique no primeiro vértice da vista."),t("Clique no segundo vértice da mesma vista."),t("Clique onde deseja posicionar a cota.")][picks.length],angle:[t("Clique na primeira extremidade do ângulo."),t("Clique no vértice central do ângulo."),t("Clique na segunda extremidade do ângulo."),t("Clique para posicionar o arco e o valor.")][picks.length],diameter:t("Anotação manual: digite o valor, clique na geometria e depois na posição do texto."),radius:t("Anotação manual: digite o valor, clique na geometria e depois na posição do texto.")};hint(messages[tool]);
  }
  function setTool(value){tool=value;picks=[];document.querySelectorAll('[data-drawing-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.drawingTool===tool)));$('linearOptions').hidden=tool!=='linear';$('annotationOptions').hidden=!['radius','diameter'].includes(tool);render();prompt();}
  function annotationPrimitives(view,annotation){
    const out=[],p=annotation.points.map(p=>({x:p.x*scale,y:p.y*scale})),label={x:annotation.label.x*scale,y:annotation.label.y*scale};
    if(annotation.kind==='linear'){
      let a,b,tx,ty;const [first,last]=p;
      if(annotation.direction==='horizontal'){a={x:first.x,y:label.y};b={x:last.x,y:label.y};tx=(a.x+b.x)/2;ty=label.y-1.6;}
      else if(annotation.direction==='vertical'){a={x:label.x,y:first.y};b={x:label.x,y:last.y};tx=label.x+3;ty=(a.y+b.y)/2;}
      else{const dx=last.x-first.x,dy=last.y-first.y,d=Math.hypot(dx,dy),nx=-dy/d,ny=dx/d,offset=(label.x-first.x)*nx+(label.y-first.y)*ny;a={x:first.x+nx*offset,y:first.y+ny*offset};b={x:last.x+nx*offset,y:last.y+ny*offset};tx=(a.x+b.x)/2+nx*2;ty=(a.y+b.y)/2+ny*2;}
      out.push(line(first.x,first.y,a.x,a.y),line(last.x,last.y,b.x,b.y),line(a.x,a.y,b.x,b.y));arrows(out,a,b);out.push(text(tx,ty,length(annotation.value)));
    }else if(annotation.kind==='angle'){
      const [a,c,b]=p,r=Math.max(4,Math.hypot(label.x-c.x,label.y-c.y)),start=Math.atan2(a.y-c.y,a.x-c.x);let delta=Math.atan2(b.y-c.y,b.x-c.x)-start;while(delta>Math.PI)delta-=2*Math.PI;while(delta<-Math.PI)delta+=2*Math.PI;
      const arc=Array.from({length:33},(_,i)=>({x:c.x+r*Math.cos(start+delta*i/32),y:c.y+r*Math.sin(start+delta*i/32)}));
      for(let i=1;i<arc.length;i++)out.push(line(arc[i-1].x,arc[i-1].y,arc[i].x,arc[i].y));out.push(line(c.x,c.y,arc[0].x,arc[0].y),line(c.x,c.y,arc[32].x,arc[32].y));out.push(text(c.x+(r+3)*Math.cos(start+delta/2),c.y+(r+3)*Math.sin(start+delta/2),`${num(annotation.value)}°`));
    }else{out.push(line(p[0].x,p[0].y,label.x,label.y));arrows(out,p[0],label);out.push(text(label.x,label.y-2,`${annotation.kind==='diameter'?'Ø':'R'} ${annotation.value}`));}
    return out;
  }
  function framePrimitives(){
    const out=[line(10,10,287,10),line(287,10,287,200),line(287,200,10,200),line(10,200,10,10),line(10,185,287,185),line(206,185,206,200),text(14,191,(getName()||t("Modelo")).slice(0,52),3,'start'),text(14,196,t('Vistas da malha • cotas em {0}',[unit==='in'?t('pol'):unit]),2.3,'start'),text(211,191,`A4 | ${t('Escala {0}',[scaleText()])}`,2.7,'start'),text(211,196,'View & Convert',2.4,'start')];return out;
  }
  function primitives(){const out=framePrimitives();for(const view of items){const local=view.data.segments.map(s=>line(s[0]*scale,s[1]*scale,s[2]*scale,s[3]*scale));local.push(text(0,view.data.maxY*scale+5,t(view.data.name),2.7));for(const a of view.annotations)local.push(...annotationPrimitives(view,a));out.push(...local.map(p=>p.type==='line'?{...p,x1:p.x1+view.x,y1:p.y1+view.y,x2:p.x2+view.x,y2:p.y2+view.y}:{...p,x:p.x+view.x,y:p.y+view.y}));}return out;}
  function drawPrimitives(parent,list){
    const lines=list.filter(p=>p.type==='line');if(lines.length)parent.append(el('path',{d:lines.map(p=>`M${p.x1} ${p.y1}L${p.x2} ${p.y2}`).join(''),'fill':'none','stroke':'#172e3a','stroke-width':'.22'}));
    for(const p of list)if(p.type==='text')parent.append(el('text',{x:p.x,y:p.y,'font-family':'Arial, sans-serif','font-size':p.size,'text-anchor':p.align,'fill':'#172e3a','stroke':'white','stroke-width':'.6','paint-order':'stroke'},p.value));
  }
  function render(){
    sheet.replaceChildren(el('rect',{width:297,height:210,fill:'white'}));drawPrimitives(sheet,framePrimitives());
    for(const view of items){
      const group=el('g',{'data-sheet-view':view.id,'data-kind':view.kind,transform:`translate(${view.x} ${view.y})`});const d=view.data;
      const box={x:Math.min(-8,d.minX*scale)-3,y:Math.min(-8,d.minY*scale)-3,width:Math.max(8,d.maxX*scale)-Math.min(-8,d.minX*scale)+6,height:Math.max(8,d.maxY*scale)-Math.min(-8,d.minY*scale)+12};
      group.append(el('rect',{...box,fill:'transparent',stroke:selection?.view===view.id?'#10958d':'none','stroke-width':'.3','stroke-dasharray':'1.5 1',class:'drawing-selection'}));
      drawPrimitives(group,d.segments.map(s=>line(s[0]*scale,s[1]*scale,s[2]*scale,s[3]*scale)));drawPrimitives(group,[text(0,d.maxY*scale+5,t(d.name),2.7)]);
      for(const annotation of view.annotations){const child=el('g',{'data-sheet-annotation':annotation.id});drawPrimitives(child,annotationPrimitives(view,annotation));if(selection?.annotation===annotation.id)child.setAttribute('opacity','.6');group.append(child);}
      sheet.append(group);
    }
    const preview=el('g',{class:'drawing-preview','pointer-events':'none'});for(const p of picks){const view=items.find(v=>v.id===p.view);if(view)preview.append(el('circle',{cx:view.x+p.point.x*scale,cy:view.y+p.point.y*scale,r:1.1,fill:'#ff6b2c'}));}sheet.append(preview);
    $('undoDrawing').disabled=!history.length;$('deleteDrawing').disabled=!selection;
  }
  function pointOnSheet(event){const p=sheet.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(sheet.getScreenCTM().inverse());}
  function snap(view,p){const threshold=10*297/sheet.getBoundingClientRect().width;let best=null,dist=threshold;for(const point of view.data.points){const d=Math.hypot(view.x+point.x*scale-p.x,view.y+point.y*scale-p.y);if(d<dist){best=point;dist=d;}}return best;}
  sheet.setAttribute('tabindex','0');
  sheet.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;sheet.focus({preventScroll:true});const target=event.target.closest('[data-sheet-view]');
    const needed=tool==='linear'?2:tool==='angle'?3:1,placing=tool!=='move'&&picks.length===needed;
    const view=items.find(v=>v.id===(placing?picks[0].view:Number(target?.dataset.sheetView))),p=pointOnSheet(event);
    if(!view){selection=null;render();return;}
    if(tool==='move'){
      const annotationId=Number(event.target.closest('[data-sheet-annotation]')?.dataset.sheetAnnotation)||null;selection={view:view.id,annotation:annotationId};const annotation=view.annotations.find(a=>a.id===annotationId);
      drag={view,annotation,start:p,x:annotation?annotation.label.x:view.x,y:annotation?annotation.label.y:view.y,before:snapshot(),moved:false};sheet.setPointerCapture(event.pointerId);render();return;
    }
    if(picks.length&&picks[0].view!==view.id){hint(t("Selecione os pontos na mesma vista. Escape cancela a cota em andamento."));return;}
    const count=tool==='linear'?2:tool==='angle'?3:1;
    if(picks.length<count){
      const point=['linear','angle'].includes(tool)?snap(view,p):{x:(p.x-view.x)/scale,y:(p.y-view.y)/scale};
      if(!point){hint(t("Aproxime o cursor de um vértice visível até aparecer o destaque."));return;}
      if(picks.some(existing=>Math.hypot(point.x-existing.point.x,point.y-existing.point.y)<1e-8)){hint(t("Escolha um vértice diferente."));return;}
      picks.push({view:view.id,point});selection={view:view.id};render();prompt();return;
    }
    const points=picks.map(p=>p.point),direction=$('linearDirection').value;
    const value=tool==='linear'?linearValue(points[0],points[1],direction,view.kind==='iso'):tool==='angle'?angleValue(...points,view.kind==='iso'):$('drawingAnnotation').value.trim();
    if((typeof value==='number'&&(!Number.isFinite(value)||value<1e-8))||!String(value).trim()){hint(t("Medida inválida. Para raio ou diâmetro, informe o valor manual. Escape reinicia a seleção."));return;}
    save();const annotation={id:nextId++,kind:tool,points,value,direction,label:{x:(p.x-view.x)/scale,y:(p.y-view.y)/scale}};view.annotations.push(annotation);selection={view:view.id,annotation:annotation.id};picks=[];render();prompt();
  });
  sheet.addEventListener('pointermove',event=>{
    const p=pointOnSheet(event);
    if(drag){const dx=p.x-drag.start.x,dy=p.y-drag.start.y;drag.moved||=Math.hypot(dx,dy)>.5;
      if(drag.annotation)drag.annotation.label={x:drag.x+dx/scale,y:drag.y+dy/scale};
      else{const d=drag.view.data;drag.view.x=Math.max(12-d.minX*scale,Math.min(285-d.maxX*scale,drag.x+dx));drag.view.y=Math.max(12-d.minY*scale,Math.min(177-d.maxY*scale,drag.y+dy));}render();return;}
    sheet.querySelector('[data-snap]')?.remove();if(!['linear','angle'].includes(tool))return;
    const target=event.target.closest('[data-sheet-view]'),view=items.find(v=>v.id===Number(target?.dataset.sheetView));if(!view)return;const point=snap(view,p);if(point)sheet.append(el('circle',{'data-snap':'',class:'drawing-preview',cx:view.x+point.x*scale,cy:view.y+point.y*scale,r:1.4,fill:'white',stroke:'#ff6b2c','stroke-width':'.5','pointer-events':'none'}));
  });
  function endDrag(){if(drag?.moved)save(drag.before);drag=null;render();}
  sheet.addEventListener('pointerup',endDrag);sheet.addEventListener('pointercancel',endDrag);
  function removeSelection(){if(!selection)return;save();if(selection.annotation){const v=items.find(v=>v.id===selection.view);v.annotations=v.annotations.filter(a=>a.id!==selection.annotation);}else items=items.filter(v=>v.id!==selection.view);selection=null;picks=[];render();prompt();}
  $('deleteDrawing').addEventListener('click',removeSelection);
  $('undoDrawing').addEventListener('click',()=>{const previous=history.pop();if(!previous)return;items=previous.items;scale=previous.scale;$('drawingScale').value=String(scale);selection=null;picks=[];render();prompt();});
  panel.addEventListener('keydown',event=>{if(event.target.matches('input,select'))return;if(event.key==='Escape'){picks=[];render();prompt();}if(event.key==='Delete'){event.preventDefault();removeSelection();}if((event.ctrlKey||event.metaKey)&&event.key==='z'){event.preventDefault();$('undoDrawing').click();}});
  document.querySelectorAll('[data-drawing-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.drawingTool)));
  $('linearDirection').addEventListener('change',()=>{picks=[];render();prompt();});
  const paperWrap=sheet.parentElement;
  function fitPaper(){
    if(panel.hidden)return;
    const zoom=Number($('drawingZoom').value)||1;
    paperWrap.classList.toggle('is-zoomed',zoom>1);
    const style=getComputedStyle(paperWrap),width=paperWrap.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),height=paperWrap.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
    if(width<=0||height<=0)return;
    const fittedWidth=Math.min(width,height*297/210),paperWidth=fittedWidth*zoom,paperHeight=paperWidth*210/297;
    sheet.style.width=`${paperWidth}px`;sheet.style.height=`${paperHeight}px`;sheet.style.marginTop=`${Math.max(0,(height-paperHeight)/2)}px`;
    if(zoom===1){paperWrap.scrollTop=0;paperWrap.scrollLeft=0;}
  }
  new ResizeObserver(fitPaper).observe(paperWrap);
  $('drawingZoom').addEventListener('change',fitPaper);
  $('drawingUnit').addEventListener('change',()=>{unit=$('drawingUnit').value;render();});
  $('drawingScale').addEventListener('change',()=>{
    const value=Number($('drawingScale').value);if(items.some(v=>(v.data.maxX-v.data.minX)*value>260||(v.data.maxY-v.data.minY)*value>155)){hint(t("Essa escala ultrapassa a área útil da folha. Escolha uma escala menor."));$('drawingScale').value=String(scale);return;}
    save();scale=value;picks=[];for(const view of items){const d=view.data;view.x=Math.max(12-d.minX*scale,Math.min(285-d.maxX*scale,view.x));view.y=Math.max(12-d.minY*scale,Math.min(177-d.maxY*scale,view.y));}render();prompt();
  });
  $('addDrawingView').addEventListener('click',async()=>{
    const model=getModel();if(!model||job)return;const kind=$('drawingView').value,existing=items.find(v=>v.kind===kind);if(existing){selection={view:existing.id};render();hint(t("Essa vista já está na folha. Você pode arrastá-la para reposicionar."));return;}
    const controller=new AbortController();job=controller;$('addDrawingView').disabled=true;hint(t("Preparando a projeção e verificando arestas visíveis…"));
    try{
      if(!source){source=await prepareDrawingGeometry(model,controller.signal);const auto=45/source.size,values=[...$('drawingScale').options].map(o=>Number(o.value)).sort((a,b)=>b-a);scale=values.find(v=>v<=auto)||auto;if(!values.includes(scale))$('drawingScale').add(new Option(`1:${num(1/scale)}`,String(scale)));$('drawingScale').value=String(scale);}
      if(!cache.has(kind))cache.set(kind,await projectDrawingView(source,kind,controller.signal));controller.signal.throwIfAborted();save();
      const index=items.length;const view={id:nextId++,kind,data:cache.get(kind),x:55+(index%3)*92,y:39+Math.floor(index/3)*55,annotations:[]};items.push(view);selection={view:view.id};setTool('move');
    }catch(error){if(error.name!=='AbortError')hint(t("Não foi possível projetar: {0}",[t(error.message)]));}
    finally{if(job===controller){job=null;$('addDrawingView').disabled=false;}}
  });
  function open(value){panel.hidden=!value;document.body.classList.toggle('drawing-open',value);$('toggleDrawing').setAttribute('aria-expanded',String(value));bindText($('toggleDrawing'),()=>value?t("← Voltar ao 3D"):t("← Gerar folha 2D"));if(value){render();fitPaper();}onLayout();}
  $('toggleDrawing').addEventListener('click',()=>open(panel.hidden));$('closeDrawing').addEventListener('click',()=>{open(false);$('toggleDrawing').focus();});
  const filename=()=>`${(getName()||'modelo').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'_')}_folha_A4`;
  bindText($('downloadDrawing'),()=>t("Baixar PDF"));bindText($('printDrawing'),()=>t("Baixar DWG"));
  async function exportSheet(format){if(!items.length){hint(t("Insira pelo menos uma vista antes de baixar."));return;}const pdf=$('downloadDrawing'),dwg=$('printDrawing');pdf.disabled=true;dwg.disabled=true;hint(t("Preparando {0}…",[format.toUpperCase()]));
    try{const geometry=primitives();if(format==='pdf')await exportDrawingPdf(geometry,filename());else await exportDrawingDwg(geometry,filename());hint(t("{0} gerado. No DWG, as cotas são linhas e textos editáveis, sem vínculo paramétrico.",[format.toUpperCase()]));}catch(error){hint(t("Falha ao gerar {0}: {1}",[format.toUpperCase(),t(error.message)]));}finally{pdf.disabled=false;dwg.disabled=false;}}
  $('downloadDrawing').addEventListener('click',()=>exportSheet('pdf'));$('printDrawing').addEventListener('click',()=>exportSheet('dwg'));
  document.addEventListener('languagechange',()=>{render();fitPaper();});
  render();
  return{setAvailable:value=>{$('toggleDrawing').disabled=!value;},reset:()=>{job?.abort();job=null;$('addDrawingView').disabled=false;source?.dispose();source=null;cache.clear();items=[];history=[];selection=null;picks=[];drag=null;render();hint(t("A folha foi reiniciada para o modelo ou a escala de origem atual. Insira as vistas."));}};
}
