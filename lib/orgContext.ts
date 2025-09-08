export function setOrgContext(orgId: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('orgId', orgId);
    document.cookie = `orgId=${orgId}; Path=/; SameSite=Lax`;
  }
}

export function getOrgContext(): string | null {
  if (typeof window !== 'undefined') {
    const ls = localStorage.getItem('orgId');
    if (ls) return ls;
  }
  const m = typeof document !== 'undefined'
    ? document.cookie.match(/(?:^|;)\s*orgId=([^;]+)/)
    : null;
  return m ? decodeURIComponent(m[1]) : null;
}

export function clearOrgContext() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('orgId');
    document.cookie = 'orgId=; Path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  }
}