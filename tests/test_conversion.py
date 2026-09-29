"""Real download/reimport tests. Requires Python Playwright and installed Chrome."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
points = [(0,0,0),(10,0,0),(0,20,0),(0,0,30)]
faces = [(0,2,1),(0,1,3),(0,3,2),(1,2,3)]
STL = ('solid tetra\n'+''.join('facet normal 0 0 0\nouter loop\n'+''.join('vertex %s %s %s\n'%points[i] for i in face)+'endloop\nendfacet\n' for face in faces)+'endsolid tetra').encode()

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

server = ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
try:
    with TemporaryDirectory(prefix='viewconvert-exports-') as folder, sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        page=browser.new_page(viewport={'width':1440,'height':1000})
        page.set_default_timeout(90000)
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        page.wait_for_function('!!window.ViewConvertCore')

        def upload(name,data):
            page.locator('#fileInput').set_input_files({'name':name,'mimeType':'application/octet-stream','buffer':data})
            page.wait_for_function('(name)=>document.getElementById("statusText").textContent===`${name} carregado`',arg=name)
            page.locator('#loading').wait_for(state='hidden')
            return page.locator('#dimensions').inner_text()

        def export(fmt):
            page.locator('#exportFormat').select_option(fmt)
            with page.expect_download() as result:
                page.locator('#exportButton').click()
            download=result.value
            assert download.suggested_filename.endswith('.'+fmt)
            path=Path(folder)/download.suggested_filename
            download.save_as(path)
            data=path.read_bytes()
            assert len(data)>100,(fmt,len(data))
            page.locator('#cancelExport').wait_for(state='hidden')
            assert page.locator('#exportStatus').inner_text().startswith('Pronto:')
            return data

        expected=upload('tetra.stl',STL)
        # Cancellation must not leave an active worker or disabled controls.
        page.locator('#exportFormat').select_option('step')
        page.locator('#exportButton').click()
        page.locator('#cancelExport').click()
        page.wait_for_function('!document.getElementById("exportButton").disabled')
        assert page.locator('#exportStatus').inner_text()=='Conversão cancelada.'
        for fmt in ['stl','obj','glb','gltf','ply','3mf','step','iges','brep']:
            upload('tetra.stl',STL)
            # Export covers all bodies, regardless of visibility and section state.
            page.locator('#modelTree input').uncheck()
            page.locator('#sectionEnabled').check()
            data=export(fmt)
            actual=upload('roundtrip.'+fmt,data)
            assert actual==expected,(fmt,expected,actual)
            assert page.locator('#triangleCount').inner_text()=='4',(fmt,'triangle loss')
            print('PASS: STL ->',fmt.upper(),'-> viewer; dimensions and all 4 faces retained.',flush=True)

        cube=urlopen('https://raw.githubusercontent.com/kovacsv/occt-import-js/main/test/testfiles/simple-basic-cube/cube.stp').read()
        expected=upload('cube.step',cube)
        for fmt in ['iges','brep','step']:
            data=export(fmt)
            actual=upload('cube.'+fmt,data)
            assert actual==expected,(fmt,expected,actual)
            assert int(page.locator('#triangleCount').inner_text().replace('.',''))>=12
            print('PASS: native CAD chain ->',fmt.upper(),flush=True)
        page.locator('#modelUnit').select_option('10')
        scaled=page.locator('#dimensions').inner_text()
        data=export('step')
        assert upload('scaled.step',data)==scaled
        cone=urlopen('https://raw.githubusercontent.com/kovacsv/occt-import-js/main/test/testfiles/conical-surface/conical-surface.step').read()
        assert b'CONICAL_SURFACE' in cone
        upload('cone.step',cone)
        native=export('step')
        assert b'CONICAL_SURFACE' in native, 'Native CAD was tessellated'
        iges=export('iges')
        upload('cone.iges',iges)
        restored=export('step')
        # IGES may express the same cone as a surface of revolution or a NURBS surface.
        curved_types=[b'CONICAL_SURFACE',b'SURFACE_OF_REVOLUTION',b'B_SPLINE_SURFACE']
        print('Curved STEP entities:',{name.decode():restored.count(name) for name in curved_types},flush=True)
        assert any(name in restored for name in curved_types), 'Curved CAD surface was replaced by planar triangles'
        assert restored.count(b'ADVANCED_FACE') <= native.count(b'ADVANCED_FACE')*2
        print('PASS: curved CAD surface preserved without tessellation through STEP -> IGES -> STEP.',flush=True)
        inch_cube=urlopen('https://raw.githubusercontent.com/kovacsv/occt-import-js/main/test/testfiles/cube-units/cube-in.step').read()
        inch_dimensions=upload('inches.step',inch_cube)
        data=export('iges')
        assert upload('inches.iges',data)==inch_dimensions
        print('PASS: source CAD inch units retained as correct physical dimensions.',flush=True)
        assert not errors,errors
        print('PASS: native CAD scaling, cancellation, UI recovery; no JavaScript errors.',flush=True)
        browser.close()
finally:
    server.shutdown()