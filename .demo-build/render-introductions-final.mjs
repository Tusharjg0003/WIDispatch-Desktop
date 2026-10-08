import fs from 'node:fs/promises';
import {FileBlob,PresentationFile} from '@oai/artifact-tool';
const root='C:/Users/mabdu/OneDrive/Desktop/WIDispatch-Desktop';
const p=await PresentationFile.importPptx(await FileBlob.load(root+'/output/presentations/WIDispatch_Client_Demonstration_With_Introductions.pptx'));
console.log('FRAMES', JSON.stringify([0,1,2,4,8,18,22,29].map(i=>({slide:i+1,frame:p.slides.items[i].frame}))));
for(let i=0;i<p.slides.items.length;i++){
 const blob=await p.slides.items[i].export({format:'png',width:1600,height:900,scale:1});
 await fs.writeFile(root+'/.demo-build/introductions/renders/slide-'+String(i+1).padStart(2,'0')+'.png',new Uint8Array(await blob.arrayBuffer()));
 if(i%15===0)console.log('Rendered',i+1);
}
console.log('RENDERED_FINAL',p.slides.items.length);
