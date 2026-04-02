/**
 * GET /api/announcements
 * Returns active, non-expired announcements for display on all pages.
 * Public endpoint — no auth required.
 */
export async function onRequestGet(context) {
  const { env } = context;
  try {
    const rows = await env.DB.prepare(`
      SELECT id, message, type FROM announcements
      WHERE active = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY created_at DESC
      LIMIT 3
    `).all();
    return new Response(JSON.stringify(rows.results), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' }
    });
  } catch {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
