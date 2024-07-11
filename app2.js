const puppeteer = require('puppeteer-firefox');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/caminho/para/seu/firefox',
    product: 'firefox',
    headless: false // Defina como true se quiser rodar em modo headless
  });
  const page = await browser.newPage();
  await page.goto('https://example.com');
  // Faça suas ações com o Puppeteer aqui
  await browser.close();
})();
