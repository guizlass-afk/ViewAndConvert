const OCCT_BASE='https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/';
let enginePromise;

async function engine(){
  if(!enginePromise){
    importScripts(`${OCCT_BASE}occt-import-js.js`);
    enginePromise=occtimportjs({locateFile:file=>`${OCCT_BASE}${file}`});
  }
  return enginePromise;
}

self.onmessage=async event=>{
  const {buffer,extension}=event.data;
  try{
    self.postMessage({type:'progress',value:18,detail:'Carregando o núcleo CAD OpenCascade'});
    const occt=await engine();
    self.postMessage({type:'progress',value:48,detail:'Interpretando superfícies e sólidos'});
    const content=new Uint8Array(buffer);
    const params={linearUnit:'millimeter',linearDeflectionType:'bounding_box_ratio',linearDeflection:0.001,angularDeflection:0.5};
    let result;
    if(['step','stp'].includes(extension))result=occt.ReadStepFile(content,params);
    else if(['iges','igs'].includes(extension))result=occt.ReadIgesFile(content,params);
    else result=occt.ReadBrepFile(content,params);
    if(!result?.success)throw new Error('O núcleo CAD não conseguiu interpretar este arquivo.');
    self.postMessage({type:'progress',value:84,detail:'Preparando a malha de visualização'});
    self.postMessage({type:'result',result});
  }catch(error){self.postMessage({type:'error',message:error?.message||String(error)});}
};
