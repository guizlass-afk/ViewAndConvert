import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {ThreeMFLoader} from 'three/addons/loaders/3MFLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {STLExporter} from 'three/addons/exporters/STLExporter.js';
import {OBJExporter} from 'three/addons/exporters/OBJExporter.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';

const $=id=>document.getElementById(id);
const ui={
  fileInput:$('fileInput'),centerFileInput:$('centerFileInput'),dropZone:$('dropZone'),openAnother:$('openAnother'),emptyState:$('emptyState'),viewport:$('viewport'),canvas:$('canvas'),
  loading:$('loading'),loadingTitle:$('loadingTitle'),loadingDetail:$('loadingDetail'),progressBar:$('progressBar'),progressValue:$('progressValue'),toast:$('toast'),
  modelPanel:$('modelPanel'),measurePanel:$('measurePanel'),sectionPanel:$('sectionPanel'),convertPanel:$('convertPanel'),fileName:$('fileName'),fileFormat:$('fileFormat'),fileSize:$('fileSize'),meshCount:$('meshCount'),triangleCount:$('triangleCount'),dimensions:$('dimensions'),dimensionsUnit:$('dimensionsUnit'),modelUnit:$('modelUnit'),displayUnit:$('displayUnit'),
  measureButton:$('measureButton'),measureTarget:$('measureTarget'),vertexPreview:$('vertexPreview'),measureHint:$('measureHint'),measurements:$('measurements'),clearMeasurements:$('clearMeasurements'),sectionEnabled:$('sectionEnabled'),sectionSlider:$('sectionSlider'),sectionValue:$('sectionValue'),sectionReverse:$('sectionReverse'),
  exportFormat:$('exportFormat'),exportButton:$('exportButton'),fitView:$('fitView'),resetView:$('resetView'),statusText:$('statusText'),cursorPosition:$('cursorPosition'),renderInfo:$('renderInfo'),modelBadge:$('modelBadge'),badgeName:$('badgeName'),modelTree:$('modelTree'),toggleAll:$('toggleAll'),
  surfaceArea:$('surfaceArea'),volume:$('volume'),vertexCount:$('vertexCount'),bounds:$('bounds'),professionalModal:$('professionalModal'),modalText:$('modalText'),closeModal:$('closeModal'),modalOk:$('modalOk')
};

const meshFormats=new Set(['stl','obj','3mf','glb','gltf']);
const cadFormats=new Set(['step','stp','iges','igs','brep']);
const professionalFormats=new Set(['x_t','x_b','3dxml']);
const supportedFormats=new Set([...meshFormats,...cadFormats,...professionalFormats]);
const unitFactors={mm:1,cm:10,in:25.4,m:1000};
const unitLabels={mm:'mm',cm:'cm',in:'pol',m:'m'};
const state={file:null,extension:'',model:null,meshes:[],edges:[],measureMode:false,pendingPoint:null,measurements:[],measureIndex:0,sectionAxis:'x',sectionPlane:new THREE.Plane(new THREE.Vector3(1,0,0),0),displayMode:'shaded',bounds:new THREE.Box3(),metrics:null,loadingTimer:null,toastTimer:null,allVisible:true};

