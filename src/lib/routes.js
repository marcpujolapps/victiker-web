export function normalizePathname(path) {
  const pathname = path.split(/[?#]/)[0].replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'
  // Treat the admin namespace consistently, preserving case-sensitive product IDs.
  return pathname.replace(/^\/admin(?=\/|$)/i, '/admin')
}

export function isAdminPath(pathname) {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}
