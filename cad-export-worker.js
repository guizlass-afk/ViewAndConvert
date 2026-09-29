// OpenCascade.js is loaded only when CAD export is requested. Files stay in this worker.
const CAD_BASE='https://cdn.jsdelivr.net/npm/opencascade.js@2.0.0-beta.b5ff984/dist/';
const progress=(value,detail)=>self.postMessage({type:'progress',value,detail});
self.onmessage=async({data})=>{
  try{
    progress(5,'Carregando o motor de exportação CAD (primeiro uso: cerca de 50 MB)…');
    const {default:init}=await import(`${CAD_BASE}opencascade.full.js`);
    const oc=await init({locateFile:file=>`${CAD_BASE}${file}`,print:()=>{},printErr:()=>{}});
    const range=new oc.Message_ProgressRange_1();
    const done=oc.IFSelect_ReturnStatus.IFSelect_RetDone;
    let shape;
    if(data.source){
      progress(25,'Lendo a geometria CAD original…');
      const path=`/source.${data.extension}`;oc.FS.writeFile(path,new Uint8Array(data.source));
      if(data.extension==='brep'){
        shape=new oc.TopoDS_Shape();const builder=new oc.BRep_Builder();
        if(!oc.BRepTools.Read_2(shape,path,builder,range))throw new Error('Não foi possível ler o BREP original.');
        builder.delete();
      }else{
        const reader=['step','stp'].includes(data.extension)?new oc.STEPControl_Reader_1():new oc.IGESControl_Reader_1();
        if(reader.ReadFile(path)!==done)throw new Error('Não foi possível ler o arquivo CAD original.');
        if(reader.TransferRoots(range)<1)throw new Error('O arquivo não contém geometria CAD convertível.');
        shape=reader.OneShape();reader.delete();
      }
      oc.FS.unlink(path);
      if(shape.IsNull())throw new Error('A geometria CAD está vazia.');
      if(data.scale!==1){
        const origin=new oc.gp_Pnt_3(0,0,0),trsf=new oc.gp_Trsf_1();trsf.SetScale(origin,data.scale);
        const transform=new oc.BRepBuilderAPI_Transform_2(shape,trsf,true),scaled=transform.Shape();
        shape.delete();shape=scaled;transform.delete();trsf.delete();origin.delete();
      }
    }else{
      progress(25,'Convertendo triângulos em faces CAD…');
      shape=new oc.TopoDS_Compound();const builder=new oc.BRep_Builder();builder.MakeCompound(shape);
      let count=0,total=data.meshes.reduce((sum,mesh)=>sum+mesh.length/9,0);
      for(const positions of data.meshes){
        for(let i=0;i<positions.length;i+=9){
          const a=new oc.gp_Pnt_3(...positions.subarray(i,i+3)),b=new oc.gp_Pnt_3(...positions.subarray(i+3,i+6)),c=new oc.gp_Pnt_3(...positions.subarray(i+6,i+9));
          const polygon=new oc.BRepBuilderAPI_MakePolygon_3(a,b,c,true);
          if(!polygon.IsDone())throw new Error('A malha contém um triângulo degenerado. Repare a malha antes de converter.');
          const wire=polygon.Wire(),maker=new oc.BRepBuilderAPI_MakeFace_15(wire,true);
          if(!maker.IsDone())throw new Error('Não foi possível criar uma face CAD. Verifique a malha de origem.');
          const face=maker.Face();builder.Add(shape,face);
          face.delete();maker.delete();wire.delete();polygon.delete();a.delete();b.delete();c.delete();
          count++;if(count%500===0)progress(25+45*count/total,`Criando faces CAD: ${count.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`);
        }
      }
      builder.delete();if(!count)throw new Error('A malha não contém triângulos.');
    }
    progress(75,`Gravando ${data.format.toUpperCase()}…`);
    const output=`/converted.${data.format}`;
    if(data.format==='step'){
      const writer=new oc.STEPControl_Writer_1();
      if(writer.Transfer(shape,oc.STEPControl_StepModelType.STEPControl_AsIs,true,range)!==done||writer.Write(output)!==done)throw new Error('Falha ao escrever o STEP.');
      writer.delete();
    }else if(data.format==='iges'){
      const writer=new oc.IGESControl_Writer_2('MM',0);
      if(!writer.AddShape(shape,range))throw new Error('A geometria não pôde ser transferida para IGES.');
      writer.ComputeModel();if(!writer.Write_2(output,false))throw new Error('Falha ao escrever o IGES.');writer.delete();
    }else if(data.format==='brep'){
      if(!oc.BRepTools.Write_3(shape,output,range))throw new Error('Falha ao escrever o BREP.');
    }else throw new Error('Formato CAD de saída não reconhecido.');
    const bytes=oc.FS.readFile(output);if(!bytes.length)throw new Error('O conversor gerou um arquivo vazio.');
    oc.FS.unlink(output);shape.delete();range.delete();
    self.postMessage({type:'result',buffer:bytes.buffer},[bytes.buffer]);
  }catch(error){self.postMessage({type:'error',message:error?.message||'O motor CAD não conseguiu converter a geometria. O arquivo pode ser inválido ou exceder a memória disponível.'});}
};