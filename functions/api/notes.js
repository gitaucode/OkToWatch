/**
 * /api/notes
 * GET    — get shared notes for a title (?tmdb_id=&media_type=)
 * POST   — create a shared note
 * PUT    — update a note (pin/unpin) (?id=)
 * DELETE — delete a note (?id=)
 */

import { requireFamily, jsonResponse, handleOptions } from '../_shared/clerk.js';

const VALID_NOTE_TYPES = ['observation', 'approval', 'caution'];

export async function onRequestGet(context) {
  const { request, env } = context;
  const { auth, error } = await requireFamily(request, env);
  if (error) return error;

  const url = new URL(request.url);
  const tmdb_id = url.searchParams.get('tmdb_id');
  const media_type = url.searchParams.get('media_type');

  if (!tmdb_id || !media_type) {
    return jsonResponse({ error: 'tmdb_id and media_type are required' }, 400);
  }

  try {
    // Get family_id (for now, use user_id as family_id — can be extended for real family accounts)
    const family_id = auth.userId;

    const notes = await env.DB
      .prepare(`
        SELECT id, user_id, note_type, message, is_pinned, created_at, updated_at
        FROM shared_notes
        WHERE family_id = ? AND tmdb_id = ? AND media_type = ?
        ORDER BY is_pinned DESC, created_at DESC
      `)
      .bind(family_id, parseInt(tmdb_id), media_type)
      .all();

    return jsonResponse(notes.results ?? []);
  } catch (e) {
    console.error('Notes fetch error:', e);
    return jsonResponse({ error: 'Failed to fetch notes' }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { auth, error } = await requireFamily(request, env);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { tmdb_id, media_type, note_type = 'observation', message } = body;
  if (!tmdb_id)    return jsonResponse({ error: 'tmdb_id is required' }, 400);
  if (!media_type) return jsonResponse({ error: 'media_type is required' }, 400);
  if (!message)    return jsonResponse({ error: 'message is required' }, 400);

  if (!VALID_NOTE_TYPES.includes(note_type)) {
    return jsonResponse({
      error: `note_type must be one of: ${VALID_NOTE_TYPES.join(', ')}`
    }, 400);
  }

  try {
    const family_id = auth.userId; // Use user_id as family_id
    const id = crypto.getRandomValues(new Uint8Array(8));
    const note_id = Array.from(id).map(b => b.toString(16).padStart(2, '0')).join('');

    await env.DB
      .prepare(`
        INSERT INTO shared_notes (id, user_id, family_id, tmdb_id, media_type, note_type, message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(note_id, auth.userId, family_id, parseInt(tmdb_id), media_type, note_type, message)
      .run();

    const note = await env.DB
      .prepare('SELECT * FROM shared_notes WHERE id = ?')
      .bind(note_id)
      .first();

    return jsonResponse(note, 201);
  } catch (e) {
    console.error('Note creation failed:', e);
    return jsonResponse({ error: 'Failed to create note' }, 500);
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const { auth, error } = await requireFamily(request, env);
  if (error) return error;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonResponse({ error: 'id is required' }, 400);

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { is_pinned } = body;

  try {
    // Verify ownership (author can pin/unpin)
    const note = await env.DB
      .prepare('SELECT * FROM shared_notes WHERE id = ?')
      .bind(id)
      .first();

    if (!note) return jsonResponse({ error: 'Note not found' }, 404);
    if (note.user_id !== auth.userId) return jsonResponse({ error: 'Unauthorized' }, 403);

    if (is_pinned !== undefined) {
      await env.DB
        .prepare('UPDATE shared_notes SET is_pinned = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .bind(is_pinned ? 1 : 0, id)
        .run();
    }

    const updated = await env.DB
      .prepare('SELECT * FROM shared_notes WHERE id = ?')
      .bind(id)
      .first();

    return jsonResponse(updated);
  } catch (e) {
    console.error('Note update failed:', e);
    return jsonResponse({ error: 'Failed to update note' }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const { auth, error } = await requireFamily(request, env);
  if (error) return error;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonResponse({ error: 'id is required' }, 400);

  try {
    // Verify ownership
    const note = await env.DB
      .prepare('SELECT * FROM shared_notes WHERE id = ?')
      .bind(id)
      .first();

    if (!note) return jsonResponse({ error: 'Note not found' }, 404);
    if (note.user_id !== auth.userId) return jsonResponse({ error: 'Unauthorized' }, 403);

    await env.DB
      .prepare('DELETE FROM shared_notes WHERE id = ?')
      .bind(id)
      .run();

    return jsonResponse({ deleted: true });
  } catch (e) {
    console.error('Note deletion failed:', e);
    return jsonResponse({ error: 'Failed to delete note' }, 500);
  }
}

export function onRequestOptions() {
  return handleOptions();
}
