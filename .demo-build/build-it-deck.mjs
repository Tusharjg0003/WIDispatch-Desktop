import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Presentation,PresentationFile,FileBlob} from '@oai/artifact-tool';
import {asOf,ref} from './it-content.mjs';
const root='C:/Users/mabdu/OneDrive/Desktop/WIDispatch-Desktop';
const build=path.join(root,'.it-prep');
const output=path.join(root,'outputs/widispatch-it-20260929');
const skill='C:/Users/mabdu/.codex/plugins/cache/openai-primary-runtime/presentations/26.921.10847/skills/presentations';
const python='C:/Users/mabdu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
await fs.mkdir(path.join(build,'slides'),{recursive:true});await fs.mkdir(output,{recursive:true});
const p=Presentation.create({slideSize:{width:1600,height:900}});
const C={navy:'#12374B',teal:'#007E92',ink:'#18384B',muted:'#547080',pale:'#F1F6F8',white:'#FFFFFF',amber:'#8A5E12'};
const index=[],tables=[];
function txt(s,t,x,y,w,h,size=28,color=C.ink,bold=false){const sh=s.shapes.add({geometry:'textbox',name:t.slice(0,65),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});sh.text=t;sh.text.style={typeface:'Arial',fontSize:size,color,bold,autoFit:'none',wrap:'word',verticalAlignment:'top',insets:{left:0,right:0,top:0,bottom:0}};return sh;}
function slide(title,context,notes,sourceIds){const s=p.slides.add();s.background.fill=C.white;txt(s,title,64,45,1472,90,44,C.navy,true);if(context)txt(s,context,64,137,1465,65,25,C.muted);txt(s,'WIDispatch   /   IT briefing   /   29 September 2026',64,858,1220,26,17,C.muted);txt(s,String(p.slides.items.length).padStart(2,'0'),1460,852,76,36,22,C.muted);s.speakerNotes.textFrame.setText(notes+'\n\nEvidence basis: current local source inspected 29 September 2026. Source findings do not certify deployment controls.\n'+ref(sourceIds));index.push({slide:p.slides.items.length,title});return s;}
function table(s,headers,rows,widths,{top=218,height=510,size=26}={}){const vals=[headers,...rows];const t=s.tables.add({rows:vals.length,columns:headers.length,left:64,top,width:1472,height,values:vals,columnWidths:widths});t.cells.block({row:0,column:0,rowCount:vals.length,columnCount:headers.length}).assign({textStyle:{typeface:'Arial',fontSize:size,color:C.ink},margins:{left:14,right:14,top:15,bottom:13},anchor:'center'});t.cells.block({row:0,column:0,rowCount:1,columnCount:headers.length}).assign({fill:C.navy,textStyle:{typeface:'Arial',fontSize:size,bold:true,color:C.white}});for(let r=1;r<vals.length;r++)t.cells.block({row:r,column:0,rowCount:1,columnCount:headers.length}).fill=r%2?C.pale:C.white;tables.push(p.slides.items.length);return t;}
function cols(s,data,{y=238,size=29}={}){data.forEach(([head,body],i)=>{const x=64+i*505;txt(s,head,x,y,450,80,32,C.teal,true);txt(s,body,x,y+113,445,370,size);});}
function note(s,t,color=C.teal){txt(s,t,64,773,1472,66,25,color,true);}
function box(s,t,x,y,w,h,{fill=C.pale,size=29,dashed=false}={}){const sh=s.shapes.add({geometry:'rect',name:t.replaceAll('\n',' ').slice(0,60),position:{left:x,top:y,width:w,height:h},fill,line:{fill:C.teal,width:2,style:dashed?'dashed':'solid'}});sh.text=t;sh.text.style={typeface:'Arial',fontSize:size,color:C.navy,bold:false,alignment:'center',verticalAlignment:'middle',wrap:'word',autoFit:'none',insets:{left:18,right:18,top:15,bottom:15}};return sh;}
function link(s,a,b,from='right',to='left',dashed=false){return s.shapes.connect(a,b,{kind:'elbow',fromSide:from,toSide:to,line:{fill:C.teal,width:3,style:dashed?'dashed':'solid'},head:{type:'triangle',width:'med',length:'med'},tail:{type:'triangle',width:'med',length:'med'}});}

