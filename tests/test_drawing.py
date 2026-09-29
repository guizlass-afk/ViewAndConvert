"""Browser integration tests for A4 views, dimensions and native file downloads."""
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from pathlib import Path
from tempfile import TemporaryDirectory
import re,sys,os,shutil
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parents[1]
OBJ=b'v 0 0 0\nv 40 0 0\nv 40 20 0\nv 0 20 0\nv 0 0 30\nv 40 0 30\nv 40 20 30\nv 0 20 30\nf 1 4 3 2\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n'
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start()
try:
 with TemporaryDirectory(prefix='viewconvert-drawing-') as folder,sync_playwright() as p:
  browser=p.chromium.launch(channel='chrome',headless=True)
  page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(120000)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/');page.wait_for_function('!!window.ViewConvertCore')
  assert page.locator('#toggleDrawing').is_disabled()
  page.locator('#fileInput').set_input_files({'name':'bloco.obj','mimeType':'text/plain','buffer':OBJ})
  page.locator('#loading').wait_for(state='hidden');page.locator('#toggleDrawing').click()
  assert page.locator('#drawingPanel').is_visible()
  for width,height in [(1337,620),(1440,1000),(1000,650),(600,700)]:
   page.set_viewport_size({'width':width,'height':height})
   page.wait_for_timeout(150)
   fit=page.evaluate("""()=>{const wrap=document.querySelector('.drawing-paper-wrap'),sheet=document.querySelector('#drawingSheet').getBoundingClientRect(),side=document.querySelector('.drawing-sidebar').getBoundingClientRect();return {fits:wrap.scrollWidth<=wrap.clientWidth+1&&wrap.scrollHeight<=wrap.clientHeight+1,visible:sheet.top>=0&&sheet.bottom<=innerHeight+1&&sheet.right<=side.left+1}}""")
   assert fit['fits'] and fit['visible'],(width,height,fit)
   if width==1337:page.screenshot(path=str(Path(os.environ['TEMP'])/'viewconvert-sidebar.png'))
  page.set_viewport_size({'width':1440,'height':1000})
  page.wait_for_timeout(150)
  print('PASS: full sheet fits without scrolling at four viewport sizes; tools on the right.',flush=True)
  for kind in ['front','top','bottom','back','right','left','iso']:
   page.locator('#drawingView').select_option(kind);page.locator('#addDrawingView').click()
   page.locator(f'[data-sheet-view][data-kind={kind}]').wait_for()
   print('PASS: view',kind,flush=True)
  assert page.locator('[data-sheet-view]').count()==7
  assert page.locator('#drawingScale').input_value()=='0.5'
  def click(x,y):
   point=page.locator('#drawingSheet').evaluate('(svg,p)=>{const q=svg.createSVGPoint();q.x=p[0];q.y=p[1];const r=q.matrixTransform(svg.getScreenCTM());return {x:r.x,y:r.y}}',[x,y])
   page.mouse.click(point['x'],point['y'])
  page.locator('[data-drawing-tool=linear]').click()
  page.locator('#linearDirection').select_option('horizontal')
  click(45,31.5);click(65,31.5);click(55,23)
  assert page.locator('[data-sheet-annotation]').count()==1,page.locator('#drawingHint').inner_text()
  assert '40 mm' in page.locator('[data-sheet-annotation]').text_content()
  page.locator('[data-drawing-tool=angle]').click()
  click(45,31.5);click(45,46.5);click(65,46.5);click(51,40)
  assert page.locator('[data-sheet-annotation]').count()==2,page.locator('#drawingHint').inner_text()
  assert '90°' in page.locator('#drawingSheet').text_content()
  for kind,value,label in [('diameter','12 mm','Ø 12 mm'),('radius','6 mm','R 6 mm')]:
   page.locator('[data-drawing-tool='+kind+']').click();page.locator('#drawingAnnotation').fill(value)
   click(55,39);click(78,29 if kind=='diameter' else 49)
   assert label in page.locator('#drawingSheet').text_content()
  page.locator('#drawingUnit').select_option('cm')
  assert '4 cm' in page.locator('#drawingSheet').text_content()
  page.locator('#drawingScale').select_option('1')
  assert '4 cm' in page.locator('#drawingSheet').text_content()
  page.locator('#undoDrawing').click();assert page.locator('#drawingScale').input_value()=='0.5'
  page.locator('#drawingUnit').select_option('mm')
  page.locator('[data-drawing-tool=move]').click()
  page.locator('#closeDrawing').click();assert page.locator('#drawingPanel').is_hidden()
  page.locator('#toggleDrawing').click();assert page.locator('[data-sheet-view]').count()==7
  print('PASS: linear 40 mm, angular 90 degrees, radius/diameter annotations, units, scale, undo, panel persistence.',flush=True)
  with page.expect_download() as info:page.locator('#downloadDrawing').click()
  pdf=Path(folder)/'sheet.pdf';info.value.save_as(pdf);assert pdf.read_bytes().startswith(b'%PDF-')
  from pypdf import PdfReader
  doc=PdfReader(pdf);assert len(doc.pages)==1
  box=doc.pages[0].mediabox
  assert abs(float(box.width)*25.4/72-297)<.1 and abs(float(box.height)*25.4/72-210)<.1
  content=doc.pages[0].extract_text();assert '40 mm' in content and '90' in content and 'Ø 12 mm' in content and 'R 6 mm' in content
  print('PASS: vector PDF A4 landscape, text and dimensions.',flush=True)
  with page.expect_download() as info:page.locator('#printDrawing').click()
  dwg=Path(folder)/'sheet.dwg';info.value.save_as(dwg);data=dwg.read_bytes();assert data.startswith(b'AC1015')
  result=page.evaluate('''async data=>{const {DwgReader}=await import('https://esm.sh/@node-projects/acad-ts@3.2.0?bundle');const doc=DwgReader.readFromStream(new Uint8Array(data).buffer);return {units:doc.header.insUnits,entities:Array.from(doc.entities).map(e=>({type:e.objectName,text:e.value}))};}''',list(data))
  assert result['units']==4,result
  labels=[e.get('text') for e in result['entities']]
  assert '40 mm' in labels and '90°' in labels and 'Ø 12 mm' in labels and 'R 6 mm' in labels
  assert sum(e['type']=='LINE' for e in result['entities'])>30
  print('PASS: native DWG R2000 reopens with lines, texts and millimeter units.',flush=True)
  independent=page.evaluate("""async bytes=>{const base='https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.7.14';const {LibreDwg,Dwg_File_Type}=await import(base+'/dist/libredwg-web.js');const lib=await LibreDwg.create(base+'/wasm');const ptr=lib.dwg_read_data(Uint8Array.from(bytes).buffer,Dwg_File_Type.DWG);if(!ptr)throw Error('DWG rejected');const result=lib.convert(ptr);lib.dwg_free(ptr);return result.entities.map(e=>({type:e.type,text:e.text}));}""",list(data))
  assert len(independent)==len(result['entities'])
  assert '40 mm' in [e.get('text') for e in independent]
  assert 'Ø 12 mm' in [e.get('text') for e in independent]
  print('PASS: DWG also decoded by independent LibreDWG reader.',flush=True)

  page.screenshot(path=str(Path(folder)/'sheet.png'))
  if os.environ.get('DRAWING_TEST_ARTIFACTS'):
   target=Path(os.environ['DRAWING_TEST_ARTIFACTS']);target.mkdir(parents=True,exist_ok=True)
   for name in ['sheet.pdf','sheet.dwg','sheet.png']:shutil.copy2(Path(folder)/name,target/name)
  # Move a view using real mouse input, then undo without changing its dimensions.
  view=page.locator('[data-sheet-view][data-kind=front]')
  original=view.get_attribute('transform')
  at=page.locator('#drawingSheet').evaluate('(svg)=>{const q=svg.createSVGPoint();q.x=43;q.y=30;const r=q.matrixTransform(svg.getScreenCTM());return {x:r.x,y:r.y}}')
  page.mouse.move(at['x'],at['y']);page.mouse.down();page.mouse.move(at['x']+18,at['y']+10,steps=4);page.mouse.up()
  assert view.get_attribute('transform')!=original
  page.locator('#undoDrawing').click();assert view.get_attribute('transform')==original
  paper_before=page.locator('#drawingSheet').bounding_box()['width']
  page.locator('#drawingZoom').select_option('2')
  page.wait_for_function('document.querySelector(".drawing-paper-wrap").scrollWidth>document.querySelector(".drawing-paper-wrap").clientWidth || document.querySelector(".drawing-paper-wrap").scrollHeight>document.querySelector(".drawing-paper-wrap").clientHeight')
  assert page.locator('#drawingSheet').bounding_box()['width']>paper_before*1.8
  page.locator('#drawingZoom').select_option('1')
  annotation=page.locator('[data-sheet-annotation]').first
  annotation.locator('text').click()
  page.locator('#deleteDrawing').click();assert page.locator('[data-sheet-annotation]').count()==3
  page.locator('#undoDrawing').click();assert page.locator('[data-sheet-annotation]').count()==4
  print('PASS: dragging views, deletion, undo and sheet zoom.',flush=True)
  page.locator('#modelUnit').select_option('10')
  assert page.locator('[data-sheet-view]').count()==0,'Old dimensions survived geometry rescale'
  # Exercise actual imported CAD, not just a box with axis-aligned faces.
  cad=urlopen('https://raw.githubusercontent.com/kovacsv/occt-import-js/main/test/testfiles/conical-surface/conical-surface.step').read()
  page.locator('#fileInput').set_input_files({'name':'curvo.step','mimeType':'application/step','buffer':cad})
  page.wait_for_function('document.getElementById("fileFormat").textContent==="STEP"')
  page.locator('#loading').wait_for(state='hidden')
  for kind in ['front','top','iso']:
   page.locator('#drawingView').select_option(kind);page.locator('#addDrawingView').click()
   projected=page.locator('[data-sheet-view][data-kind='+kind+']');projected.wait_for()
   assert len(projected.locator('path').first.get_attribute('d'))>100
  print('PASS: curved STEP projected into front, top and isometric vector views.',flush=True)
  assert not errors,errors
  print('PASS: geometry rescale invalidates sheet; no JavaScript errors.',flush=True)
  browser.close()
finally:server.shutdown()
