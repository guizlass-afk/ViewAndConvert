import * as THREE from 'three';
export const views={top:{name:'SUPERIOR',direction:[0,0,1],up:[0,1,0]},bottom:{name:'INFERIOR',direction:[0,0,-1],up:[0,-1,0]},front:{name:'FRONTAL',direction:[0,-1,0],up:[0,0,1]},back:{name:'TRÁS',direction:[0,1,0],up:[0,0,1]},right:{name:'DIREITA',direction:[1,0,0],up:[0,0,1]},left:{name:'ESQUERDA',direction:[-1,0,0],up:[0,0,1]},iso:{name:'ISOMÉTRICA',direction:[1,-1,1],up:[0,0,1]}};
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
export async function prepareDrawingGeometry(model,signal){
  const {MeshBVH}=await import('https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.9.1/build/index.module.js');
  signal.throwIfAborted();model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3()),size=Math.max(bounds.getSize(new THREE.Vector3()).length(),1e-6),epsilon=size*1e-8;
  const vertices=new Map(),edges=new Map(),positions=[],key=p=>`${Math.round(p.x/epsilon)},${Math.round(p.y/epsilon)},${Math.round(p.z/epsilon)}`;
  model.traverse(mesh=>{
    if(!mesh.isMesh||mesh.userData.helper)return;
    const attr=mesh.geometry.attributes.position,index=mesh.geometry.index,count=index?index.count:attr.count;
    for(let i=0;i+2<count;i+=3){
      const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(attr,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld));
      const normal=new THREE.Vector3().subVectors(points[1],points[0]).cross(new THREE.Vector3().subVectors(points[2],points[0])).normalize();
      if(!normal.lengthSq())continue;
      points.forEach(p=>{positions.push(p.x,p.y,p.z);vertices.set(key(p),p);});
      for(let j=0;j<3;j++){const a=points[j],b=points[(j+1)%3],ka=key(a),kb=key(b),id=ka<kb?`${ka}/${kb}`:`${kb}/${ka}`;if(!edges.has(id))edges.set(id,{a,b,normals:[]});edges.get(id).normals.push(normal);}
    }
  });
  if(!positions.length)throw new Error('O modelo não tem faces para projetar.');
  await nextFrame();signal.throwIfAborted();
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));const bvh=new MeshBVH(geometry);
  return{center,size,edges:[...edges.values()],vertices:[...vertices.values()],bvh,dispose:()=>geometry.dispose()};
}
export async function projectDrawingView(source,kind,signal){
  const def=views[kind],direction=new THREE.Vector3(...def.direction).normalize(),right=new THREE.Vector3(...def.up).cross(direction).normalize(),up=direction.clone().cross(right).normalize();
  const project=p=>{const relative=p.clone().sub(source.center);return{x:relative.dot(right),y:-relative.dot(up),world:p.toArray()};};
  const distance=source.size*2,tolerance=source.size*2e-5,ray=new THREE.Ray();ray.direction.copy(direction).negate();
  const visible=p=>{ray.origin.copy(p).addScaledVector(direction,distance);const hit=source.bvh.raycastFirst(ray,THREE.DoubleSide);return !hit||hit.distance>=distance-tolerance;};
  const segments=[],points=[],dedup=new Set();for(const p of source.vertices)if(visible(p))points.push(project(p));
  let iteration=0;
  for(const edge of source.edges){
    if(++iteration%300===0){await nextFrame();signal.throwIfAborted();}
    const normals=edge.normals,front=normals.some(n=>n.dot(direction)>1e-6),back=normals.some(n=>n.dot(direction)<-1e-6);
    if(normals.length>1&&!(front&&back)&&normals.every(n=>n.dot(normals[0])>.94))continue;
    const a=project(edge.a),b=project(edge.b),length=Math.hypot(b.x-a.x,b.y-a.y);if(length<source.size*1e-8)continue;
    const samples=Math.min(256,Math.max(2,Math.ceil(length/source.size*600)));let start=null;
    for(let i=0;i<samples;i++){
      const show=visible(edge.a.clone().lerp(edge.b,(i+.5)/samples));if(show&&start===null)start=i/samples;
      if(start!==null&&(!show||i===samples-1)){
        const end=show?(i+1)/samples:i/samples,segment=[a.x+(b.x-a.x)*start,a.y+(b.y-a.y)*start,a.x+(b.x-a.x)*end,a.y+(b.y-a.y)*end],key=segment.map(v=>Math.round(v/source.size*1e7)).join(',');
        if(!dedup.has(key)){segments.push(segment);dedup.add(key);}start=null;
      }
    }
  }
  const projected=source.vertices.map(project),extent=(key,fn,initial)=>projected.reduce((a,p)=>fn(a,p[key]),initial);
  return{kind,name:def.name,segments,points,minX:extent('x',Math.min,Infinity),maxX:extent('x',Math.max,-Infinity),minY:extent('y',Math.min,Infinity),maxY:extent('y',Math.max,-Infinity)};
}
