const { db } = require('./db');

const VALID_STATUSES = ['pending', 'produced', 'approved', 'rejected', 'published'];

function rowToProduction(row) {
  if (!row) return null;
  return {
    id: row.id,
    ideaId: row.idea_id,
    manifest: JSON.parse(row.manifest_json),
    status: row.status,
    videoPath: row.video_path,
    reviewDecision: row.review_decision,
    reviewNotes: row.review_notes,
    youtubeVideoId: row.youtube_video_id,
    youtubeUrl: row.youtube_url,
    publishedAt: row.published_at,
    analytics: row.analytics_json ? JSON.parse(row.analytics_json) : null,
    analyticsUpdatedAt: row.analytics_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createProduction({ ideaId, manifest }) {
  const now = new Date().toISOString();
  const result = db
    .prepare(`
      INSERT INTO productions (idea_id, manifest_json, status, created_at, updated_at)
      VALUES (@idea_id, @manifest_json, 'pending', @now, @now)
    `)
    .run({ idea_id: ideaId, manifest_json: JSON.stringify(manifest), now });
  return getProduction(result.lastInsertRowid);
}

function listProductions({ status } = {}) {
  const rows = status
    ? db.prepare('SELECT * FROM productions WHERE status = ? ORDER BY id DESC').all(status)
    : db.prepare('SELECT * FROM productions ORDER BY id DESC').all();
  return rows.map(rowToProduction);
}

function getProduction(id) {
  return rowToProduction(db.prepare('SELECT * FROM productions WHERE id = ?').get(id));
}

function updateProduction(id, patch) {
  const existing = getProduction(id);
  if (!existing) return null;

  const fields = [];
  const params = { id };

  const columnMap = {
    status: 'status',
    videoPath: 'video_path',
    reviewDecision: 'review_decision',
    reviewNotes: 'review_notes',
    youtubeVideoId: 'youtube_video_id',
    youtubeUrl: 'youtube_url',
    publishedAt: 'published_at',
    analyticsUpdatedAt: 'analytics_updated_at',
  };

  for (const [key, column] of Object.entries(columnMap)) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = @${column}`);
      params[column] = patch[key];
    }
  }
  if (patch.analytics !== undefined) {
    fields.push('analytics_json = @analytics_json');
    params.analytics_json = patch.analytics === null ? null : JSON.stringify(patch.analytics);
  }

  if (fields.length === 0) return existing;

  fields.push('updated_at = @updated_at');
  params.updated_at = new Date().toISOString();

  db.prepare(`UPDATE productions SET ${fields.join(', ')} WHERE id = @id`).run(params);
  return getProduction(id);
}

module.exports = { createProduction, listProductions, getProduction, updateProduction, VALID_STATUSES };
