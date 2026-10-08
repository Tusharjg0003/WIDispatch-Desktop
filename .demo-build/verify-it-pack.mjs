import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
import {sources,register,roles,ownership,publication,integrations,evidence,deployment,answers} from './it-content.mjs';
const root='C:/Users/mabdu/OneDrive/Desktop/WIDispatch-Desktop';
const out=root+'/outputs/widispatch-it-20260929';
const w=await SpreadsheetFile.importXlsx(await FileBlob.load(out+'/WIDispatch_IT_Reference_and_Readiness.xlsx'));
const specs=JSON.parse(await fs.readFile(root+'/.it-prep/workbook-spec.json','utf8'));
if(w.worksheets.items.length!==8)throw new Error('Workbook sheet count');
for(const s of specs){
 const ws=w.worksheets.getItem(s.name);
 const rows=ws.getRange(`A${s.start+1}:A${s.last}`).values;
 if(rows.length!==s.rows||rows.some(r=>!r[0]))throw new Error('Missing data: '+s.name);
 if(ws.tables.items.length!==1)throw new Error('Missing native filter table: '+s.name);
}
const summary=w.worksheets.getItem('Readiness register').getRange('B4:G4').values[0];
if(summary[1]!==7||summary[3]!==10||summary[5]!==15)throw new Error('Saved calculation mismatch');
for(const rows of [register,roles,ownership,publication,integrations,evidence,deployment,answers])for(const r of rows)for(const id of r.at(-1).split(','))if(!sources[id])throw new Error('Unknown source '+id);
const report={date:'2026-09-29',sheets:8,registerRows:register.length,categoryCounts:{current:7,configuration:10,development:15},formulaErrorScan:'0 matches before export',savedFormulaResults:summary,files:[]};
for(const name of ['WIDispatch_IT_Briefing.pptx','WIDispatch_IT_Reference_and_Readiness.xlsx']){
 const bytes=await fs.readFile(out+'/'+name);report.files.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await fs.writeFile(root+'/.it-prep/pack-validation.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
