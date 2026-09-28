import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Presentation, PresentationFile} from '@oai/artifact-tool';
import sharp from 'sharp';
import {slides as definitions} from './deck-content.mjs';

const root='C:/Users/mabdu/OneDrive/Desktop/WIDispatch-Desktop';
const build=path.join(root,'.demo-build');
const skill='C:/Users/mabdu/.codex/plugins/cache/openai-primary-runtime/presentations/26.921.10847/skills/presentations';
const python='C:/Users/mabdu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
const presentation=Presentation.create({slideSize:{width:1600,height:900}});
const C={navy:'#12374B',teal:'#007E92',ink:'#18384B',muted:'#547080',pale:'#EEF5F7',white:'#FFFFFF'};
const font='Arial';
function text(slide,value,x,y,w,h,size=28,color=C.ink,bold=false){
 const s=slide.shapes.add({geometry:'textbox',name:value.slice(0,55),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 s.text=value;
 s.text.style={typeface:font,fontSize:size,color,bold,autoFit:'none',wrap:'word',verticalAlignment:'top',insets:{left:0,right:0,top:0,bottom:0}};
 return s;
}
async function shot(slide,file,frame,crop){
 let bytes=await fs.readFile(path.join(build,'screenshots',file));
 if(crop){const m=await sharp(bytes).metadata();const [l,t,r,b]=crop;bytes=await sharp(bytes).extract({left:Math.round(m.width*l),top:Math.round(m.height*t),width:Math.round(m.width*(1-l-r)),height:Math.round(m.height*(1-t-b))}).png().toBuffer();}
 slide.images.add({blob:new Uint8Array(bytes),contentType:'image/png',alt:file.replaceAll('-',' ').replace('.png',''),fit:'contain',position:frame});
}
const defs=[...definitions];
const ci=defs.findIndex(x=>x.title==='Draft decisions and proposed publication');
defs.splice(ci,0,{title:'The shortage day on the canvas',image:'simulation-canvas.png',wide:true,takeaway:'Select a day to inspect its flows, binding constraints and city-gate shortage.',notes:'The day selector is set to 15 August 2026. Required volume is 300,000 m³, delivered volume is 240,000 m³ and shortage is 60,000 m³. Use the day controls, Flow and Bottlenecks to connect table results to network elements. Source: Desktop Simulation Canvas.'});
const nativeTables=[];
await fs.mkdir(path.join(build,'renders'),{recursive:true});
for(let i=0;i<defs.length;i++){
 const d=defs[i],s=presentation.slides.add();s.background.fill=C.white;
 if(d.kind==='cover'){
  s.background.fill=C.navy;
  text(s,'UTILITY OPTIMO',86,90,1400,50,24,'#8AD6DE',true);
  text(s,d.title,80,240,1440,125,100,C.white,true);
  text(s,d.subtitle,84,387,1420,100,54,C.white);
  text(s,d.body,86,578,1370,65,29,'#C5DDE7');
  text(s,'Sample-data demonstration   /   September 2026',86,786,1400,45,22,'#9CC1D1');
 }else{
  text(s,d.title,60,45,1480,103,44,C.navy,true);
  if(d.kind==='agenda'){
   d.rows.forEach((r,j)=>{const y=199+j*105;text(s,r[0],64,y,100,60,42,C.teal,true);text(s,r[1],185,y+1,1110,62,32);text(s,r[2],1300,y+5,240,58,25,C.muted);});
  }else if(d.kind==='text'){
   d.columns.forEach((c,j)=>{const x=64+j*505;text(s,c[0],x,205,448,100,32,C.teal,true);text(s,c[1],x,322,445,336,31);});
  }else if(d.kind==='quote'){
   text(s,d.quote,92,210,1390,300,43,C.navy);
   text(s,d.subtitle,96,543,1390,65,25,C.teal,true);
   text(s,d.body,96,638,1360,145,28,C.muted);
  }else if(d.kind==='table'){
   nativeTables.push(i+1);
   const vals=[d.headers,...d.rows];
   const table=s.tables.add({rows:vals.length,columns:d.headers.length,left:64,top:184,width:1472,height:520,values:vals,columnWidths:d.headers.length===4?[240,410,410,412]:[330,560,582]});
   table.cells.block({row:0,column:0,rowCount:vals.length,columnCount:d.headers.length}).assign({textStyle:{typeface:font,fontSize:26,color:C.ink},margins:{left:16,right:16,top:18,bottom:14},anchor:'center'});
   table.cells.block({row:0,column:0,rowCount:1,columnCount:d.headers.length}).assign({fill:C.navy,textStyle:{typeface:font,fontSize:26,bold:true,color:C.white}});
   for(let j=1;j<vals.length;j++)table.cells.block({row:j,column:0,rowCount:1,columnCount:d.headers.length}).fill=j%2?C.pale:C.white;
  }else{
   let hasImage=true;try{await fs.access(path.join(build,'screenshots',d.image));}catch{hasImage=false;}
   if(!hasImage)throw new Error('Missing screenshot '+d.image);
   await shot(s,d.image,d.wide?{left:60,top:160,width:1480,height:606}:{left:50,top:175,width:1120,height:570},d.crop);
   if(!d.wide)d.steps.forEach((t,j)=>{text(s,String(j+1).padStart(2,'0'),1210,186+j*174,100,45,25,C.teal,true);text(s,t,1210,235+j*174,323,125,27);});
  }
  if(d.takeaway)text(s,d.takeaway,64,782,1460,64,25,C.teal,true);
  text(s,'WIDispatch   /   Client demonstration',64,858,1000,25,17,C.muted);
  text(s,String(i+1).padStart(2,'0'),1460,852,76,36,22,C.muted);
 }
 s.speakerNotes.textFrame.setText(d.notes+'\n\nDemonstration guidance: Screenshots are sample application states. Use approved trial data for live input and publication.');
}
await fs.writeFile(path.join(build,'content-index.json'),JSON.stringify(defs,null,2));
const candidate=path.join(build,'candidate.pptx');
await (await PresentationFile.exportPptx(presentation)).save(candidate);
console.log('EXPORTED',defs.length,'slides');
const final=path.join(root,'output/presentations/WIDispatch_Client_Demo.pptx');
const result=await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath:final,pythonExecutable:python,integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','15240000,8572500','--validate-bullet-geometry','--validate-heading-fit',...nativeTables.flatMap(n=>['--require-native-table-slide',String(n)])],requiredNativeTableOwnerSlides:nativeTables,fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,receiptPath:path.join(build,'validation-final.json')});
console.log('FINALIZED',JSON.stringify(result));
for(let i=0;i<presentation.slides.items.length;i++){
 const blob=await presentation.export({slide:presentation.slides.items[i],format:'png',scale:1});
 await fs.writeFile(path.join(build,'renders',`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await blob.arrayBuffer()));
 console.log('RENDERED',i+1);
}