const scene=new THREE.Scene();
scene.background=new THREE.Color(0xeff4f5);
const camera=new THREE.PerspectiveCamera(38,1,.01,10000000);
camera.up.set(0,0,1);
camera.position.set(650,-850,620);
const renderer=new THREE.WebGLRenderer({canvas:ui.canvas,antialias:true,alpha:false,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.localClippingEnabled=true;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const controls=new OrbitControls(camera,ui.canvas);
controls.enableDamping=true;controls.dampingFactor=.08;controls.screenSpacePanning=true;
scene.add(new THREE.HemisphereLight(0xffffff,0x81939c,2.1));
const keyLight=new THREE.DirectionalLight(0xffffff,3.1);keyLight.position.set(3,-4,6);scene.add(keyLight);
const fillLight=new THREE.DirectionalLight(0xbad7e7,1.35);fillLight.position.set(-4,2,1);scene.add(fillLight);
const modelRoot=new THREE.Group();modelRoot.name='Modelo';scene.add(modelRoot);
const measurementRoot=new THREE.Group();measurementRoot.name='Medições';scene.add(measurementRoot);
const grid=new THREE.GridHelper(1000,20,0xb6c7cb,0xd5e0e2);grid.rotation.x=Math.PI/2;grid.position.z=-.5;grid.material.opacity=.5;grid.material.transparent=true;scene.add(grid);
// Project the model axes with the camera rotation, but anchor them in the corner.
const orientationAxes=$('orientationAxes');
const svgNamespace='http://www.w3.org/2000/svg';
const orientationDirections=[['X',0xd9553d,new THREE.Vector3(1,0,0)],['Y',0x16835e,new THREE.Vector3(0,1,0)],['Z',0x267fba,new THREE.Vector3(0,0,1)]].map(([label,color,direction])=>{
  const group=document.createElementNS(svgNamespace,'g'),line=document.createElementNS(svgNamespace,'line'),tip=document.createElementNS(svgNamespace,'circle'),text=document.createElementNS(svgNamespace,'text');
  group.dataset.axis=label;group.setAttribute('fill',`#${color.toString(16).padStart(6,'0')}`);
  line.setAttribute('stroke','currentColor');line.style.color=`#${color.toString(16).padStart(6,'0')}`;line.setAttribute('stroke-width','2');line.setAttribute('stroke-linecap','round');
  line.setAttribute('x1','50');line.setAttribute('y1','50');tip.setAttribute('r','3');text.textContent=label;text.setAttribute('text-anchor','middle');text.setAttribute('dominant-baseline','central');
  group.append(line,tip,text);orientationAxes.append(group);return{direction,group,line,tip,text,view:new THREE.Vector3()};
});
const orientationInverse=new THREE.Quaternion();
function updateOrientationAxes(){
  if(orientationAxes.hasAttribute('hidden'))return;
  orientationInverse.copy(camera.quaternion).invert();
  for(const axis of orientationDirections)axis.view.copy(axis.direction).applyQuaternion(orientationInverse);
  // Draw the axis facing the viewer last, as with the model's depth order.
  for(const axis of [...orientationDirections].sort((a,b)=>a.view.z-b.view.z)){
    const x=50+axis.view.x*30,y=50-axis.view.y*30;
    axis.line.setAttribute('x2',x);axis.line.setAttribute('y2',y);axis.tip.setAttribute('cx',x);axis.tip.setAttribute('cy',y);
    axis.text.setAttribute('x',50+axis.view.x*42);axis.text.setAttribute('y',50-axis.view.y*42);
    axis.group.setAttribute('opacity',axis.view.z<-.01?'.6':'1');orientationAxes.append(axis.group);
  }
}
const raycaster=new THREE.Raycaster();
const pointer=new THREE.Vector2();

function resize(){const rect=ui.viewport.getBoundingClientRect();if(!rect.width||!rect.height)return;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(ui.viewport);resize();
renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);updateOrientationAxes();});

