import * as THREE from 'three';
export const views={top:{name:'SUPERIOR',direction:[0,0,1],up:[0,1,0]},bottom:{name:'INFERIOR',direction:[0,0,-1],up:[0,-1,0]},front:{name:'FRONTAL',direction:[0,-1,0],up:[0,0,1]},back:{name:'TRÁS',direction:[0,1,0],up:[0,0,1]},right:{name:'DIREITA',direction:[1,0,0],up:[0,0,1]},left:{name:'ESQUERDA',direction:[-1,0,0],up:[0,0,1]},iso:{name:'ISOMÉTRICA',direction:[1,-1,1],up:[0,0,1]}};
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
export async function prepareDrawingGeometry(model,signal){
  const {MeshBVH}=await import('https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.9.1/build/index.module.js');
  signal.throwIfAborted();model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3()),size=Math.max(bounds.getSize(new THREE.Vector3()).length(),1e-6),epsilon=size*1e-7;
  const vertices=new Map(),edges=new Map(),positions=[],key=p=>`${Math.round(p.x/epsilon)},${Math.round(p.y/epsilon)},${Math.round(p.z/epsilon)}`;
  model.traverse(mesh=>{
    if(!mesh.isMesh||mesh.userData.helper)return;
    const attr=mesh.geometry.attributes.position,index=mesh.geometry.index,count=index?index.count:attr.count;
    const faces=mesh.geometry.userData.cadFaces||[];let faceIndex=0;
    // Keep adjacency local to each body; coincident assembly faces are distinct.
    const bodyEdges=new Map();
    for(let i=0;i+2<count;i+=3){
      while(faceIndex<faces.length&&faces[faceIndex].last<i/3)faceIndex++;
      const face=faces[faceIndex],faceId=face&&face.first<=i/3?faceIndex:null;
      const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(attr,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld));
      const normal=new THREE.Vector3().subVectors(points[1],points[0]).cross(new THREE.Vector3().subVectors(points[2],points[0])).normalize();
      if(!normal.lengthSq())continue;
      points.forEach(p=>{positions.push(p.x-center.x,p.y-center.y,p.z-center.z);vertices.set(key(p),p);});
      for(let j=0;j<3;j++){const a=points[j],b=points[(j+1)%3],ka=key(a),kb=key(b),id=ka<kb?`${ka}/${kb}`:`${kb}/${ka}`;if(!bodyEdges.has(id))bodyEdges.set(id,{a,b,normals:[],faces:new Set()});const edge=bodyEdges.get(id);edge.normals.push(normal);if(faceId!==null)edge.faces.add(faceId);}
    }
    for(const [id,edge]of bodyEdges)edges.set(`${mesh.uuid}/${id}`,edge);
  });
  if(!positions.length)throw new Error('O modelo não tem faces para projetar.');
  await nextFrame();signal.throwIfAborted();
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));const bvh=new MeshBVH(geometry);
  return{center,size,edges:[...edges.values()],vertices:[...vertices.values()],bvh,dispose:()=>geometry.dispose()};
}
export async function projectDrawingView(source,kind,signal){
  const def=views[kind],direction=new THREE.Vector3(...def.direction).normalize(),right=new THREE.Vector3(...def.up).cross(direction).normalize(),up=direction.clone().cross(right).normalize();
  const project=p=>{const relative=p.clone().sub(source.center);return{x:relative.dot(right),y:-relative.dot(up),world:p.toArray()};};
  const distance=source.size*2,tolerance=source.size*1e-7,ray=new THREE.Ray();ray.direction.copy(direction).negate();
  const visible=p=>{ray.origin.copy(p).sub(source.center).addScaledVector(direction,distance);const hit=source.bvh.raycastFirst(ray,THREE.DoubleSide);return !hit||hit.distance>=distance-tolerance;};
  const segments=[],points=[],dedup=new Set();for(const p of source.vertices)if(visible(p))points.push(project(p));
  let iteration=0;
  for(const edge of source.edges){
    if(++iteration%300===0){await nextFrame();signal.throwIfAborted();}
    const normals=edge.normals,front=normals.some(n=>n.dot(direction)>1e-6),back=normals.some(n=>n.dot(direction)<-1e-6);
    const cadBoundary=edge.faces.size>1;
    if(normals.length>1&&!cadBoundary&&!(front&&back)&&normals.every(n=>n.dot(normals[0])>.94))continue;
    const a=project(edge.a),b=project(edge.b),length=Math.hypot(b.x-a.x,b.y-a.y);if(length<source.size*1e-8)continue;
    // Clip the edge against triangle depth continuously, avoiding sampled dashes.
    const origin=edge.a.clone().sub(source.center),finish=edge.b.clone().sub(source.center);
    const sweep=new THREE.Box3().setFromPoints([origin,finish,origin.clone().addScaledVector(direction,distance),finish.clone().addScaledVector(direction,distance)]).expandByScalar(tolerance);
    const hidden=[],dx=b.x-a.x,dy=b.y-a.y,depth0=origin.dot(direction),depthDelta=finish.dot(direction)-depth0;
    const cross=(x,y,u,v)=>x*v-y*u;
    source.bvh.shapecast({
      intersectsBounds:box=>box.intersectsBox(sweep),
      intersectsTriangle:triangle=>{
        const q=[triangle.a,triangle.b,triangle.c].map(p=>({x:p.dot(right),y:-p.dot(up),z:p.dot(direction)}));
        if(Math.max(...q.map(p=>p.x))<Math.min(a.x,b.x)||Math.min(...q.map(p=>p.x))>Math.max(a.x,b.x)||Math.max(...q.map(p=>p.y))<Math.min(a.y,b.y)||Math.min(...q.map(p=>p.y))>Math.max(a.y,b.y))return false;
        const [u,v,w]=q,area=cross(v.x-u.x,v.y-u.y,w.x-u.x,w.y-u.y);
        if(Math.abs(area)<source.size*source.size*1e-14)return false;
        const weights=(x,y)=>[cross(v.x-x,v.y-y,w.x-x,w.y-y)/area,cross(w.x-x,w.y-y,u.x-x,u.y-y)/area,cross(u.x-x,u.y-y,v.x-x,v.y-y)/area];
        const wa=weights(a.x,a.y),wb=weights(b.x,b.y);let lo=0,hi=1;
        const clip=(value,delta)=>{if(Math.abs(delta)<1e-14)return value>=0;const t=-value/delta;if(delta>0)lo=Math.max(lo,t);else hi=Math.min(hi,t);return lo<hi;};
        for(let j=0;j<3;j++)if(!clip(wa[j],wb[j]-wa[j]))return false;
        const za=wa.reduce((sum,value,j)=>sum+value*q[j].z,0),zb=wb.reduce((sum,value,j)=>sum+value*q[j].z,0);
        if(clip(za-depth0-tolerance,zb-za-depthDelta)&&lo<hi)hidden.push([lo,hi]);
        return false;
      }
    });
    hidden.sort((x,y)=>x[0]-y[0]);
    const emit=(start,end)=>{
      if((end-start)*length<tolerance)return;
      const segment=[a.x+dx*start,a.y+dy*start,a.x+dx*end,a.y+dy*end],forward=segment.map(v=>Math.round(v/source.size*1e7)).join(','),reverse=[...segment.slice(2),...segment.slice(0,2)].map(v=>Math.round(v/source.size*1e7)).join(','),key=forward<reverse?forward:reverse;
      if(!dedup.has(key)){segments.push(segment);dedup.add(key);}
    };
    let cursor=0;
    for(const [start,end]of hidden){if(start>cursor)emit(cursor,start);cursor=Math.max(cursor,end);if(cursor>=1)break;}
    if(cursor<1)emit(cursor,1);
  }
  const projected=source.vertices.map(project),extent=(key,fn,initial)=>projected.reduce((a,p)=>fn(a,p[key]),initial);
  return{kind,name:def.name,segments,points,minX:extent('x',Math.min,Infinity),maxX:extent('x',Math.max,-Infinity),minY:extent('y',Math.min,Infinity),maxY:extent('y',Math.max,-Infinity)};
}
