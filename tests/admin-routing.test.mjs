import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePathname, isAdminPath } from '../src/lib/routes.js'

for (const path of ['/admin', '/admin/', '/admin///?next=/', '/Admin', '/ADMIN/', '//admin//producto/AbC/', '/admin/pedidos']) {
  test(`keeps ${path} in administration`, () => assert.equal(isAdminPath(normalizePathname(path)), true))
}
test('preserves product IDs and excludes public paths', () => {
  assert.equal(normalizePathname('/ADMIN/producto/AbC/?test=1'), '/admin/producto/AbC')
  for (const path of ['/', '/administrador', '/catalogo?next=/admin']) assert.equal(isAdminPath(normalizePathname(path)), false)
})
