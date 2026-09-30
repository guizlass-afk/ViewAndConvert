"""Language parity, live switching, state preservation, RTL and Unicode downloads."""
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from pathlib import Path
from tempfile import TemporaryDirectory
import json,os,re,sys
from playwright.sync_api import sync_playwright
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
catalog=json.loads((ROOT/'locales/messages.json').read_text(encoding='utf-8'))
assert len(catalog)==12
for language,values in catalog.items():
 assert values.keys()==catalog['pt-BR'].keys(),language
 for key,value in values.items():
  assert value.strip() and sorted(re.findall(r'\{\d+\}',key))==sorted(re.findall(r'\{\d+\}',value)),(language,key)
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));Thread(target=server.serve_forever,daemon=True).start()
try:
 with TemporaryDirectory() as folder,sync_playwright() as p:
  browser=p.chromium.launch(channel='chrome',headless=True);page=browser.new_page(viewport={'width':1337,'height':620});page.set_default_timeout(60000)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/');page.wait_for_function('!!window.ViewConvertCore')
  assert page.locator('#languageMenu [data-language]').count()==12
  page.locator('#languageButton').click();page.keyboard.press('ArrowDown');page.keyboard.press('Enter')
  assert page.locator('html').get_attribute('lang')=='en-US'
  page.locator('#fileInput').set_input_files({'name':'SUPERIOR.obj','mimeType':'text/plain','buffer':b'v 0 0 0\nv 40 0 0\nv 40 20 0\nv 0 20 0\nf 1 2 3\nf 1 3 4\n'})
  page.locator('#loading').wait_for(state='hidden');page.locator('#toggleDrawing').click();page.locator('#drawingView').select_option('top');page.locator('#addDrawingView').click();page.locator('[data-sheet-view]').wait_for()
  def click_sheet(x,y):
   point=page.locator('#drawingSheet').evaluate('(svg,p)=>{const q=svg.createSVGPoint();q.x=p[0];q.y=p[1];const r=q.matrixTransform(svg.getScreenCTM());return {x:r.x,y:r.y}}',[x,y]);page.mouse.click(point['x'],point['y'])
  page.locator('[data-drawing-tool=linear]').click();click_sheet(35,29);click_sheet(75,29);click_sheet(55,20)
  page.locator('[data-drawing-tool=radius]').click();page.locator('#drawingAnnotation').fill('SUPERIOR');click_sheet(55,39);click_sheet(90,30)
  assert page.locator('[data-sheet-annotation]').count()==2
  geometry=page.locator('[data-sheet-view] path').first.get_attribute('d')
  for language,values in catalog.items():
   page.locator('#languageSelect').select_option(language)
   assert page.locator('.import-panel h2').inner_text()==values['Abrir modelo'],language
   assert page.locator('#drawingView option[value=top]').inner_text()==values['SUPERIOR'],language
   assert values['SUPERIOR'] in page.locator('#drawingSheet').text_content(),language
   assert page.locator('#toggleDrawing').inner_text()==values['← Voltar ao 3D'],language
   assert page.locator('#fileName').inner_text()=='SUPERIOR.obj'
   assert page.locator('[data-sheet-annotation]').count()==2
   assert 'R SUPERIOR' in page.locator('#drawingSheet').text_content()
   assert page.locator('[data-sheet-view] path').first.get_attribute('d')==geometry
   assert page.locator('html').get_attribute('dir')==('rtl' if language=='ar-SA' else 'ltr')
   expected=values['Aproxime o cursor de um vértice visível até aparecer o destaque.']
   translated=page.evaluate("async()=>{const {t}=await import('./i18n.js?v=1');return t('Falha: {0}',[t('Aproxime o cursor de um vértice visível até aparecer o destaque.')]);}")
   assert expected in translated
   # Fit must survive script direction and longer tool labels.
   assert page.evaluate("()=>{const w=document.querySelector('.drawing-paper-wrap');return w.scrollWidth<=w.clientWidth+1&&w.scrollHeight<=w.clientHeight+1&&document.documentElement.scrollWidth<=innerWidth+1}")
   if language in ['en-US','ar-SA','ja-JP']:page.screenshot(path=str(Path(os.environ['TEMP'])/('viewconvert-'+language+'.png')))
  assert page.evaluate("async()=>{const {t}=await import('./i18n.js?v=1');return t('Criando faces CAD: 1 de 9');}")==catalog['ja-JP']['Criando faces CAD: {0} de {1}'].replace('{0}','1').replace('{1}','9')
  page.locator('#languageSelect').select_option('ja-JP')
  with page.expect_download() as info:page.locator('#downloadDrawing').click()
  pdf=Path(folder)/'ja.pdf';info.value.save_as(pdf)
  from pypdf import PdfReader
  doc=PdfReader(pdf);assert len(doc.pages)==1 and len(doc.pages[0].images)>0
  with page.expect_download() as info:page.locator('#printDrawing').click()
  dwg=Path(folder)/'ja.dwg';info.value.save_as(dwg)
  labels=page.evaluate("""async bytes=>{const {DwgReader}=await import('https://esm.sh/@node-projects/acad-ts@3.2.0?bundle');const doc=DwgReader.readFromStream(new Uint8Array(bytes).buffer);return Array.from(doc.entities).filter(e=>e.objectName==='TEXT').map(e=>e.value);}""",list(dwg.read_bytes()))
  decoded=[re.sub(r'\\U\+([0-9A-Fa-f]{4})',lambda m:chr(int(m[1],16)),s) for s in labels]
  assert catalog['ja-JP']['SUPERIOR'] in decoded,decoded
  page.reload();page.wait_for_function('!!window.ViewConvertCore');assert page.locator('html').get_attribute('lang')=='ja-JP'
  page.set_viewport_size({'width':600,'height':700});page.locator('#languageButton').click();assert page.locator('#languageMenu').is_visible();page.keyboard.press('Escape');assert page.locator('#languageMenu').is_hidden()
  assert not errors,errors
  print('PASS: 12 complete catalogs, keyboard picker, live translation, model/sheet preservation, RTL, responsive fit, Unicode PDF/DWG and saved preference.')
  browser.close()
finally:server.shutdown()
