"""Browser regression: run python tests/test_measurement.py (requires Playwright and Chrome)."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        page.wait_for_function('!!window.ViewConvertCore')
        page.locator('#fileInput').set_input_files({'name': 'triangle.obj', 'mimeType': 'text/plain', 'buffer': b'v 0 0 0\nv 30 40 120\nv 30 0 0\nf 1 2 3\n'})
        page.locator('#loading').wait_for(state='hidden')
        indicator=page.locator('#orientationAxes')
        assert indicator.is_visible()
        assert page.locator('.axis-cube').count() == 0
        before=indicator.inner_html()
        page.locator('[data-view="front"]').click()
        page.wait_for_function("Math.abs(Number(document.querySelector('#orientationAxes [data-axis=X] line').getAttribute('x2'))-80)<0.1")
        assert indicator.inner_html() != before
        page.wait_for_function("Math.abs(Number(document.querySelector('#orientationAxes [data-axis=Z] line').getAttribute('y2'))-20)<0.1")
        assert indicator.evaluate("el=>getComputedStyle(el).pointerEvents") == 'none'
        rect=indicator.bounding_box()
        canvas=page.locator('#canvas').bounding_box()
        assert abs(rect['x']+rect['width']-(canvas['x']+canvas['width']-12))<1
        grid_button=page.locator('#toggleGrid')
        image_with_grid=page.locator('#canvas').screenshot()
        grid_button.click()
        assert grid_button.get_attribute('aria-pressed') == 'false'
        assert page.locator('#canvas').screenshot() != image_with_grid
        grid_button.click()
        assert grid_button.get_attribute('aria-pressed') == 'true'
        page.locator('#resetView').click()
        page.locator('#measureButton').click()
        points = page.evaluate("""async () => {
            const THREE = await import('three');
            const rect=document.getElementById('canvas').getBoundingClientRect();
            const camera=new THREE.PerspectiveCamera(38,rect.width/rect.height,.001,100000);
            const center=new THREE.Vector3(15,20,60),distance=65/Math.sin(THREE.MathUtils.degToRad(19))*1.15;
            camera.up.set(0,0,1);camera.position.copy(center).addScaledVector(new THREE.Vector3(1,-1,.78).normalize(),distance);camera.lookAt(center);camera.updateMatrixWorld(true);
            return [[0,0,0],[30,40,120]].map(coords=>{const v=new THREE.Vector3(...coords).project(camera);return {x:rect.x+(v.x+1)*rect.width/2,y:rect.y+(1-v.y)*rect.height/2};});
        }""")
        for point in points:
            page.mouse.move(point['x']+4, point['y']+3)
            page.locator('#vertexPreview').wait_for(state='visible')
            page.mouse.click(point['x']+4, point['y']+3)
        row = page.locator('.measurement-item')
        assert row.count() == 1
        assert row.locator('strong').inner_text() == '130,000 mm'
        assert row.locator('dd').all_inner_texts() == ['30,000 mm', '40,000 mm', '120,000 mm']
        page.locator('#displayUnit').select_option('cm')
        assert row.locator('strong').inner_text() == '13,000 cm'
        assert row.locator('dd').all_inner_texts() == ['3,000 cm', '4,000 cm', '12,000 cm']
        page.locator('#modelTree input').uncheck()
        page.mouse.click(points[0]['x'], points[0]['y'])
        page.mouse.click(points[1]['x'], points[1]['y'])
        assert row.count() == 1
        page.locator('#modelTree input').check()
        page.locator('#modelUnit').select_option('10')
        assert row.count() == 0
        for point in points:
            page.mouse.click(point['x']+4, point['y']+3)
        assert row.locator('strong').inner_text() == '130,000 cm'
        assert row.locator('dd').all_inner_texts() == ['30,000 cm', '40,000 cm', '120,000 cm']
        page.locator('#measureTarget').select_option('surface')
        assert page.locator('#vertexPreview').is_hidden()
        page.locator('#clearMeasurements').click()
        assert row.count() == 0
        # Free surface selection remains available away from vertices.
        page.locator('#modelUnit').select_option('1')
        page.locator('#displayUnit').select_option('mm')
        x=(points[0]['x']+points[1]['x'])/2
        y=(points[0]['y']+points[1]['y'])/2
        page.mouse.click(x+2,y)
        page.mouse.click(x+6,y)
        assert row.count() == 1
        page.locator('#clearMeasurements').click()
        page.locator('#measureTarget').select_option('vertex')
        page.locator('#sectionEnabled').check()
        for point in points:
            page.mouse.click(point['x'],point['y'])
        assert row.count() == 0, 'Clipped vertex must not be selectable'
        page.locator('#displayUnit').select_option('cm')
        page.reload()
        page.wait_for_function('!!window.ViewConvertCore')
        assert page.locator('#displayUnit').input_value() == 'cm', 'Display unit preference was not persisted across reload'
        assert page.locator('#modelUnit').input_value() == '1', 'Model (import) unit must stay session-only, not persisted'
        page.evaluate("localStorage.setItem('viewconvert-unit','mm')")
        page.goto(f'http://127.0.0.1:{server.server_port}/tests/browser-tests.html')
        page.wait_for_function("['PASS','FAIL'].includes(document.getElementById('status').textContent)", timeout=60000)
        assert page.locator('#status').inner_text() == 'PASS', page.locator('#details').inner_text()
        print(page.locator('#details').inner_text())
        assert not errors, errors
        print('PASS: exact vertex snap, XYZ, linear distance, display units, hidden bodies, model scale, cleanup; no JS errors.')
        browser.close()
finally:
    server.shutdown()
