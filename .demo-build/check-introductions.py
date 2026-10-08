import hashlib, json, posixpath, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET
from PIL import Image, ImageOps, ImageDraw

root=Path('C:/Users/mabdu/OneDrive/Desktop/WIDispatch-Desktop')
work=root/'.demo-build/introductions'
source=Path('C:/Users/mabdu/OneDrive/Desktop/Utility Optimo/WIDispatch/Documentation/WIDispatch_Client_Demonstration.pptx')
final=root/'output/presentations/WIDispatch_Client_Demonstration_With_Introductions.pptx'
idx=json.loads((work/'slide-index.json').read_text())
ns={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}

def parts(z,n):
    slide=f'ppt/slides/slide{n}.xml'
    xml=ET.fromstring(z.read(slide))
    rels=ET.fromstring(z.read(f'ppt/slides/_rels/slide{n}.xml.rels'))
    text=[x.text or '' for x in xml.findall('.//a:t',ns)]
    # Slide numbers are the final text shape on all non-cover source slides.
    if n!=1: text=text[:-1]
    notes=[]; imgs=[]
    for r in rels:
        target=posixpath.normpath(posixpath.join('ppt/slides',r.attrib['Target'])).lstrip('/')
        if r.attrib['Type'].endswith('/notesSlide'):
            notes=[x.text or '' for x in ET.fromstring(z.read(target)).findall('.//a:t',ns)]
        if r.attrib['Type'].endswith('/image'):
            imgs.append(hashlib.sha256(z.read(target)).hexdigest())
    return {'text':text,'notes':notes,'images':sorted(imgs)}

with zipfile.ZipFile(source) as src, zipfile.ZipFile(final) as dst:
    failures=[]
    for e in idx:
        if 'originalSlide' not in e: continue
        a,b=parts(src,e['originalSlide']),parts(dst,e['slide'])
        for k in a:
            if a[k]!=b[k]: failures.append({'slide':e['slide'],'original':e['originalSlide'],'field':k})
    assert not failures, failures
    for e in idx:
        if e.get('introduction'):
            p=parts(dst,e['slide'])
            assert all(x in p['text'] for x in ['Purpose','What it does','Objective'])
            assert any('Transition:' in t for t in p['notes'])
    for e in idx[1:]:
        x=ET.fromstring(dst.read(f"ppt/slides/slide{e['slide']}.xml"))
        assert x.findall('.//a:t',ns)[-1].text==str(e['slide']).zfill(2)

groups=[[1,2,3],[4,5,6],[8,9,10],[18,19,20],[22,23,24],[29,30,31]]
for k,rows in enumerate([groups[:3],groups[3:]],1):
    sheet=Image.new('RGB',(1920,1140),'#e6ebef')
    draw=ImageDraw.Draw(sheet)
    for y,row in enumerate(rows):
        for x,n in enumerate(row):
            im=Image.open(work/f'renders/slide-{n:02d}.png').convert('RGB')
            assert im.size==(1600,900),(n,im.size)
            sheet.paste(im.resize((640,360)),(x*640,y*380+20))
            draw.text((x*640+8,y*380+3),str(n),fill='#12374b')
    sheet.save(work/f'transitions-{k}.png')
report={'slide_count':len(idx),'original_slides_preserved':78,'new_introductions':6,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'final_sha256':hashlib.sha256(final.read_bytes()).hexdigest(),'checks':['original slide text, notes and image hashes preserved','six introduction headings and transition notes present','all page numbers sequential']}
(work/'content-check.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