function extensionOf(name){const lower=name.toLowerCase();if(lower.endsWith('.x_t'))return'x_t';if(lower.endsWith('.x_b'))return'x_b';return lower.includes('.')?lower.split('.').pop():'';}
function formatBytes(bytes){if(bytes<1024)return`${bytes} B`;if(bytes<1048576)return`${(bytes/1024).toFixed(1)} KB`;return`${(bytes/1048576).toFixed(1)} MB`;}
function locale(value,digits=2){return new Intl.NumberFormat('pt-BR',{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(value);}
function convertedValue(mm){return mm/(unitFactors[ui.displayUnit.value]||1);}
function formatLength(mm,digits=2){return`${locale(convertedValue(mm),digits)} ${unitLabels[ui.displayUnit.value]}`;}
function setProgress(value,title,detail){const safe=Math.max(0,Math.min(100,value));ui.progressBar.style.width=`${safe}%`;ui.progressValue.textContent=`${Math.round(safe)}%`;if(title)ui.loadingTitle.textContent=title;if(detail)ui.loadingDetail.textContent=detail;}
function showLoading(title='Lendo o modelo…'){ui.loading.hidden=false;setProgress(4,title,'Preparando a geometria para visualização');clearInterval(state.loadingTimer);let value=4;state.loadingTimer=setInterval(()=>{value=Math.min(72,value+Math.max(1,(75-value)*.08));setProgress(value);},180);}
function hideLoading(){clearInterval(state.loadingTimer);setProgress(100,'Modelo pronto','Geometria preparada com sucesso');setTimeout(()=>{ui.loading.hidden=true;},300);}
function toast(message,type='info'){clearTimeout(state.toastTimer);ui.toast.textContent=message;ui.toast.className=`toast ${type==='error'?'error':''}`;ui.toast.hidden=false;state.toastTimer=setTimeout(()=>ui.toast.hidden=true,4500);}
function showProfessional(extension){ui.modalText.textContent=`Arquivos .${extension.toUpperCase()} exigem um tradutor comercial licenciado para preservar superfícies, sólidos, montagem e metadados com fidelidade.`;ui.professionalModal.hidden=false;}

function disposeObject(object){object.traverse(child=>{child.geometry?.dispose();const materials=Array.isArray(child.material)?child.material:[child.material];materials.filter(Boolean).forEach(material=>{material.map?.dispose();material.dispose?.();});});}
function clearModel(){orientationAxes.setAttribute('hidden','');if(state.model){modelRoot.remove(state.model);disposeObject(state.model);}clearMeasurements();state.model=null;state.meshes=[];state.edges=[];state.metrics=null;state.pendingPoint=null;state.measureMode=false;ui.measureButton.classList.remove('active');ui.measureHint.hidden=true;ui.modelTree.innerHTML='';}

function cadResultToObject(result){
  const group=new THREE.Group();group.name=result.root?.name||state.file?.name||'Modelo CAD';
  for(const item of result.meshes||[]){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(item.attributes.position.array,3));
    if(item.attributes.normal)geometry.setAttribute('normal',new THREE.Float32BufferAttribute(item.attributes.normal.array,3));else geometry.computeVertexNormals();
    if(item.index?.array)geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(item.index.array),1));
    const color=item.color?new THREE.Color(item.color[0],item.color[1],item.color[2]):new THREE.Color(0x85aeb7);
    const material=createMaterial(color);
    if(item.brep_faces?.length){const materials=[material];let triangle=0,faceIndex=0,total=(item.index?.array?.length||item.attributes.position.array.length)/3;while(triangle<total){const face=item.brep_faces[faceIndex];if(!face||triangle<face.first){const last=face?face.first:total;geometry.addGroup(triangle*3,(last-triangle)*3,0);triangle=last;}else{const faceMaterial=createMaterial(face.color?new THREE.Color(...face.color):color);materials.push(faceMaterial);const last=face.last+1;geometry.addGroup(triangle*3,(last-triangle)*3,materials.length-1);triangle=last;faceIndex++;}}const mesh=new THREE.Mesh(geometry,materials);mesh.name=item.name||`Corpo ${group.children.length+1}`;group.add(mesh);}else{const mesh=new THREE.Mesh(geometry,material);mesh.name=item.name||`Corpo ${group.children.length+1}`;group.add(mesh);}
  }
  return group;
}

function createMaterial(color=0x86aeb7){return new THREE.MeshStandardMaterial({color,roughness:.68,metalness:.03,side:THREE.DoubleSide,clippingPlanes:[state.sectionPlane],clipShadows:true});}
function normalizeObject(object){
  object.traverse(child=>{
    if(!child.isMesh)return;
    if(!child.geometry.attributes.normal)child.geometry.computeVertexNormals();
    const source=Array.isArray(child.material)?child.material:[child.material];
    child.material=source.map(material=>{const clone=material?.clone?.()||createMaterial();clone.side=THREE.DoubleSide;clone.clippingPlanes=[state.sectionPlane];clone.clipShadows=true;clone.roughness=clone.roughness??.68;clone.metalness=clone.metalness??.03;return clone;});
    if(child.material.length===1)child.material=child.material[0];
    child.castShadow=true;child.receiveShadow=true;
    child.userData.originalMaterials=(Array.isArray(child.material)?child.material:[child.material]).map(material=>({opacity:material.opacity,transparent:material.transparent,wireframe:material.wireframe,depthWrite:material.depthWrite}));
    const edgeGeometry=new THREE.EdgesGeometry(child.geometry,28);const edge=new THREE.LineSegments(edgeGeometry,new THREE.LineBasicMaterial({color:0x1c3948,transparent:true,opacity:.48,clippingPlanes:[state.sectionPlane]}));edge.name=`Arestas — ${child.name||'corpo'}`;edge.visible=false;edge.userData.helper=true;child.add(edge);child.userData.edgeHelper=edge;state.edges.push(edge);state.meshes.push(child);
  });
  return object;
}

