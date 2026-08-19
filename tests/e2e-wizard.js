const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1440,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Fake the Web3Forms endpoint so the test never sends a real email.
  await page.setRequestInterception(true);
  let posted = null;
  page.on('request', (req) => {
    if (req.url().includes('api.web3forms.com')) {
      posted = req.postData() || 'FORMDATA';
      req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ success: true }) });
    } else req.continue();
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('http://localhost:8899/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1200));

  const log = [];
  const stepVisible = async (n) => page.$eval(`form[x-ref="coaching"] [data-step="${n}"]`,
    (el) => getComputedStyle(el).display !== 'none');

  // Ir al formulario
  await page.evaluate(() => document.getElementById('apply').scrollIntoView());
  await new Promise(r => setTimeout(r, 800));

  // 1) "Next" sin llenar nada NO debe avanzar (validación)
  await page.evaluate(() => {
    const form = document.querySelector('form[x-ref="coaching"]');
    [...form.closest('section').querySelectorAll('button')].find(b => b.textContent.includes('Next')).click();
  });
  await new Promise(r => setTimeout(r, 400));
  log.push(['valida vacío (sigue en paso 1)', await stepVisible(1) && !(await stepVisible(2))]);

  // 2) Llenar paso 1 y avanzar
  await page.type('#c-first-name', 'PRUEBA');
  await page.type('#c-last-name', 'EMMA');
  await page.type('#c-phone', '5550001111');
  await page.type('#c-email', 'prueba@test.com');
  const clickNext = () => page.evaluate(() => {
    const form = document.querySelector('form[x-ref="coaching"]');
    [...form.querySelectorAll('button[type="button"]')].find(b => b.textContent.includes('Next')).click();
  });
  await clickNext(); await new Promise(r => setTimeout(r, 400));
  log.push(['paso 1 → 2', await stepVisible(2)]);

  // 3) Paso 2: elegir radio y avanzar
  await page.evaluate(() => document.querySelector('input[name="Q1 - Which describes you best"]').click());
  await clickNext(); await new Promise(r => setTimeout(r, 400));
  log.push(['paso 2 → 3', await stepVisible(3)]);

  // 4) Paso 3: radio y avanzar
  await page.evaluate(() => document.querySelector('input[name="Q2 - Biggest struggle"]').click());
  await clickNext(); await new Promise(r => setTimeout(r, 400));
  log.push(['paso 3 → 4', await stepVisible(4)]);

  // 5) Botón "Back" regresa
  await page.evaluate(() => {
    const form = document.querySelector('form[x-ref="coaching"]');
    [...form.querySelectorAll('button')].find(b => b.textContent.includes('Back')).click();
  });
  await new Promise(r => setTimeout(r, 400));
  log.push(['back 4 → 3', await stepVisible(3)]);
  await clickNext(); await new Promise(r => setTimeout(r, 400));

  // 6) Paso 4: llenar y ENVIAR (interceptado, no llega a Web3Forms)
  await page.type('#c-why', 'Quiero direccion real en mi entrenamiento.');
  await page.evaluate(() => document.querySelector('input[name="Q4 - Consistent training"]').click());
  await page.evaluate(() => {
    const form = document.querySelector('form[x-ref="coaching"]');
    [...form.querySelectorAll('button[type="submit"]')].find(b => b.textContent.includes('Submit')).click();
  });
  await new Promise(r => setTimeout(r, 1200));
  const success = await page.evaluate(() => {
    const h = [...document.querySelectorAll('#apply h3')].find(x => x.textContent.includes('your application is in'));
    return h && getComputedStyle(h.closest('div')).display !== 'none';
  });
  log.push(['envío → estado de éxito', !!success]);
  log.push(['POST interceptado (no se envió email real)', posted !== null]);

  // 7) Slider de testimonios: flecha next cambia de slide
  await page.evaluate(() => document.getElementById('testimonials').scrollIntoView());
  await new Promise(r => setTimeout(r, 700));
  const t0 = await page.$eval('#testimonials .flex.transition-transform', el => el.style.transform);
  await page.evaluate(() => document.querySelector('#testimonials button[aria-label="Next testimonial"]').click());
  await new Promise(r => setTimeout(r, 900));
  const t1 = await page.$eval('#testimonials .flex.transition-transform', el => el.style.transform);
  log.push(['slider avanza con flecha', t0 !== t1]);

  // Capturas reales (con animaciones ya asentadas): página completa + banda + móvil
  const OUT = '/Users/emmabastidas/Coach_dee/site/v2/_capturas-revision';
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1440, height: 900 });
  await page2.goto('http://localhost:8899/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page2.evaluate(async () => { window.scrollTo(0, document.body.scrollHeight); await new Promise(r => setTimeout(r, 600)); window.scrollTo(0, 0); });
  await new Promise(r => setTimeout(r, 1200));
  await page2.screenshot({ path: OUT + '/10-pagina-completa.png', fullPage: true });
  await page2.evaluate(() => document.getElementById('band').scrollIntoView({ block: 'center' }));
  await new Promise(r => setTimeout(r, 1500));
  await page2.screenshot({ path: OUT + '/06-banda-video.png' });

  const m = await browser.newPage();
  await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await m.goto('http://localhost:8899/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await m.screenshot({ path: OUT + '/09-hero-movil.png' });

  console.log('=== RESULTADOS ===');
  for (const [name, ok] of log) console.log((ok ? 'PASS' : 'FAIL') + ' · ' + name);
  console.log('errores JS:', errors.length ? errors.slice(0, 5) : 'ninguno');
  await browser.close();
  process.exit(log.every(([, ok]) => ok) && errors.length === 0 ? 0 : 1);
})().catch(e => { console.error('CRASH', e.message); process.exit(2); });
