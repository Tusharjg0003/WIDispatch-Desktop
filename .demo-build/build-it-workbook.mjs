import fs from 'node:fs/promises';
import path from 'node:path';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
import {asOf,sources,roles,roleExceptions,ownership,publication,integrations,evidence,register,deployment,answers} from './it-content.mjs';

const root='C:/Users/mabdu/OneDrive/Desktop/WIDispatch-Desktop';
const out=path.join(root,'outputs/widispatch-it-20260929');
const build=path.join(root,'.it-prep');
await fs.mkdir(out,{recursive:true});await fs.mkdir(path.join(build,'sheets'),{recursive:true});
const wb=Workbook.create();
const navy='#12374B',teal='#007E92',ink='#18384B';
const col=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const specs=[];
function make(name,title,context,headers,rows,widths,{height=86,start=6}={}){
 const sh=wb.worksheets.add(name);sh.showGridLines=false;
 const last=rows.length+start;
 const all=sh.getRange(`A1:${col(headers.length-1)}${last}`);
 all.format.font={name:'Arial',size:11,color:ink};
 all.format.verticalAlignment='top';all.format.wrapText=true;all.format.rowHeightPx=height;
 sh.getRange(`A1:${col(headers.length-1)}${start-1}`).format.rowHeightPx=24;
 sh.getRange('A1').format.rowHeightPx=14;
 sh.getRange('A2').values=[[title]];sh.getRange('A2').format.font={name:'Arial',size:17,color:navy,bold:true};sh.getRange('A2').format.wrapText=false;sh.getRange('A2').format.rowHeightPx=30;
 sh.getRange('A3').values=[[context]];sh.getRange('A3').format.wrapText=false;sh.getRange('A3').format.rowHeightPx=23;
 for(let c=0;c<headers.length;c++)sh.getRange(`${col(c)}1:${col(c)}${last}`).format.columnWidthPx=widths[c]??260;
 sh.getRange(`A${start}:${col(headers.length-1)}${start}`).values=[headers];
 sh.getRange(`A${start+1}:${col(headers.length-1)}${last}`).values=rows;
 const hdr=sh.getRange(`A${start}:${col(headers.length-1)}${start}`);hdr.format.fill=navy;hdr.format.font={name:'Arial',size:11,color:'#FFFFFF',bold:true};hdr.format.horizontalAlignment='center';hdr.format.verticalAlignment='center';hdr.format.rowHeightPx=40;
 for(let r=start+1;r<=last;r++)if((r-start)%2===0)sh.getRange(`A${r}:${col(headers.length-1)}${r}`).format.fill='#F1F6F8';
 const table=sh.tables.add(`A${start}:${col(headers.length-1)}${last}`,true,name.replace(/[^A-Za-z]/g,'')+'Table');table.showFilterButton=true;table.style='TableStyleLight1';
 for(let r=start+1;r<=last;r++){
  const lines=Math.max(...rows[r-start-1].map((v,c)=>Math.ceil(String(v??'').length/Math.max(10,Math.floor((widths[c]-15)/7)))));
  sh.getRange(`A${r}:${col(headers.length-1)}${r}`).format.rowHeightPx=Math.min(height,Math.max(58,lines*20+28));
 }
 sh.freezePanes.freezeRows(start);sh.freezePanes.freezeColumns(1);
 specs.push({name,rows:rows.length,headers,start,last});return sh;
}
const regRows=register.map(r=>[...r.slice(0,8),r[8],'Open','','']);
const reg=make('Readiness register','WIDispatch IT readiness register',`${asOf}. Work categories describe implementation needs. Owners are proposed. Verification and acceptance remain explicit.`,['ID','Work category','When needed','Capability / control','Current position','Next action','Proposed owner','Acceptance evidence required','Source IDs','Action status','Client decision / named owner','Evidence link / acceptance date'],regRows,[62,182,178,210,345,335,170,350,100,132,270,270],{start:7,height:92});
reg.tabColor=navy;
reg.getRange('B4').values=[['Current capability']];reg.getRange('C4').formulas=[[`=COUNTIF(B8:B${regRows.length+7},"Current capability")`]];
reg.getRange('D4').values=[['Configuration required']];reg.getRange('E4').formulas=[[`=COUNTIF(B8:B${regRows.length+7},"Configuration required")`]];
reg.getRange('F4').values=[['Development required']];reg.getRange('G4').formulas=[[`=COUNTIF(B8:B${regRows.length+7},"Development required")`]];
reg.getRange('A4:G4').format.rowHeightPx=30;reg.getRange('A4:G4').format.font={name:'Arial',size:11,bold:true,color:teal};
reg.getRange(`B8:B${regRows.length+7}`).dataValidation={rule:{type:'list',values:['Current capability','Configuration required','Development required']}};
reg.getRange(`J8:J${regRows.length+7}`).dataValidation={rule:{type:'list',values:['Open','In progress','Verified','Accepted']}};
reg.getRange(`J8:L${regRows.length+7}`).format.fill='#FFF6D9';
reg.getRange(`B8:B${regRows.length+7}`).conditionalFormats.add('containsText',{text:'Development required',format:{fill:'#FBE9E7',font:{color:'#963A2D'}}});
reg.getRange(`B8:B${regRows.length+7}`).conditionalFormats.add('containsText',{text:'Configuration required',format:{fill:'#FFF0D3',font:{color:'#7B580D'}}});
reg.getRange('A5').values=[['Amber cells are editable meeting inputs. Open means action/acceptance is outstanding, including acceptance of an existing capability.']];reg.getRange('A5').format.wrapText=false;reg.getRange('A5').format.rowHeightPx=24;