async function parseMeshFile(file,extension,buffer){
  if(extension==='stl'){const geometry=new STLLoader().parse(buffer);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,createMaterial(0x83aeb7));mesh.name=file.name;return mesh;}
  if(extension==='obj'){const text=new TextDecoder().decode(buffer);return new OBJLoader().parse(text);}
  if(extension==='3mf')return new ThreeMFLoader().parse(buffer);
  if(['glb','gltf'].includes(extension)){return new Promise((resolve,reject)=>new GLTFLoader().parse(buffer,'',gltf=>resolve(gltf.scene),reject));}
  throw new Error('Formato de malha não reconhecido.');
}

function parseCadFile(buffer,extension){return new Promise((resolve,reject)=>{const worker=new Worker('cad-worker.js');worker.onmessage=event=>{const data=event.data;if(data.type==='progress')setProgress(data.value,'Convertendo o modelo CAD',data.detail);if(data.type==='result'){worker.terminate();resolve(cadResultToObject(data.result));}if(data.type==='error'){worker.terminate();reject(new Error(data.message));}};worker.onerror=event=>{worker.terminate();reject(new Error(event.message||'Falha ao iniciar o núcleo CAD.'));};worker.postMessage({buffer,extension},[buffer]);});}

async function loadFile(file){
  const extension=extensionOf(file.name);
  if(!supportedFormats.has(extension)){toast(`O formato .${extension||'?'} ainda não é compatível.`,'error');return;}
  if(professionalFormats.has(extension)){showProfessional(extension);return;}
  clearModel();state.file=file;state.extension=extension;showLoading(cadFormats.has(extension)?'Preparando o núcleo CAD…':'Lendo o modelo…');
  try{
    const buffer=await file.arrayBuffer();setProgress(15,null,'Arquivo carregado; interpretando a geometria');
    const object=cadFormats.has(extension)?await parseCadFile(buffer,extension):await parseMeshFile(file,extension,buffer);
    state.model=normalizeObject(object);state.model.name=file.name;modelRoot.add(state.model);applyModelScale();finishLoad();
  }catch(error){clearModel();ui.loading.hidden=true;toast(`Não foi possível abrir o arquivo: ${error.message}`,'error');console.error(error);}
}

function applyModelScale(){if(!state.model)return;clearMeasurements();const factor=Number(ui.modelUnit.value)||1;state.model.scale.setScalar(factor);state.model.updateMatrixWorld(true);refreshAnalysis();fitCamera();}
function finishLoad(){
  orientationAxes.removeAttribute('hidden');
  ui.emptyState.hidden=true;ui.openAnother.hidden=false;[ui.modelPanel,ui.measurePanel,ui.sectionPanel,ui.convertPanel].forEach(panel=>panel.hidden=false);
  document.querySelectorAll('.viewer-toolbar button').forEach(button=>button.disabled=false);ui.toggleAll.disabled=false;
  ui.fileName.textContent=state.file.name;ui.fileFormat.textContent=state.extension.toUpperCase();ui.fileSize.textContent=formatBytes(state.file.size);ui.badgeName.textContent=state.file.name;ui.modelBadge.hidden=false;ui.statusText.textContent=`${state.file.name} carregado`;
  buildTree();applyDisplayMode('shaded');updateSectionPlane();hideLoading();toast('Modelo carregado. Use as ferramentas para inspecionar e medir.');
}

