self.onmessage=async({data:primitives})=>{
  try{
    const {CadDocument,ACadVersion,Line,TextEntity,XYZ,XY,DwgWriter}=await import('https://esm.sh/@node-projects/acad-ts@3.2.0?bundle');
    const doc=new CadDocument(ACadVersion.AC1015);
    doc.header.insUnits=4;doc.header.measurementUnits=1;doc.header.modelSpaceLimitsMin=new XY(0,0);doc.header.modelSpaceLimitsMax=new XY(297,210);
    for(const p of primitives){
      if(p.type==='line')doc.entities.add(new Line(new XYZ(p.x1,210-p.y1,0),new XYZ(p.x2,210-p.y2,0)));
      else{const text=new TextEntity(p.value.replace(/[^\u0000-\u00ff]/g,c=>'\\U+'+c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')));text.height=p.size;text.insertPoint=new XYZ(p.x,210-p.y,0);text.alignmentPoint=new XYZ(p.x,210-p.y,0);text.horizontalAlignment=p.align==='middle'?1:p.align==='start'?0:2;doc.entities.add(text);}
    }
    const bytes=DwgWriter.writeToBuffer(doc);
    if(new TextDecoder().decode(bytes.subarray(0,6))!=='AC1015')throw new Error('O motor não gerou um DWG válido.');
    self.postMessage({buffer:bytes.buffer},[bytes.buffer]);
  }catch(error){self.postMessage({error:error.message||String(error)});}
};
