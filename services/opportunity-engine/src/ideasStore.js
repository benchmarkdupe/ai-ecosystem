const { db } = require('./db');

const VALID_STATUSES = ['new', 'researched', 'scripted'];

function rowToIdea(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    type: row.type,
    status: row.status,
    research: row.research_json ? JSON.parse(row.research_json) : null,
    profitabilityScore: row.profitability_score,
    script: row.script_json ? JSON.parse(row.script_json) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createIdea({ title, notes, type }) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO ideas (title, notes, type, status, created_at, updated_at)
    VALUES (@title, @notes, @type, 'new', @now, @now)
  `);
  const result = stmt.run({
    title,
    notes: notes ?? null,
    type: type || 'youtube_video',
    now,
  });
  return getIdea(result.lastInsertRowid);
}

function listIdeas({ status } = {}) {
  const rows = status
    ? db.prepare('SELECT * FROM ideas WHERE status = ? ORDER BY id DESC').all(status)
    : db.prepare('SELECT * FROM ideas ORDER BY id DESC').all();
  return rows.map(rowToIdea);
}

function getIdea(id) {
  const row = db.prepare('SELECT * FROM ideas WHERE id = ?').get(id);
  return rowToIdea(row);
}

function updateIdea(id, patch) {
  const existing = getIdea(id);
  if (!existing) return null;

  const fields = [];
  const params = { id };

  if (patch.title !== undefined) {
    fields.push('title = @title');
    params.title = patch.title;
  }
  if (patch.notes !== undefined) {
    fields.push('notes = @notes');
    params.notes = patch.notes;
  }
  if (patch.status !== undefined) {
    fields.push('status = @status');
    params.status = patch.status;
  }
  if (patch.research !== undefined) {
    fields.push('research_json = @research_json');
    params.research_json = patch.research === null ? null : JSON.stringify(patch.research);
  }
  if (patch.profitabilityScore !== undefined) {
    fields.push('profitability_score = @profitability_score');
    params.profitability_score = patch.profitabilityScore;
  }
  if (patch.script !== undefined) {
    fields.push('script_json = @script_json');
    params.script_json = patch.script === null ? null : JSON.stringify(patch.script);
  }

  if (fields.length === 0) return existing;

  fields.push('updated_at = @updated_at');
  params.updated_at = new Date().toISOString();

  db.prepare(`UPDATE ideas SET ${fields.join(', ')} WHERE id = @id`).run(params);
  return getIdea(id);
}

function deleteIdea(id) {
  const result = db.prepare('DELETE FROM ideas WHERE id = ?').run(id);
  return result.changes > 0;
}

module.exports = { createIdea, listIdeas, getIdea, updateIdea, deleteIdea, VALID_STATUSES };