function geometryTriangles(geometry){return geometry.index?geometry.index.count/3:geometry.attributes.position.count/3;}
function calculateMetrics(){
  let triangles=0,vertices=0,area=0,volume=0;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3(),cross=new THREE.Vector3();
  state.model.updateMatrixWorld(true);
  state.meshes.forEach(mesh=>{const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index;vertices+=position.count;const count=index?index.count:position.count;triangles+=count/3;for(let i=0;i<count;i+=3){const ia=index?index.getX(i):i,ib=index?index.getX(i+1):i+1,ic=index?index.getX(i+2):i+2;a.fromBufferAttribute(position,ia).applyMatrix4(mesh.matrixWorld);b.fromBufferAttribute(position,ib).applyMatrix4(mesh.matrixWorld);c.fromBufferAttribute(position,ic).applyMatrix4(mesh.matrixWorld);ab.subVectors(b,a);ac.subVectors(c,a);cross.crossVectors(ab,ac);area+=cross.length()*.5;volume+=a.dot(cross.crossVectors(b,c))/6;}});
  return{triangles:Math.round(triangles),vertices,area,volume:Math.abs(volume)};
}
function refreshAnalysis(){
  if(!state.model)return;state.bounds.setFromObject(state.model);const size=state.bounds.getSize(new THREE.Vector3());state.metrics=calculateMetrics();
  ui.meshCount.textContent=state.meshes.length.toLocaleString('pt-BR');ui.triangleCount.textContent=state.metrics.triangles.toLocaleString('pt-BR');ui.vertexCount.textContent=state.metrics.vertices.toLocaleString('pt-BR');ui.renderInfo.textContent=`${state.meshes.length} objeto(s) · ${state.metrics.triangles.toLocaleString('pt-BR')} triângulos`;
  ui.dimensions.textContent=`${formatLength(size.x)} × ${formatLength(size.y)} × ${formatLength(size.z)}`;ui.dimensionsUnit.textContent=`comprimento × largura × altura em ${unitLabels[ui.displayUnit.value]}`;ui.bounds.textContent=ui.dimensions.textContent;
  const factor=unitFactors[ui.displayUnit.value]||1;ui.surfaceArea.textContent=`${locale(state.metrics.area/(factor*factor),2)} ${unitLabels[ui.displayUnit.value]}²`;ui.volume.textContent=`${locale(state.metrics.volume/(factor*factor*factor),2)} ${unitLabels[ui.displayUnit.value]}³`;
  const maxSize=Math.max(size.x,size.y,size.z,1);grid.scale.setScalar(Math.max(.1,maxSize/800));grid.position.z=state.bounds.min.z-Math.max(maxSize*.003,.01);
  updateSectionPlane();renderMeasurementList();
}

function fitCamera(direction='iso'){
  if(!state.model)return;state.bounds.setFromObject(state.model);const center=state.bounds.getCenter(new THREE.Vector3()),size=state.bounds.getSize(new THREE.Vector3()),radius=Math.max(size.length()*.5,1),distance=radius/Math.sin(THREE.MathUtils.degToRad(camera.fov*.5))*1.15;
  let vector=new THREE.Vector3(1,-1,.78);if(direction==='front')vector.set(0,-1,0);if(direction==='top')vector.set(0,0,1);if(direction==='right')vector.set(1,0,0);vector.normalize();
  camera.up.set(0,0,1);if(direction==='top')camera.up.set(0,1,0);camera.position.copy(center).addScaledVector(vector,distance);camera.near=Math.max(distance/10000,.001);camera.far=distance*100;camera.updateProjectionMatrix();controls.target.copy(center);controls.update();
}

function buildTree(){
  ui.modelTree.innerHTML='';state.meshes.forEach((mesh,index)=>{const row=document.createElement('label');row.className='tree-node';const check=document.createElement('input');check.type='checkbox';check.checked=true;check.addEventListener('change',()=>{mesh.visible=check.checked;});const icon=document.createElement('span');icon.textContent=`◇ ${mesh.name||`Corpo ${index+1}`}`;icon.title=mesh.name||`Corpo ${index+1}`;const count=document.createElement('b');count.textContent=geometryTriangles(mesh.geometry).toLocaleString('pt-BR');row.append(check,icon,count);ui.modelTree.append(row);});
}
function applyDisplayMode(mode){state.displayMode=mode;state.meshes.forEach(mesh=>{const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];materials.forEach((material,index)=>{const original=mesh.userData.originalMaterials[index]||mesh.userData.originalMaterials[0];material.wireframe=mode==='wireframe';material.transparent=mode==='transparent'||original.transparent;material.opacity=mode==='transparent' ? .28 : original.opacity;material.depthWrite=mode!=='transparent';material.needsUpdate=true;});if(mesh.userData.edgeHelper)mesh.userData.edgeHelper.visible=mode==='edges';});document.querySelectorAll('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===mode));}

function updateSectionPlane(){
  const enabled=ui.sectionEnabled.checked&&state.model;ui.sectionSlider.disabled=!enabled;ui.sectionReverse.disabled=!enabled;
  if(!state.model){state.sectionPlane.constant=1e12;return;}
  const axis=state.sectionAxis,index={x:0,y:1,z:2}[axis],normal=new THREE.Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0);if(ui.sectionReverse.checked)normal.multiplyScalar(-1);
  const min=state.bounds.min.getComponent(index),max=state.bounds.max.getComponent(index),position=min+(max-min)*(Number(ui.sectionSlider.value)/100);state.sectionPlane.normal.copy(normal);state.sectionPlane.constant=enabled?-normal.getComponent(index)*position:1e12;ui.sectionValue.textContent=`${ui.sectionSlider.value}%`;
}

