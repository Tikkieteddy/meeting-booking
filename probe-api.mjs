import { chromium, request as pwRequest } from '@playwright/test';
import { readFileSync } from 'node:fs';

const statePath = 'playwright/.auth/employee.json';
const state = JSON.parse(readFileSync(statePath, 'utf8'));
console.log('cookies in state =', state.cookies.map((c) => `${c.name}@${c.domain}${c.path} secure=${c.secure} sameSite=${c.sameSite} expires=${c.expires}`));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const context = await browser.newContext({ storageState: state, baseURL: 'http://127.0.0.1:3100' });
const page = await context.newPage();
await page.goto('/calendar');
console.log('page url after goto =', page.url());

const viaPage = await page.request.get('/api/rooms');
console.log('page.request GET /api/rooms =', viaPage.status());

const viaContext = await context.request.get('/api/rooms');
console.log('context.request GET /api/rooms =', viaContext.status());

const standalone = await pwRequest.newContext({ storageState: state, baseURL: 'http://127.0.0.1:3100' });
console.log('standalone request GET /api/rooms =', (await standalone.get('/api/rooms')).status());

const inPage = await page.evaluate(async () => {
  const res = await fetch('/api/rooms', { credentials: 'same-origin' });
  return res.status;
});
console.log('fetch inside page =', inPage);

await browser.close();
await standalone.dispose();
