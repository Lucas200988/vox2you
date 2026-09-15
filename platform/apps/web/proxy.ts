import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC = ['/login']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next') || pathname === '/favicon.ico')
    return NextResponse.next()
  const authed =
    !!request.cookies.get('vox_refresh')?.value || !!request.cookies.get('vox_access')?.value
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p))
  if (!authed && !isPublic) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }
  if (authed && isPublic) return NextResponse.redirect(new URL('/inbox', request.url))
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