// 1
{
 const s=p.slides.add();s.background.fill=C.navy;
 txt(s,'UTILITY OPTIMO',80,85,1400,50,24,'#8AD6DE',true);
 txt(s,'WIDispatch',80,220,1420,125,94,C.white,true);
 txt(s,'IT architecture and readiness',84,374,1430,100,53,C.white);
 txt(s,'Desktop and four operational portals',86,535,1350,55,31,'#D5E9EE');
 txt(s,asOf,86,790,1200,40,24,'#A3C7D3');
 s.speakerNotes.textFrame.setText('Opening: WIDispatch coordinates operational information, network-based dispatch planning and reviewed publication. This briefing explains the current implementation, the deployment decisions and the work/evidence needed for production acceptance. The companion workbook contains detailed matrices, field mappings, evidence and 32 readiness entries. This is a technical discussion pack, not a security certification or a deployment commitment. Suggested use: 15–20 minutes plus questions.');
 index.push({slide:1,title:'WIDispatch IT architecture and readiness'});
}
// 2
{
 const s=slide('Current logical architecture','Source-confirmed application relationships. Hosting and network controls are environment-specific.','Explain that Desktop is a browser workspace, not an installed Windows executable in the inspected source. Each portal has its own Next.js server/API routes. Desktop has a separate Express API. Both use MongoDB collections directly through their server-side code. There is no evidenced integration bus between the five applications. Database selection is inconsistent across helpers and assignment routes, so the shared-data intent needs configuration/code reconciliation. No live connection strings were inspected. Transition: distinguish this current logical arrangement from the proposed deployment boundaries.','D1,D2,D4,D5');
 const users=box(s,'Operational users\nand approvers\nBrowser',64,245,310,155);
 const portals=box(s,'Four Next.js portal services\nProduction / Demand\nTransmission / Economics\nUI and API routes',475,218,630,200);
 const planners=box(s,'Dispatch planners\nBrowser',64,505,310,130);
 const desktop=box(s,'Desktop frontend\nReact / Vite',475,505,300,130);
 const api=box(s,'Desktop API\nExpress / Node.js',845,505,290,130);
 const db=box(s,'MongoDB\n\nOperational records\nAssets and networks\nCosts and plans',1230,260,305,355,{size:27});
 link(s,users,portals);link(s,planners,desktop);link(s,desktop,api);link(s,portals,db);link(s,api,db);
 txt(s,'Links show request/response and data exchange',475,678,950,50,26,C.muted);
 note(s,'Before deployment: reconcile the authoritative database and enforce Desktop API identity and permissions.');
}
// 3
{
 const s=slide('Proposed deployment and trust boundaries','Design for agreement with client IT. This diagram does not represent a verified production deployment.','Use this diagram to ask where the platform will be hosted and who operates it. Proposed HTTPS ingress serves portal routes and Desktop static frontend/API. Private database access, backups and monitoring are deployment controls to establish. SSO federation is not in the inspected login path and requires integration. The SRD trial sizing proposal is 4 vCPU, 16 GB RAM and around 100 GB storage, subject to measured acceptance. Do not present it as a production minimum or certified capacity. Transactions also require application changes; choosing a MongoDB replica set alone does not repair publication. A single-node replica set does not provide HA.','D1,D2,P2,R1');
 const b=box(s,'Client browsers',65,235,285,115);
 const ingress=box(s,'Approved HTTPS entry point\nDNS, certificate and reverse proxy',460,220,520,140,{size:27});
 const idp=box(s,'Corporate identity provider\nSSO integration required',1125,220,405,140,{dashed:true,size:26});
 const boundary=s.shapes.add({geometry:'rect',name:'Proposed private service boundary',position:{left:65,top:415,width:1470,height:320},fill:'none',line:{fill:C.muted,width:2,style:'dashed'}});
 txt(s,'PRIVATE APPLICATION AND DATA ZONE',95,430,1200,36,22,C.muted,true);
 const apps=box(s,'Four portal services\nDesktop frontend and Express API',460,510,520,165,{size:30});
 const db=box(s,'Private MongoDB\nEnvironment-specific access',1125,500,380,110,{size:26});
 const backup=box(s,'Protected backups / monitoring',1125,653,380,58,{size:23});
 link(s,b,ingress);link(s,ingress,apps,'bottom','top');link(s,apps,db);link(s,db,backup,'bottom','top',true);link(s,ingress,idp,'right','left',true);
 note(s,'Agree hosting region, service ownership, recovery targets, network access and acceptance tests.');
}
// 4
{
 const s=slide('Portal role-and-permission matrix','Helper permissions in the current source. Asset and endpoint exceptions are detailed in the workbook.','Walk left to right: viewing scope does not imply approval permission. GM and Dashboard Approver are the approval roles in the inspected helpers. Regional and city heads can manage subordinate user roles. The asset manager retains the internal plant_manager code even where the portal presents city gates or pump assets. The Production GM can be entity-scoped; the other inspected getAccessiblePlants helpers are global for GM. Approval routes require further scope and maker/checker enforcement. The matrix describes code-level rules, not complete authenticated endpoint verification.','P1,P3');
 table(s,['Role','View scope','Edit / submit','Approve','User admin','Audit'],[
 ['GM / Head','Entity / global*','Scoped','Yes','All roles*','Hierarchy'],
 ['Regional Head','Region','Scoped','No','Subordinate','Hierarchy'],
 ['City / Governorate Head','City / governorate','Scoped','No','Subordinate','Hierarchy'],
 ['Asset manager','Assigned assets*','Scoped','No','No','No'],
 ['Read-only','Assigned scope*','No','No','No','No'],
 ['Dashboard Approver','Approvals only','No','Yes','No','No']
 ],[290,290,235,175,230,252],{height:506,size:25});
 note(s,'* Scope behaviour varies by portal and asset type. Portal roles do not establish Desktop publish permissions.');
}
// 5
{
 const s=slide('Permission boundaries to close','Production acceptance requires server-side enforcement across every relevant route.','The client may ask about separation of duties. Say that input entry, approval, dispatch planning and publication are distinct business responsibilities. The current code does not prove that distinct people must perform every step. The inspected portal approval routes check role and fetch record by ID, without an asset-scope or distinct-submitter gate. The Desktop server has no authentication middleware in the inspected file. The proposed planner, reviewer/publisher and platform-administrator responsibilities therefore need implementation and agreement. No live authorization probes were run.','D1,P1,P3');
 cols(s,[
 ['Portal scope','Approval endpoints need record-level scope checks and an agreed rule for self-approval. Non-plant asset scope also varies by portal.'],
 ['Desktop actions','Define who may change assets, edit networks, run simulations, override decisions and publish. Enforce these permissions in the API.'],
 ['Administration','Separate application user management from hosting, database, backup and security administration. Agree offboarding and audit access.']
 ]);
 note(s,'Acceptance: anonymous access, cross-scope access and prohibited self-approval fail without changing data.');
}
// 6
{
 const s=slide('Data ownership and planning inputs','Business ownership should follow the records each team maintains. Stable asset IDs connect the cycle.','The workbook gives the underlying collections and field boundaries. Asset stewardship is a proposed responsibility, because more than one app has asset routes. Desktop owns network/configuration/plan authoring in this workflow. Demand requirements, published allocation and actual receipts are separate values. Economics supplies effective-dated approved variable O&M; plant specifications and a 2.10 SAR/m3 default remain fallbacks in code. The dispatch loader uses approved demand, eligible maintenance and approved outages; do not state that every maintenance record must already be approved to affect availability.','D4,D5,D6,P8');
 table(s,['Information','Operational author / steward','Planning or reconciliation use'],[
 ['Assets / topology','Asset steward / Desktop planner','Shared identity, network connectivity and capacities'],
 ['Production','Production team','Capacity context, operating records and actual output'],
 ['Demand / receipts','Demand team','Approved requirements and actual received volume'],
 ['Maintenance / outages','Relevant asset operations team','Availability losses and operating constraints'],
 ['Water movement','Transmission team','Receipt and delivery reconciliation'],
 ['Cost assumptions','Economics team and approvers','Effective variable O&M for dispatch'],
 ['Configuration / plans','Desktop planner','Scenario assumptions, results and reviewed decisions']
 ],[350,470,652],{height:536,size:25});
 note(s,'Portal input approval, simulation, decision review and publication remain distinct steps.');
}
// 7
{
 const s=slide('What publication writes back','The inspected publish path updates three operational collections, then marks the plan as published.','Explain the exact field ownership. Production rows are upserted by plant/date with required_m3 and data_source=desktop_simulation. Existing operating fields are preserved; newly inserted rows begin in draft. Demand rows are updated by gate/date, without upsert. Maintenance matches record IDs and writes decision metadata, not rescheduled dates. Each decision carries plan lineage. Transmission actual receipt/delivery and financial cost snapshots are not rewritten. Publication counts represent modified/upserted documents and do not demonstrate every expected record matched.','D3,D4,P4');
 table(s,['Destination','Published values','Preserved / important limit'],[
 ['Production inputs','Requested production, decision status and plan ID','Actual output and existing portal approval state'],
 ['Demand inputs','Approved allocation, recommendation, rationale and plan ID','Original requirement and actual receipts; update only'],
 ['Maintenance records','Decision, recommendation, comments and plan ID','Maintenance dates and portal submission state'],
 ['Dispatch plan','Published status, timestamp and write counts','Status changes after operational collection writes'],
 ['Transmission / Economics','No direct writes to actual movement or cost records','Saved systems and economic approval have separate lifecycles']
 ],[335,590,547],{height:510,size:25});
 note(s,'Demand daily-table display does not currently map every published decision field. Validate the agreed user view.');
}
// 8
{
 const s=slide('Decision edits and publication integrity','Existing review controls are useful, but they do not establish a fully protected publication transaction.','Likely question: if I increase a city gate allocation, where does the water come from? Current code only bounds demand edits between zero and required and applies comment rules. It does not re-solve the flows or plant allocations. A feasibility revalidation policy is therefore required. Another question: what if a publish request fails halfway? Current writes are parallel, unordered and not in a transaction. A published-plan guard stops a later ordinary repeat, but is not a concurrent lock or idempotency mechanism. The work register states these gaps and the required acceptance scenarios.','D3,D4,T1');
 cols(s,[
 ['Current controls','Demand bounds and comments. Draft-only decision editing. Plan lineage. Rejection of a later publish request for an already published plan.'],
 ['Development required','Feasibility revalidation after edits. Versioned drafts and input snapshots. Atomic writes, safe retries and expected-record checks.'],
 ['Acceptance evidence','Simultaneous edits/publishes. Changed inputs. Retry after timeout. Missing target records. Failure injected between write stages.']
 ],{size:28});
 note(s,'Treat the reviewed decision and the simulated physical allocation as consistent only after an explicit check.');
}
// 9
{
 const s=slide('Integration inventory: existing mechanisms','An implementation path in source does not prove a configured, accepted connection in the client environment.','Internal integration uses application services and shared database collections. File exchange is user initiated; it should not be sold as continuous GIS integration. Map screens call external OpenStreetMap/ArcGIS tile URLs, so private-network operation requires egress approval or an alternative. Email has provider paths but the default is console, and optional dependencies vary. No email was sent in this review. Confirm sender/recipients and verify delivery on the selected host.','D1,D2,G1,P5,P6');
 table(s,['Mechanism','Current source capability','Configuration / acceptance'],[
 ['Internal data sharing','MongoDB collections and Desktop REST calls','Database naming, schema ownership and API protection'],
 ['Spreadsheet exchange','Import mappings and file dialogs','Module templates, units, dates and error handling'],
 ['Network / GIS files','JSON / KMZ / KML import; CSV / KMZ export','Geometry, asset IDs and round-trip validation'],
 ['Map services','External map tiles / imagery','Approved egress or internal map alternative'],
 ['Notifications','Email adapter paths and in-app notifications','Provider, dependencies, sender, recipients and delivery test']
 ],[330,570,572],{height:510,size:26});
 note(s,'Configuration and validation are required before calling a connection operational.');
}
// 10
{
 const s=slide('Integration inventory: client-specific scope','No ready-made implementation was identified for the following connectors in the inspected application paths.','Avoid a blanket yes to integrations. Ask for the system owner, required data, direction, cadence, identifiers, authentication and error-handling expectations. SSO requires federation and role mapping. ERP/EAM/CMMS requires a contract for assets, work orders or costs. Historian ingestion requires daily aggregation and quality rules. Equipment control is a separate design and scope: Publish currently writes database planning fields, not actuator commands. This was a targeted source inventory, not an exhaustive discovery of every deployment integration.','P2,D4,S1');
 table(s,['Integration','Client decisions needed','Delivery position'],[
 ['Corporate identity / MFA','IdP, protocol, claims, roles and revocation','Development and identity acceptance'],
 ['ERP / EAM / CMMS','Asset, maintenance and cost interfaces','Contract, connector and reconciliation work'],
 ['SCADA / historian','Read-only measurements, units and aggregation','Connector and data-quality work'],
 ['Equipment control','Authority, safety boundary and control design','Separate scope; no actuator connector evidenced'],
 ['SIEM / central monitoring','Event schema, retention and collector','Configuration plus application audit work']
 ],[350,610,512],{height:510,size:26});
 note(s,'The integration discussion should end with named systems, interface owners and acceptance criteria.');
}
// 11
{
 const s=slide('Security evidence and remaining controls','Current-source findings as of 29 September 2026. No penetration test or hosted security certification was performed.','Use factual wording. Portal local authentication and role helpers are present, but token revocation and every endpoint are not runtime-verified here. Desktop authentication is absent from the inspected Express boundary. Source also includes a signing-secret fallback, unrestricted Desktop CORS and a diagnostic email endpoint. No secret values are included in this pack. TLS, database encryption, key management, hosting region and firewall posture require deployment evidence. Security acceptance must test the whole client environment.','D1,P1,P2,P3,P5,P7,R1');
 table(s,['Control','Evidence available','Remaining action'],[
 ['Portal sign-in','Password hashing and signed-token login in source','Session policy, federation and authorization tests'],
 ['Desktop access','API routes inspected; no authentication middleware','Implement identity, scoped permissions and protected actions'],
 ['Approval boundaries','Role gates in source','Add record scope and agreed separation of duties'],
 ['Secrets / diagnostics','Fallback and diagnostic paths identified','Fail closed, protect diagnostics and restrict origins'],
 ['Audit / encryption','Portal audit and plan lineage exist','Complete actor trail; verify transport, storage and retention']
 ],[310,610,552],{height:510,size:25});
 note(s,'Security claims should cite an implemented control and its verification evidence.');
}
// 12
{
 const s=slide('Functional evidence and performance acceptance','Existing backend tests were executed locally on 29 September 2026.','We ran the current backend test suite using Node --test. All 87 tests passed, with zero failures and zero skips. Coverage includes cost precedence, capacity/outage and standby cases, shortages and bottlenecks, storage carryover and decision bounds/comments. The runner reported 564.0742 ms; do not quote that as a full simulation time or performance promise. No live database or five-app authorization/publication test was executed. The SRD proposes up to 5 test accounts, 1 active run, 50 nodes, 100 edges, 14 days and 50,000 records, with warm p95 reads <=2s and baseline run <=120s on the proposed trial VM. These remain proposed targets, not measured capacity.','T1,D5,R1');
 txt(s,'87',64,238,440,150,120,C.teal,true);txt(s,'tests passed',68,403,440,60,37,C.navy,true);
 txt(s,'0 failed   /   0 skipped',68,492,455,45,29,C.muted);
 txt(s,'What the tests cover',610,230,880,70,34,C.teal,true);
 txt(s,'Dispatch and cost selection\nCapacity, outages and standby pumps\nShortages, bottlenecks and storage\nDecision bounds and comment rules',610,328,865,275,32);
 txt(s,'Production load capacity remains unmeasured.',610,630,865,70,31,C.navy,true);
 note(s,'Agree a target-host workload, then measure API latency, simulation time, concurrency and resource use.');
}
// 13
{
 const s=slide('Recovery and service operations','Responsibilities and recovery commitments require agreement and evidence from the selected hosting environment.','No backup job configuration, restore exercise, HA deployment or failover record was inspected. The SRD trial proposal uses RPO <=24 hours, RTO <=8 hours and 14-day retention. Explain RPO as tolerable data loss and RTO as recovery time, but do not offer the draft values as contractual promises. A restore test should use an isolated target, validate records and a retained dispatch plan, and record elapsed recovery time. Operations also needs alerting, patching, certificate renewal, incident escalation and release/rollback responsibilities.','R1,D1');
 table(s,['Area','Evidence now','Required agreement / proof'],[
 ['Backup / retention','No operational evidence reviewed','Schedule, retention, encryption, location and ownership'],
 ['Restore / RPO / RTO','Draft trial targets only','Isolated restore and measured recovery against agreed targets'],
 ['Availability / failover','No deployed failover evidence reviewed','Production topology and service/database failure tests'],
 ['Monitoring / incidents','Health route and logging paths exist','Alert routing, escalation, support hours and owner'],
 ['Release / rollback','Build scripts exist','Explicit quality gates, compatible rollback and rehearsal']
 ],[330,500,642],{height:510,size:26});
 note(s,'No contractual availability, capacity or recovery SLA is established by this briefing.');
}
// 14
{
 const s=slide('Capability and delivery register','The companion workbook contains 32 entries, with next action, proposed owner and required acceptance evidence.','The categories are work categories, not a numerical readiness score. Current capability means code exists, with acceptance still needed. Configuration required includes deployment decisions and evidence work. Development required identifies missing controls or client-specific integration scope. The register has editable action status, named-owner/client-decision and evidence/date columns. All actions start open so nobody mistakes current source presence for accepted deployment. Do not promise a delivery date for these items in the meeting without estimation.','D1,D2,D3,D4,D5,P1,P2,R1');
 cols(s,[
 ['7 current capabilities','Portal workflow\nAssets and networks\nDispatch calculation\nDecision review\nExplicit publication\nFile exchange\nBackend test baseline'],
 ['10 configuration items','Hosting and access\nRole assignments\nEmail and maps\nBackup and monitoring\nPerformance acceptance\nCost fallback policy\nRetention and data exit'],
 ['15 development items','Desktop security\nApproval scope and duties\nPublication integrity\nVersioning and feasibility\nAudit and data controls\nClient integrations\nRelease safeguards']
 ],{size:29});
 note(s,'Implementation category and evidence status are separate. The register records both without declaring production readiness.');
}
// 15
{
 const s=slide('Priority actions before production use','Proposed acceptance workstreams. Owners and delivery dates need agreement.','The register expands these workstreams into individual actions. Prioritise identity/authorization and publication/data integrity before production operational use. Add failure and concurrency tests; include missing targets and changed input basis. Portal role helper existence should not be reported as universal enforcement. Retain backend unit tests and add scoped API and full-cycle acceptance. Client IT owns requirements and acceptance participation; engineering owns implementation and evidence. These are proposed workstreams, not a committed schedule.','D1,D2,D3,D4,P1,P3,R1');
 table(s,['Workstream','What must be resolved','Acceptance example'],[
 ['Identity and authorization','Desktop access, portal scope and self-approval policy','Unauthorized calls fail with no mutation'],
 ['Data and publication','Database naming, atomic writes, safe retries and target counts','Injected failure leaves no partial operational plan'],
 ['Decision consistency','Draft versions, input changes and manual edit feasibility','Stale edits conflict; revised quantities reconcile'],
 ['Audit and secure configuration','Authenticated lineage, secrets, CORS and diagnostic routes','Every publish traces to actor and input basis'],
 ['Operations and release','Backups, monitoring, load evidence, rollback and quality gates','Agreed recovery/load tests pass on target host']
 ],[345,580,547],{height:510,size:25});
 note(s,'Functional demonstration acceptance and production deployment acceptance should have distinct criteria.');
}
// 16
{
 const s=slide('Decisions to capture with the client IT team','Use the workbook during discussion to record a named owner, decision and required evidence.','Close by asking for the client environment requirements, rather than seeking a blanket approval of the product. Capture hosting/residency, identity roles, external integration priorities, recovery/performance targets and acceptance ownership. Confirm that follow-up technical details will be answered with implementation status and test evidence. For unknowns, say: I need to confirm that implementation detail; we will record the requirement and respond with current capability, required work and how it will be validated. Do not invent completion dates or security commitments.','R1');
 const lines=[['Hosting','Who hosts it, where does data reside, and who operates each layer?'],['Identity','Which identity provider, roles, asset scopes and approval duties apply?'],['Interfaces','Which systems exchange what data, in which direction and how often?'],['Service targets','What workload, recovery, availability and support targets must acceptance prove?'],['Next approval','Who owns technical acceptance, and which evidence is required before production?']];
 lines.forEach(([a,b],i)=>{txt(s,a,65,235+i*101,275,63,31,C.teal,true);txt(s,b,365,235+i*101,1160,72,30);});
}