const role=make('Roles','Portal role-and-permission matrix',`${asOf}. Source-level helper behaviour, not proof that every endpoint enforces it. Portal approvals do not grant Desktop publish permission.`,['Role','View / scope','Edit / submit','Approve / reject','Manage users','View audit','Source IDs'],roles,[250,350,155,150,270,180,100],{height:72});
const rs=17;
role.getRange(`A${rs}`).values=[['Scope exceptions and Desktop responsibilities']];role.getRange(`A${rs}`).format.font={name:'Arial',size:14,bold:true,color:navy};role.getRange(`A${rs}`).format.wrapText=false;
role.getRange(`A${rs+2}:D${rs+2}`).values=[['Area','Finding / boundary','Evidence status','Source IDs']];role.getRange(`A${rs+2}:D${rs+2}`).format.fill=navy;role.getRange(`A${rs+2}:D${rs+2}`).format.font={name:'Arial',size:11,color:'#FFFFFF',bold:true};
for(let i=0;i<roleExceptions.length;i++){
 const n=rs+3+i;role.getRange(`A${n}:D${n}`).values=[roleExceptions[i]];role.getRange(`A${n}:D${n}`).format.font={name:'Arial',size:11,color:ink};role.getRange(`A${n}:D${n}`).format.wrapText=true;role.getRange(`A${n}:D${n}`).format.verticalAlignment='top';role.getRange(`A${n}:D${n}`).format.rowHeightPx=140;
}
make('Data ownership','Data ownership and planning inputs','Business stewards below are proposed responsibilities. Physical persistence and consumer behaviour come from current source.', ['Data domain','Business steward / author','Persistence','How the platform uses it','Ownership / validation boundary','Source IDs'],ownership,[230,255,280,350,380,110],{height:95});
make('Publication','Dispatch publication mapping','Explicit Publish changes planning fields. It does not approve portal inputs, rewrite actuals, or issue equipment-control commands.', ['Output','Source -> target','Record key / operation','Fields written','Fields preserved / behaviour','Where users see it','Source IDs'],publication,[180,260,230,370,330,370,100],{height:125});
make('Integrations','Integration inventory','Source presence does not establish a live integration. External systems and acceptance scope require client agreement.', ['Interface','Data direction / mechanism','Work category','Evidence available','Remaining configuration / work','Proposed owner','Source IDs'],integrations,[205,330,180,285,405,190,100],{height:100});
make('Evidence','Security, performance and recovery evidence',`${asOf}. Source review and local tests. Hosted security, load capacity and recovery remain unverified.`, ['ID','Control / topic','Evidence status','Available evidence','What the evidence does not establish','Next proof / acceptance','Source IDs'],evidence,[65,230,230,395,420,390,100],{height:120});
make('Deployment','Deployment and operating responsibilities','The PowerPoint contains current logical architecture and a separate proposed deployment diagram. This table records decisions and owners.', ['Area','Current / proposed position','Proposed owner','Configuration / decision needed','Acceptance / boundary','Source IDs'],deployment,[220,350,210,410,340,100],{height:95});
make('Meeting answers','Presenter answer sheet','Use these short answers in the IT discussion. Read the follow-up boundary before making a commitment.', ['Likely client question','Suggested answer','Follow-up / boundary','Source IDs'],answers,[260,650,450,100],{height:125});

