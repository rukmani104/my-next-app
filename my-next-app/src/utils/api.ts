export async function apiGet(path: string) {
  const base = (process.env.NEXT_PUBLIC_EXTERNAL_API_BASE || process.env.AUTH_API_URL || '').replace(/\/$/, '');
  if (!base) {
    throw new Error('External API base URL not configured');
  }
  const url = `${base}/${path.replace(/^\//, '')}`;
  const token = process.env.NEXT_PUBLIC_API_TOKEN || process.env.API_TOKEN || process.env.X_API_TOKEN;

  const res = await fetch(url, {
    method: 'GET',
    headers: token ? { 'X-API-TOKEN': token } : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText} ${text}`);
  }
  return res.json();
}