function pointerIntersection(event){
  const rect=ui.canvas.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(state.meshes.filter(mesh=>mesh.visible),false).find(hit=>!ui.sectionEnabled.checked||state.sectionPlane.distanceToPoint(hit.point)>=-1e-7)||null;
}
// Snap in screen pixels so the selection tolerance stays usable at any zoom.
function measurePoint(event){
  if(ui.measureTarget.value==='surface')return pointerIntersection(event)?.point||null;
  const rect=ui.canvas.getBoundingClientRect(),world=new THREE.Vector3(),projected=new THREE.Vector3(),candidates=[];
  state.model.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  for(const mesh of state.meshes){
    if(!mesh.visible)continue;
    const positions=mesh.geometry.attributes.position;
    for(let i=0;i<positions.count;i++){
      world.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
      if(ui.sectionEnabled.checked&&state.sectionPlane.distanceToPoint(world)<-1e-7)continue;
      projected.copy(world).project(camera);
      if(projected.z<-1||projected.z>1)continue;
      const x=rect.left+(projected.x+1)*rect.width/2,y=rect.top+(1-projected.y)*rect.height/2;
      const distance=Math.hypot(x-event.clientX,y-event.clientY);
      if(distance<=12)candidates.push({point:world.clone(),distance});
    }
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  const tolerance=Math.max(state.bounds.getSize(new THREE.Vector3()).length()*1e-5,1e-7);
  for(const candidate of candidates){
    projected.copy(candidate.point).project(camera);
    raycaster.setFromCamera(new THREE.Vector2(projected.x,projected.y),camera);
    const hit=raycaster.intersectObjects(state.meshes.filter(mesh=>mesh.visible),false).find(item=>!ui.sectionEnabled.checked||state.sectionPlane.distanceToPoint(item.point)>=-1e-7);
    if(!hit||hit.distance+tolerance>=camera.position.distanceTo(candidate.point))return candidate.point;
  }
  return null;
}
function hideVertexPreview(){ui.vertexPreview.hidden=true;}
function previewVertex(point){
  if(!point||!state.measureMode||ui.measureTarget.value!=='vertex'){hideVertexPreview();return;}
  const projected=point.clone().project(camera),rect=ui.canvas.getBoundingClientRect();
  ui.vertexPreview.style.left=`${(projected.x+1)*rect.width/2}px`;
  ui.vertexPreview.style.top=`${(1-projected.y)*rect.height/2}px`;
  ui.vertexPreview.hidden=false;
}
controls.addEventListener('change',hideVertexPreview);
function marker(point,color=0xff6b2c){const radius=Math.max(state.bounds.getSize(new THREE.Vector3()).length()*.006,.02);const sphere=new THREE.Mesh(new THREE.SphereGeometry(radius,18,12),new THREE.MeshBasicMaterial({color,depthTest:false}));sphere.position.copy(point);sphere.renderOrder=20;return sphere;}
let pointerStart=null;
ui.canvas.addEventListener('pointerdown',event=>{pointerStart=event.button===0?{x:event.clientX,y:event.clientY}:null;});
ui.canvas.addEventListener('pointercancel',()=>{pointerStart=null;hideVertexPreview();});
ui.canvas.addEventListener('pointerleave',hideVertexPreview);
ui.canvas.addEventListener('pointerup',event=>{
  const start=pointerStart;pointerStart=null;
  if(event.button!==0||!state.measureMode||!state.model||!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>4)return;
  const point=measurePoint(event);
  if(!point){toast(ui.measureTarget.value==='vertex'?'Aproxime o cursor de um vértice visível até aparecer o destaque.':'Clique diretamente sobre uma face do modelo.','error');return;}
  selectMeasurePoint(point);
});
let cursorFrame=0;ui.canvas.addEventListener('pointermove',event=>{if(!state.model||cursorFrame)return;cursorFrame=requestAnimationFrame(()=>{cursorFrame=0;if(!state.model)return;const point=state.measureMode?measurePoint(event):pointerIntersection(event)?.point;previewVertex(point);if(point)ui.cursorPosition.textContent=`X ${formatLength(point.x)} · Y ${formatLength(point.y)} · Z ${formatLength(point.z)}`;});});
function selectMeasurePoint(point){
  if(!state.pendingPoint){state.pendingPoint=point.clone();const first=marker(point);first.userData.pending=true;measurementRoot.add(first);ui.measureHint.textContent='Agora selecione o segundo ponto';return;}
  const start=state.pendingPoint.clone(),end=point.clone(),distance=start.distanceTo(end),group=new THREE.Group(),lineGeometry=new THREE.BufferGeometry().setFromPoints([start,end]),line=new THREE.Line(lineGeometry,new THREE.LineBasicMaterial({color:0xff6b2c,depthTest:false}));line.renderOrder=19;group.add(marker(start),marker(end),line);measurementRoot.children.filter(child=>child.userData.pending).forEach(child=>{measurementRoot.remove(child);disposeObject(child);});measurementRoot.add(group);state.measurements.push({id:++state.measureIndex,start,end,distance,group});state.pendingPoint=null;ui.measureHint.textContent='Selecione o primeiro ponto';renderMeasurementList();
}
function renderMeasurementList(){
  ui.measurements.innerHTML='';if(!state.measurements.length){ui.measurements.innerHTML='<p>Nenhuma medição criada.</p>';ui.clearMeasurements.disabled=true;return;}ui.clearMeasurements.disabled=false;state.measurements.forEach(item=>{const row=document.createElement('div');row.className='measurement-item';row.innerHTML=`<span>${item.id}</span><div><small>Distância linear</small><strong>${formatLength(item.distance,3)}</strong><dl class="measurement-components">${['x','y','z'].map(axis=>`<div><dt>${axis.toUpperCase()}</dt><dd>${formatLength(Math.abs(item.end[axis]-item.start[axis]),3)}</dd></div>`).join('')}</dl></div><button type="button" aria-label="Remover medição">×</button>`;row.querySelector('button').addEventListener('click',()=>removeMeasurement(item.id));ui.measurements.append(row);});
}
function removeMeasurement(id){const index=state.measurements.findIndex(item=>item.id===id);if(index<0)return;const [item]=state.measurements.splice(index,1);measurementRoot.remove(item.group);disposeObject(item.group);renderMeasurementList();}
function clearMeasurements(){hideVertexPreview();measurementRoot.children.forEach(disposeObject);measurementRoot.clear();state.measurements=[];state.pendingPoint=null;ui.measureHint.textContent='Selecione o primeiro ponto';renderMeasurementList();}

function safeName(){return(state.file?.name||'modelo').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'_');}
function download(data,name,type){const blob=data instanceof Blob?data:new Blob([data],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function exportModel(){
  if(!state.model)return;const format=ui.exportFormat.value;ui.exportButton.disabled=true;ui.exportButton.querySelector('span').textContent='Convertendo…';const previousEdges=state.edges.map(edge=>edge.visible);state.edges.forEach(edge=>edge.visible=false);measurementRoot.visible=false;
  try{state.model.updateMatrixWorld(true);if(format==='stl'){const data=new STLExporter().parse(state.model,{binary:true});download(data,`${safeName()}.stl`,'model/stl');}else if(format==='obj'){const data=new OBJExporter().parse(state.model);download(data,`${safeName()}.obj`,'text/plain');}else{const data=await new GLTFExporter().parseAsync(state.model,{binary:true,onlyVisible:true});download(data,`${safeName()}.glb`,'model/gltf-binary');}toast(`Conversão concluída: ${safeName()}.${format}`);}catch(error){toast(`Falha na conversão: ${error.message}`,'error');console.error(error);}finally{state.edges.forEach((edge,index)=>edge.visible=previousEdges[index]);measurementRoot.visible=true;ui.exportButton.disabled=false;ui.exportButton.querySelector('span').textContent='Converter e baixar';}
}

function handleFiles(files){const file=files?.[0];if(file)loadFile(file);}
[ui.fileInput,ui.centerFileInput].forEach(input=>input.addEventListener('change',event=>{handleFiles(event.target.files);event.target.value='';}));
ui.openAnother.addEventListener('click',()=>ui.fileInput.click());
['dragenter','dragover'].forEach(type=>ui.viewport.addEventListener(type,event=>{event.preventDefault();ui.viewport.classList.add('dragging');}));
['dragleave','drop'].forEach(type=>ui.viewport.addEventListener(type,event=>{event.preventDefault();ui.viewport.classList.remove('dragging');if(type==='drop')handleFiles(event.dataTransfer.files);}));
['dragenter','dragover'].forEach(type=>ui.dropZone.addEventListener(type,event=>{event.preventDefault();ui.dropZone.classList.add('dragging');}));
['dragleave','drop'].forEach(type=>ui.dropZone.addEventListener(type,event=>{event.preventDefault();ui.dropZone.classList.remove('dragging');if(type==='drop')handleFiles(event.dataTransfer.files);}));
$('toggleGrid').addEventListener('click',()=>{grid.visible=!grid.visible;const button=$('toggleGrid');button.classList.toggle('active',grid.visible);button.setAttribute('aria-pressed',String(grid.visible));button.title=grid.visible?'Ocultar grade':'Mostrar grade';});
ui.fitView.addEventListener('click',()=>fitCamera());ui.resetView.addEventListener('click',()=>fitCamera('iso'));
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>fitCamera(button.dataset.view)));
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>applyDisplayMode(button.dataset.mode)));
ui.modelUnit.addEventListener('change',applyModelScale);ui.displayUnit.addEventListener('change',refreshAnalysis);
ui.measureTarget.addEventListener('change',()=>{hideVertexPreview();state.pendingPoint=null;measurementRoot.children.filter(child=>child.userData.pending).forEach(child=>{measurementRoot.remove(child);disposeObject(child);});ui.measureHint.textContent='Selecione o primeiro ponto';});
ui.measureButton.addEventListener('click',()=>{hideVertexPreview();state.measureMode=!state.measureMode;ui.measureButton.classList.toggle('active',state.measureMode);ui.measureHint.hidden=!state.measureMode;ui.measureHint.textContent=state.pendingPoint?'Agora selecione o segundo ponto':'Selecione o primeiro ponto';ui.canvas.style.cursor=state.measureMode?'crosshair':'grab';});
ui.clearMeasurements.addEventListener('click',clearMeasurements);
ui.sectionEnabled.addEventListener('change',updateSectionPlane);ui.sectionSlider.addEventListener('input',updateSectionPlane);ui.sectionReverse.addEventListener('change',updateSectionPlane);
document.querySelectorAll('[data-axis]').forEach(button=>button.addEventListener('click',()=>{state.sectionAxis=button.dataset.axis;document.querySelectorAll('[data-axis]').forEach(item=>item.classList.toggle('active',item===button));updateSectionPlane();}));
ui.toggleAll.addEventListener('click',()=>{state.allVisible=!state.allVisible;state.meshes.forEach(mesh=>mesh.visible=state.allVisible);ui.modelTree.querySelectorAll('input').forEach(input=>input.checked=state.allVisible);});
ui.exportButton.addEventListener('click',exportModel);
[ui.closeModal,ui.modalOk].forEach(button=>button.addEventListener('click',()=>ui.professionalModal.hidden=true));ui.professionalModal.addEventListener('click',event=>{if(event.target===ui.professionalModal)ui.professionalModal.hidden=true;});
window.addEventListener('keydown',event=>{if(event.key==='Escape'){hideVertexPreview();state.measureMode=false;ui.measureButton.classList.remove('active');ui.measureHint.hidden=true;ui.canvas.style.cursor='grab';ui.professionalModal.hidden=true;}if(event.key.toLowerCase()==='f'&&state.model)fitCamera();});

ui.canvas.style.cursor='grab';updateSectionPlane();
window.ViewConvertCore=Object.freeze({supportedFormats:[...supportedFormats],extensionOf,formatLength,calculateMetrics,loadFile});
