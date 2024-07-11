const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const poll = require('promise-poller').default;

const app = express();
const port = 3007;

const apiKey = '712a38ac18fbe493d415b6d2ffd898d1';
const siteDetails = {
  sitekey: '4a65992d-58fc-4812-8b87-789f7e7c4c4b',
  pageurl: 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/Consultar'
};

const chromeOptions = {
  slowMo: 100,
  headless: false,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--incognito',
    '--disable-infobars',
    '--window-position=0,0',
    '--ignore-certifcate-errors',
    '--ignore-certifcate-errors-spki-list',
    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    '--disable-blink-features=AutomationControlled',
    '--disable-extensions',
    '--start-maximized'
  ],
  executablePath: '/opt/firefox/firefox',
  defaultViewport: {
    width: 1920,
    height: 1080
  }
};

// Ensure the screenshots directory exists
const screenshotsDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const initiateCaptchaRequest = async () => {
  const formData = {
    method: 'hcaptcha',
    sitekey: siteDetails.sitekey,
    key: apiKey,
    pageurl: siteDetails.pageurl,
    json: 1
  };
  const response = await axios.post('http://2captcha.com/in.php', null, { params: formData });
  return response.data.request;
};

const pollForRequestResults = async (key, id, retries = 30, interval = 1500, delay = 1500) => {
  await timeout(delay);
  return poll({
    taskFn: requestCaptchaResults(key, id),
    interval,
    retries
  });
};

const requestCaptchaResults = (apiKey, requestId) => async () => {
  const url = `http://2captcha.com/res.php?key=${apiKey}&action=get&id=${requestId}&json=1`;
  const response = await axios.get(url);
  const resp = response.data;
  if (resp.status === 0) throw resp.request;
  return resp.request;
};

const timeout = millis => new Promise(resolve => setTimeout(resolve, millis));

const run = async (url, cnpj, dataInicio, dataFim) => {
  const browser = await puppeteer.launch(chromeOptions);
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });
    console.log('Página carregada, preenchendo formulário.');
    await page.screenshot({ path: path.join(screenshotsDir, 'screenshot0.png'), fullPage: true });

    const requestId = await initiateCaptchaRequest();
    const captchaSolution = await pollForRequestResults(apiKey, requestId);
    console.log('captchaSolution', captchaSolution);
   


    await page.screenshot({ path: path.join(screenshotsDir, 'screenshot1.png'), fullPage: true });
    await page.waitForSelector('#Ni', { visible: true, timeout: 30000 });
    await page.waitForSelector('#PeriodoInicio', { visible: true, timeout: 30000 });
    await page.waitForSelector('#PeriodoFim', { visible: true, timeout: 30000 });

    await page.evaluate((cnpj) => {
      const input = document.querySelector('#Ni');
      input.value = cnpj;
      input.focus();
      input.blur(); 
    }, cnpj);

    await page.evaluate((dataInicio) => {
      const input = document.querySelector('#PeriodoInicio');
      input.value = dataInicio;
      input.focus();
      input.blur(); 
    }, dataInicio);

    await page.evaluate((dataFim) => {
      const input = document.querySelector('#PeriodoFim');
      input.value = dataFim;
      input.focus();
      input.blur(); 
    }, dataFim);


  console.log('captchaSolution', captchaSolution);
  
  // Set the captcha response
  await page.evaluate((captchaSolution) => {
    document.querySelector('[name="h-captcha-response"]').value = captchaSolution;
  }, captchaSolution);
  await page.click('#validar');
  // await page.waitForNavigation({ waitUntil: 'networkidle2' });

  // Set up download behavior
  await page._client().send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: '/tmp',
    userDataDir: './',
  });

  await page.screenshot({ path: 'screenshot1.png' });

  await page.waitForNavigation({ waitUntil: 'networkidle0' })

  // Adicionar captura de tela para depuração
  await page.screenshot({ path: 'screenshot2.png' });

  await page.waitForSelector('.fileDownloadAlerta', { timeout: 120000 }); 

  await page.click('.fileDownloadAlerta'),

  await page.waitForSelector('.ui-dialog-buttonset', { timeout: 120000 }); 

  // Find the downloaded PDF file
  const files = fs.readdirSync('/tmp');
  const pdfFile = files.find(file => file.endsWith('.pdf'));
  if (!pdfFile) {
    throw new Error('PDF file not found');
  }
  const pdfPath = path.join('/tmp', pdfFile);
  const pdfContent = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfContent.toString('base64');
  
  // Clean up the downloaded file
  fs.unlinkSync(pdfPath);

    await page.screenshot({ path: path.join(screenshotsDir, 'screenshot7.png'), fullPage: true });
    await browser.close();
    return pdfBase64;
  } catch (error) {
    await page.screenshot({ path: path.join(screenshotsDir, 'screenshot8.png'), fullPage: true });
    const pageContent = await page.content();
    console.error('Erro durante a execução do Puppeteer:', error);
    // await browser.close();
    throw { error, pageContent };
  }
};

app.get('/', async function (req, res) {
  const url = 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/Consultar';
  var { cnpj, dataInicio, dataFim } = req.query;
  cnpj = '23.531.805/0001-67';
  dataInicio = '01/01/2024';
  dataFim = '01/07/2024';
  if (!cnpj || !dataInicio || !dataFim) {
    return res.status(400).send('Parâmetros cnpj, dataInicio e dataFim são obrigatórios.');
  }

  console.log('Requisição recebida:', { cnpj, dataInicio, dataFim });

  try {
    const pdfBase64 = await run(url, cnpj, dataInicio, dataFim);
    res.status(200).json({"pdf": pdfBase64});
  } catch (error) {
    console.error('Erro na rota /:', error.error);
    res.status(500).send('Ocorreu um erro: ' + error );
  }
});

app.listen(port, '0.0.0.0', function () {
  console.log(`App ouvindo na asdasdsa ${port}!`);
});

