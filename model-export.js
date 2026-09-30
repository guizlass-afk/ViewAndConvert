import {t,getLanguage,bindText} from './i18n.js?v=1';
import * as THREE from 'three';
import {STLExporter} from 'three/addons/exporters/STLExporter.js';
import {OBJExporter} from 'three/addons/exporters/OBJExporter.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {PLYExporter} from 'three/addons/exporters/PLYExporter.js';
import {zipSync,strToU8} from 'three/addons/libs/fflate.module.js';

export const cadOutputFormats=new Set(['step','iges','brep']);
export const exportFormats=['stl','obj','glb','gltf','ply','3mf','step','iges','brep'];
const cadInputFormats=new Set(['step','stp','iges','igs','brep']);
const xml=value=>String(value).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));

// Bake world coordinates in millimeters; include all model bodies, without viewer helpers.
function meshCoordinates(model){
  const meshes=[];model.updateMatrixWorld(true);
  model.traverse(mesh=>{
    if(!mesh.isMesh||mesh.userData.helper)return;
    const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index;
    if(!position)return;
    const count=index?index.count:position.count,vertices=new Float64Array(count*3),point=new THREE.Vector3();
    for(let i=0;i<count;i++){
      point.fromBufferAttribute(position,index?index.getX(i):i).applyMatrix4(mesh.matrixWorld);
      if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(point.z))throw new Error(t("A geometria contém coordenadas inválidas."));
      point.toArray(vertices,i*3);
    }
    meshes.push({name:mesh.name,vertices});
  });return meshes;
}

function cadExport(payload,signal,onProgress){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./cad-export-worker.js',import.meta.url),{type:'module'});
    let timer;
    const finish=(error,result)=>{clearTimeout(timer);worker.terminate();signal?.removeEventListener('abort',cancel);error?reject(error):resolve(result);};
    const cancel=()=>finish(new DOMException(t("Conversão cancelada."),'AbortError'));
    signal?.addEventListener('abort',cancel,{once:true});
    if(signal?.aborted){cancel();return;}
    timer=setTimeout(()=>finish(new Error(t("A conversão excedeu 10 minutos. Tente uma geometria menor."))),600000);
    worker.onmessage=({data})=>{
      if(data.type==='progress')onProgress(data.detail);
      if(data.type==='result')finish(null,data.buffer);
      if(data.type==='error')finish(new Error(data.message));
    };
    worker.onerror=event=>finish(new Error(event.message||t("Não foi possível carregar o motor CAD. Verifique sua conexão.")));
    const buffers=payload.source?[payload.source]:payload.meshes.map(mesh=>mesh.buffer);
    worker.postMessage(payload,buffers);
  });
}

function threeMf(model){
  const meshes=meshCoordinates(model);
  const objects=meshes.map((mesh,i)=>{
    const vertices=[],triangles=[];
    for(let j=0;j<mesh.vertices.length;j+=3)vertices.push(`<vertex x="${mesh.vertices[j]}" y="${mesh.vertices[j+1]}" z="${mesh.vertices[j+2]}"/>`);
    for(let j=0;j<mesh.vertices.length/3;j+=3)triangles.push(`<triangle v1="${j}" v2="${j+1}" v3="${j+2}"/>`);
    return `<object id="${i+1}" type="model" name="${xml(mesh.name||t("Corpo {0}",[i+1]))}"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object>`;
  });
  const modelXml=`<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="pt-BR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${objects.join('')}</resources><build>${meshes.map((_,i)=>`<item objectid="${i+1}"/>`).join('')}</build></model>`;
  return zipSync({
    '[Content_Types].xml':strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),
    '_rels/.rels':strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    '3D/3dmodel.model':strToU8(modelXml)
  });
}

export async function convertModel({model,file,extension,scale,format,signal,onProgress=()=>{}}){
  if(!exportFormats.includes(format))throw new Error(t("Formato de saída não suportado."));
  signal?.throwIfAborted();
  if(cadOutputFormats.has(format)){
    const payload={format,extension,scale};
    if(cadInputFormats.has(extension))payload.source=await file.arrayBuffer();
    else payload.meshes=meshCoordinates(model).map(mesh=>mesh.vertices);
    signal?.throwIfAborted();
    return new Blob([await cadExport(payload,signal,onProgress)],{type:'application/octet-stream'});
  }
  onProgress(t("Gerando {0}…",[format.toUpperCase()]));
  if(format==='3mf')return new Blob([threeMf(model)],{type:'model/3mf'});
  // Snapshot prevents a new import, visibility toggles or view modes from changing the export.
  const snapshot=model.clone(true),helpers=[],materials=[];
  snapshot.traverse(child=>{
    child.visible=true;
    if(child.userData.helper){helpers.push(child);return;}
    if(!child.isMesh)return;
    const source=Array.isArray(child.material)?child.material:[child.material];
    const copies=source.map((material,i)=>{
      const copy=material.clone(),original=child.userData.originalMaterials?.[i];
      if(original)Object.assign(copy,original);copy.clippingPlanes=[];materials.push(copy);return copy;
    });child.material=Array.isArray(child.material)?copies:copies[0];
  });helpers.forEach(helper=>helper.removeFromParent());
  try{
    if(['glb','gltf'].includes(format))snapshot.scale.multiplyScalar(.001); // glTF uses meters.
    snapshot.updateMatrixWorld(true);
    if(format==='stl')return new Blob([new STLExporter().parse(snapshot,{binary:true})],{type:'model/stl'});
    if(format==='obj')return new Blob([new OBJExporter().parse(snapshot)],{type:'text/plain'});
    if(format==='ply'){
      const data=await new Promise(resolve=>new PLYExporter().parse(snapshot,resolve,{binary:true}));
      signal?.throwIfAborted();return new Blob([data],{type:'application/octet-stream'});
    }
    const data=await new GLTFExporter().parseAsync(snapshot,{binary:format==='glb',onlyVisible:false});
    signal?.throwIfAborted();
    return new Blob([format==='glb'?data:JSON.stringify(data)],{type:format==='glb'?'model/gltf-binary':'model/gltf+json'});
  }finally{materials.forEach(material=>material.dispose());}
}