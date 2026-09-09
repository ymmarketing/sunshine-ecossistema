import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const url = pathToFileURL(resolve(__dirname, '../../homologacao-v4/index.html')).href
const modules = ['home','pessoas','agenda','consultas','perguntas','trabalhos','financeiro','filhos','campanhas','performance','arquivos','integracoes']

test('homologação UX navega por todos os módulos sem backend ou rede externa', async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const external = []
  page.on('request', request => {
    if (!request.url().startsWith('file:')) external.push(request.url())
  })
  await page.goto(url)
  for (const module of modules) {
    if (['home','pessoas','agenda','financeiro'].includes(module)) {
      await page.locator(`.bottom [data-page="${module}"]`).click()
    } else {
      await page.locator('#moreBtn').click()
      await page.locator(`#menuGrid [data-page="${module}"]`).click()
    }
    await page.locator(`#page-${module}.active`).waitFor()
    assert.equal(new URL(page.url()).hash, `#${module}`)
  }
  assert.deepEqual(external, [])
  await browser.close()
})

test('Pessoas expande detalhes sem resetar navegação e busca filtra', async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(url + '#pessoas')
  await page.locator('#peopleSearch').fill('Fátima')
  assert.equal(await page.locator('.client-result').count(), 1)
  await page.locator('.client-result').click()
  assert.equal(await page.locator('.client-detail:not(.hidden)').count(), 1)
  assert.equal(new URL(page.url()).hash, '#pessoas')
  await browser.close()
})

test('Financeiro abre lançamento manual simplificado sem persistir dados', async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(url + '#financeiro')
  await page.locator('[data-action="novo-pagamento"]').click()
  await page.locator('#drawer:not(.hidden)').waitFor()
  const body = await page.locator('#drawerBody').innerText()
  assert.match(body, /Vamos cadastrar o quê\?/)
  assert.match(body, /Pagou quanto\?/)
  assert.match(body, /É inscrição de quantas pessoas\?/)
  assert.match(body, /completo ou pendente/i)
  await browser.close()
})

test('Trabalhos abre lista de inscritos com pagador diferente do beneficiário', async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(url + '#trabalhos')
  await page.locator('[data-work="0"]').click()
  const body = await page.locator('#drawerBody').innerText()
  assert.match(body, /Jakeline Demo/)
  assert.match(body, /pago por Maria Demo/i)
  assert.match(body, /Fátima Demo/)
  assert.match(body, /PARCIAL/)
  await browser.close()
})