await fs.writeFile(path.join(build,'deck-index.json'),JSON.stringify(index,null,2));
const candidate=path.join(build,'IT_Briefing_candidate.pptx');
await (await PresentationFile.exportPptx(p)).save(candidate);
console.log('EXPORTED_DECK',p.slides.items.length);
const final=path.join(output,'WIDispatch_IT_Briefing.pptx');
await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath:final,pythonExecutable:python,integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),explicitTotalSlideCount:16,layoutArgs:['--expected-slide-size-emu','15240000,8572500','--validate-bullet-geometry','--validate-heading-fit',...tables.flatMap(n=>['--require-native-table-slide',String(n)])],requiredNativeTableOwnerSlides:tables,fontPolicy:{basis:'design',families:['Arial']},verifyArtifactToolImport:true,receiptPath:path.join(build,'deck-validation-v2.json')});
console.log('FINALIZED_DECK');
const imported=await PresentationFile.importPptx(await FileBlob.load(final));
for(let i=0;i<imported.slides.items.length;i++){
 const blob=await imported.slides.items[i].export({format:'png',width:1600,height:900,scale:1});
 await fs.writeFile(path.join(build,'slides',`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await blob.arrayBuffer()));
}
console.log('RENDERED_DECK',imported.slides.items.length);
