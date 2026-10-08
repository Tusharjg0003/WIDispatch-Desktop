import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {FileBlob,PresentationFile} from '@oai/artifact-tool';

const root='C:/Users/mabdu/OneDrive/Desktop/WIDispatch-Desktop';
const build=path.join(root,'.demo-build/introductions');
const skill='C:/Users/mabdu/.codex/plugins/cache/openai-primary-runtime/presentations/26.921.10847/skills/presentations';
const source='C:/Users/mabdu/OneDrive/Desktop/Utility Optimo/WIDispatch/Documentation/WIDispatch_Client_Demonstration.pptx';
const final=path.join(root,'output/presentations/WIDispatch_Client_Demonstration_With_Introductions.pptx');
const python='C:/Users/mabdu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
await fs.mkdir(path.join(build,'renders'),{recursive:true});
const p=await PresentationFile.importPptx(await FileBlob.load(source));
const oldSlides=[...p.slides.items];
if(oldSlides.length!==78)throw new Error(`Expected 78 source slides, found ${oldSlides.length}`);
await fs.writeFile(path.join(build,'source-inspect.ndjson'),(await p.inspect({kind:'slide,textbox,shape,image,table,notes,layout',maxChars:500000})).ndjson);
const oldIndex=JSON.parse(await fs.readFile(path.join(root,'.demo-build/expanded-index.json'),'utf8'));
const intros=[
 {before:2,title:'WIDispatch: purpose and objectives',
  purpose:'Support coordinated water dispatch planning across production, transmission, storage and demand.',
  functions:'Combine operational inputs and approved costs with a network model to simulate supply, identify constraints, review decisions and publish allocations.',
  objective:'Meet demand as far as available capacity allows, manage shortages and assess variable operating cost while preserving decision accountability.',
  notes:'Introduce WIDispatch as the complete operating cycle shared by the Desktop planning application and four domain portals. Approved inputs establish the planning basis. Simulation produces a draft for review, and publication hands the agreed decisions to operations. The dispatch cost objective uses variable operating cost, not total lifecycle cost. Transition: the next slide outlines how we will follow that cycle in the demonstration. Sources: WIDispatch Product Profile and Operating Overview, pp. 1–3; existing demonstrated operating workflow.'},
 {before:4,title:'WIDispatch Desktop: planning and dispatch',
  purpose:'Provide the planner’s workspace for network modelling and dispatch decisions.',
  functions:'Maintain the shared asset registry, build networks and transmission systems, apply scenario assumptions, run simulations, explain results and publish reviewed decisions.',
  objective:'Produce a feasible, explainable operating plan that operational teams can act on.',
  notes:'Desktop combines the network and the operational planning basis. It supports asset identity, network topology, reusable systems, emergency scenarios, results review and the final publication step. Portal input approval remains distinct from the planner’s decision review. The asset registry appears first because stable identities connect later inputs, network elements and outputs. Transition: begin with the shared registry, then return to network building and simulation after reviewing the portal workflows. Sources: demonstrated Asset Registry, Network Builder, Simulation Config and Decisions views.'},
 {before:7,title:'Production Portal: supply availability and reporting',
  purpose:'Capture the production information needed for dispatch planning and operational follow-up.',
  functions:'Record production, quality, maintenance and outages, with applicable submission and approval workflows. Display published production requests alongside operating records.',
  objective:'Give planners a dependable view of available supply and help operators reconcile actual production with requested output.',
  notes:'Explain Production as the operational source of the supply picture. Maintenance and outage timing can reduce availability, while actual production supports reconciliation after operation. The published requested allocation is different from actual output. Quality and outage records do not necessarily follow the same approval path as production submissions and planned maintenance. Transition: start at the Production dashboard, then open a plant and follow its inputs and approval workflow. Sources: demonstrated Production dashboard, plant records and published allocation view; PRD PR-003.'},
 {before:16,title:'Demand Portal: requirements and reconciliation',
  purpose:'Capture water requirements at city gates and support delivery reconciliation.',
  functions:'Record demand for approval and maintain receiving-point operating information and actual receipts.',
  objective:'Establish an approved demand basis and reveal differences between requirements and operational outcomes.',
  notes:'The Demand Portal expresses what receiving points need for a defined date range. Keep requested demand, the planner’s allocation and actual received water distinct. The current portal table does not expose every published Desktop decision field, so use Desktop Decisions when reviewing the planner’s approved quantity and comment. Transition: use the Demand dashboard to identify a delivery gap, then open the relevant city gate and its demand entry. Sources: demonstrated Demand dashboard, demand approval and reconciliation views; PRD PR-004 and PR-015.'},
 {before:19,title:'Transmission Portal: network availability and water movement',
  purpose:'Provide operational visibility into the infrastructure carrying water between supply and receiving points.',
  functions:'Display Desktop-authored systems and lines, pump availability, maintenance and outages, and receipt/delivery records.',
  objective:'Represent transmission constraints accurately and support reconciliation of water movement.',
  notes:'The portal connects the saved system structure with the operating condition of transmission assets and records of water movement. Desktop authors the systems and lines. Explain pump throughput, line capacity and receipt/delivery records as distinct information. Do not add pump and line capacities together to describe system size. Transition: start with the Transmission dashboard, then inspect its systems page before reviewing individual pump stations. Sources: demonstrated Transmission dashboard, systems list/detail, pump availability and reconciliation views.'},
 {before:25,title:'Economics Portal: approved cost assumptions',
  purpose:'Maintain the approved, effective-dated cost information used in planning and financial review.',
  functions:'Support cost proposals and approvals, including variable O&M, fixed costs and capital information.',
  objective:'Give dispatch a traceable variable operating-cost basis and support review of operating outcomes.',
  notes:'Emphasize the effective date and approved status of a cost snapshot. The financial records contain several cost categories, while the dispatch calculation uses variable O&M. Publication of a dispatch decision does not rewrite the approved economic snapshot. Transition: open the Economics dashboard, then inspect the financial record and follow a cost proposal through approval. Sources: demonstrated Economics dashboard, Financials, proposals and approvals; PRD PR-006; Product Profile p. 3.'}
];
function text(s,value,x,y,w,h,size,color,bold=false){
 const box=s.shapes.add({geometry:'textbox',name:value.slice(0,55),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 box.text=value;
 box.text.style={typeface:'Arial',fontSize:size,color,bold,autoFit:'none',wrap:'word',verticalAlignment:'top',insets:{left:0,right:0,top:0,bottom:0}};
 return box;
}
const entries=oldSlides.map((slide,i)=>({slide,title:oldIndex[i].title,originalSlide:i+1}));
for(const d of intros){
 const s=p.slides.add();s.background.fill='#FFFFFF';
 text(s,d.title,60,45,1480,110,44,'#12374B',true);
 [['Purpose',d.purpose],['What it does',d.functions],['Objective',d.objective]].forEach(([head,body],i)=>{
  const x=64+i*505;
  text(s,head,x,205,448,100,32,'#007E92',true);
  text(s,body,x,322,445,400,31,'#18384B');
 });
 text(s,'WIDispatch   /   Client demonstration',64,858,1000,25,17,'#547080');
 text(s,'00',1460,852,76,36,22,'#547080');
 s.speakerNotes.textFrame.setText(d.notes);
 const pos=entries.findIndex(e=>e.originalSlide===d.before);
 if(pos<0)throw new Error('Missing insertion anchor');
 s.moveTo(pos);
 entries.splice(pos,0,{slide:s,title:d.title,introduction:true});
}
if(p.slides.items.length!==84)throw new Error('Expected 84 slides');
for(let i=0;i<entries.length;i++){
 const slide=p.slides.items[i];
 if(slide.id!==entries[i].slide.id)throw new Error(`Slide ordering mismatch ${i+1}`);
 if(i===0)continue;
 const page=slide.shapes.items.filter(s=>Math.abs(s.position.left-1460)<1&&Math.abs(s.position.top-852)<1);
 if(page.length!==1)throw new Error(`Page number not unique on ${i+1}`);
 page[0].text=String(i+1).padStart(2,'0');
}
const index=entries.map(({slide,...e},i)=>({slide:i+1,...e}));
await fs.writeFile(path.join(build,'slide-index.json'),JSON.stringify(index,null,2));
const tables=index.filter(e=>[68,76,77].includes(e.originalSlide)).map(e=>e.slide);
const candidate=path.join(build,'candidate.pptx');
await(await PresentationFile.exportPptx(p)).save(candidate);
console.log('EXPORTED',index.length,'slides');
const result=await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath:final,pythonExecutable:python,integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),explicitTotalSlideCount:84,layoutArgs:['--expected-slide-size-emu','15240000,8572500','--validate-bullet-geometry','--validate-heading-fit',...tables.flatMap(n=>['--require-native-table-slide',String(n)])],requiredNativeTableOwnerSlides:tables,fontPolicy:{basis:'reference',families:['Arial'],referencePath:source,referenceSha256:'b4f7a574f63a3837310235574f0e2aa0e887d25aa683e0b7cec5942142e1f1c2'},verifyArtifactToolImport:true,receiptPath:path.join(build,'validation.json')});
console.log('FINALIZED',result.finalPath);
for(let i=0;i<p.slides.items.length;i++){
 const blob=await p.export({slide:p.slides.items[i],format:'png',scale:1});
 await fs.writeFile(path.join(build,'renders',`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await blob.arrayBuffer()));
}
console.log('RENDERED 84');
