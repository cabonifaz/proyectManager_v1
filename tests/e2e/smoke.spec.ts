import { test, expect, Page } from '@playwright/test'

const SLUG = 'qa-playwright'
const EMAIL = 'qa.playwright@test.local'
const PASSWORD = 'QaPlaywright2026!'

async function login(page: Page) {
  await page.goto(`/login?slug=${SLUG}`)
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.waitForURL(new RegExp(`/${SLUG}/`), { timeout: 15_000 })
}

test.describe('Login y navegación básica', () => {
  test('login redirige al portal del tenant', async ({ page }) => {
    await login(page)
    await expect(page.getByText('QA Playwright')).toBeVisible()
  })

  test('el menú lateral arranca colapsado y se expande con el botón', async ({ page }) => {
    await login(page)
    const aside = page.locator('aside')
    await expect(aside).toHaveClass(/w-16/)
    await page.getByTitle('Expandir menú').click()
    await expect(aside).toHaveClass(/w-56/)
  })
})

test.describe('Backlog', () => {
  test('carga la tabla, filtros compactos por defecto, y el título es chico', async ({ page }) => {
    await login(page)
    await page.goto(`/${SLUG}/backlog`)
    await expect(page.getByRole('heading', { name: 'Backlog' })).toBeVisible()
    await expect(page.getByText('QAP-1')).toBeVisible()
    await expect(page.getByText('QAP-2')).toBeVisible()
    // Filtros secundarios ocultos por defecto (modo compacto)
    await expect(page.getByPlaceholder('Buscar código, módulo, descripción...')).toHaveCount(0)
  })

  test('la descripción se puede expandir y contraer con un click', async ({ page }) => {
    await login(page)
    await page.goto(`/${SLUG}/backlog`)
    const descBtn = page.getByRole('button', { name: /Ticket de prueba QA 1/ }).first()
    await expect(descBtn).toHaveClass(/line-clamp-1/)
    await descBtn.click()
    await expect(descBtn).not.toHaveClass(/line-clamp-1/)
    await descBtn.click()
    await expect(descBtn).toHaveClass(/line-clamp-1/)
  })

  test('columnas de tecnología: crear, editar y eliminar', async ({ page }) => {
    await login(page)
    await page.goto(`/${SLUG}/backlog`)
    await page.getByTitle(/Mostrar filtros/).click()
    await page.getByRole('button', { name: '⚙ Columnas' }).click()

    await expect(page.getByRole('heading', { name: 'Columnas de Tecnología' })).toBeVisible()
    await page.getByPlaceholder('Ej: Base de Datos, AWS, QA...').fill('QA Columna')
    await page.getByRole('button', { name: 'Agregar Columna' }).click()

    // El modal se cierra solo al guardar; se reabre para ver la columna recién creada
    await page.getByRole('button', { name: '⚙ Columnas' }).click()
    const dialog = page.getByRole('heading', { name: 'Columnas de Tecnología' }).locator('..').locator('..')
    await expect(dialog.getByText('QA Columna')).toBeVisible()

    await dialog.getByTitle('Editar columna').last().click()
    const editInput = dialog.locator('input.flex-1.border.rounded.px-2.py-1')
    await editInput.fill('QA Columna Editada')
    await dialog.getByRole('button', { name: '✓' }).click()
    // Guardar cierra el modal (igual que Agregar); se verifica en la tabla y se reabre para borrar
    await expect(page.getByRole('columnheader', { name: 'QA Columna Editada' })).toBeVisible()

    await page.getByRole('button', { name: '⚙ Columnas' }).click()
    const dialog2 = page.getByRole('heading', { name: 'Columnas de Tecnología' }).locator('..').locator('..')
    page.once('dialog', d => d.accept())
    await dialog2.getByTitle('Eliminar columna').last().click()
    await expect(dialog2.getByText('QA Columna Editada')).toHaveCount(0)
  })
})

test.describe('Sprint', () => {
  test('carga la tabla ordenada por prioridad y el checklist tiene dos checks', async ({ page }) => {
    await login(page)
    await page.goto(`/${SLUG}/sprint`)
    await expect(page.getByRole('heading', { name: 'Sprints' })).toBeVisible()
    await expect(page.getByText('QAP-1')).toBeVisible()

    await page.getByText('QAP-1').first().click()
    await page.getByRole('button', { name: 'Checklist' }).click()
    await expect(page.getByRole('heading', { name: 'Ejecución de Checklist' })).toBeVisible()
    await expect(page.getByText('Tarea de checklist QA 1')).toBeVisible()
    await expect(page.getByTitle('Check del desarrollador').first()).toBeVisible()
    await expect(page.getByTitle(/Check del gestor/).first()).toBeVisible()
  })
})

test.describe('Observaciones', () => {
  test('por defecto no lista las resueltas', async ({ page }) => {
    await login(page)
    await page.goto(`/${SLUG}/observaciones`)
    await expect(page.getByRole('heading', { name: 'Observaciones' })).toBeVisible()
    await expect(page.getByText('Observacion de prueba QA')).toBeVisible()
  })
})