// Source definitions sit beside the evidence input records, outside the table.
const es=wb.worksheets.getItem('Evidence');
es.getRange('A3').clear({applyTo:'contents'});
es.getRange('B3').values=[['Reviewed 29 September 2026']];
es.getRange('D3').values=[['Source review and local functional tests']];
es.getRange('E3').values=[['Hosted security, load and recovery remain unverified']];
es.getRange('B3:F3').format.wrapText=false;
es.getRange('I6:J6').values=[['Source ID','Source location / evidence scope']];es.getRange('I6:J6').format.fill=navy;es.getRange('I6:J6').format.font={name:'Arial',size:11,color:'#FFFFFF',bold:true};
const srcRows=Object.entries(sources);es.getRange(`I7:J${6+srcRows.length}`).values=srcRows;
es.getRange(`I7:J${6+srcRows.length}`).format.font={name:'Arial',size:11,color:ink};es.getRange(`I7:J${6+srcRows.length}`).format.wrapText=true;es.getRange(`I7:J${6+srcRows.length}`).format.verticalAlignment='top';
es.getRange(`I7:J${6+srcRows.length}`).format.rowHeightPx=100;
es.getRange('H1:H30').format.columnWidthPx=24;es.getRange('I1:I30').format.columnWidthPx=75;es.getRange('J1:J30').format.columnWidthPx=700;
es.getRange('I3').values=[['Source aliases: Desktop / Production = repository roots. Demand / Transmission / Economics = nested WIDispatch app folders.']];es.getRange('I3').format.wrapText=false;es.getRange('I3').format.font={name:'Arial',size:11,color:ink};

wb.recalculate();
const counts=reg.getRange('B4:G4').values;
console.log('REGISTER_COUNTS',JSON.stringify(counts));
if(counts[0][1]!==7||counts[0][3]!==10||counts[0][5]!==15)throw new Error('Register counts mismatch');
// Verify the only calculated summary responds to an edited category, then restore.
const original=reg.getRange('B8').values[0][0];reg.getRange('B8').values=[['Configuration required']];
if(reg.getRange('C4').values[0][0]!==6||reg.getRange('E4').values[0][0]!==11)throw new Error('Category summary did not recalculate');
reg.getRange('B8').values=[[original]];wb.recalculate();
const scan=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!',options:{useRegex:true,maxResults:20},maxChars:1200});
await fs.writeFile(path.join(build,'workbook-formula-scan.ndjson'),scan.ndjson);
await fs.writeFile(path.join(build,'workbook-spec.json'),JSON.stringify(specs,null,2));
const file=await SpreadsheetFile.exportXlsx(wb);await file.save(path.join(out,'WIDispatch_IT_Reference_and_Readiness.xlsx'));
console.log('EXPORTED_WORKBOOK',specs.length);
for(const sp of specs){
 const end=Math.min(sp.last,sp.start+5);
 const blob=await wb.render({sheetName:sp.name,range:`A2:${col(Math.min(sp.headers.length-1,5))}${end}`,scale:1,format:'png'});
 await fs.writeFile(path.join(build,'sheets',sp.name.replaceAll(' ','-')+'.png'),new Uint8Array(await blob.arrayBuffer()));
}
for(const [name,range,fileName] of [['Readiness register','G7:L12','register-right'],['Roles','A17:D26','role-exceptions'],['Publication','D6:G10','publication-right'],['Evidence','D6:G11','evidence-right']]){
 const blob=await wb.render({sheetName:name,range,scale:1,format:'png'});await fs.writeFile(path.join(build,'sheets',fileName+'.png'),new Uint8Array(await blob.arrayBuffer()));
}
console.log('RENDERED_WORKBOOK');
