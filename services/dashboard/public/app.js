const state = {
  ideas: [],
  productions: [],
  selectedIdeaId: null,
  selectedProductionId: null,
};

// ---------- helpers ----------

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const message = data?.error || `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  return data;
}

let toastTimer;
function toast(message, isErr = false) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 4000);
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString();
}

async function withBusy(button, fn) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Working…';
  try {
    await fn();
  } catch (err) {
    toast(err.message, true);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

// ---------- tabs ----------

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ---------- health ----------

async function pollHealth() {
  checkHealth('status-opportunity', '/api/opportunity/health');
  checkHealth('status-youtube', '/api/youtube/health');
}

async function checkHealth(elId, url) {
  const el = document.getElementById(elId);
  try {
    await api('GET', url);
    el.classList.add('ok');
    el.classList.remove('err');
  } catch {
    el.classList.add('err');
    el.classList.remove('ok');
  }
}

// ---------- ideas ----------

async function loadIdeas() {
  state.ideas = await api('GET', '/api/opportunity/ideas');
  renderIdeasList();
  populateProductionIdeaSelect();
}

function renderIdeasList() {
  const list = document.getElementById('ideas-list');
  list.innerHTML = '';
  for (const idea of state.ideas) {
    const li = document.createElement('li');
    li.className = 'item-row' + (idea.id === state.selectedIdeaId ? ' selected' : '');
    li.innerHTML = `
      <div class="item-title">${esc(idea.title)}</div>
      <div class="item-meta">
        <span class="badge ${idea.status}">${idea.status}</span>
        ${idea.profitabilityScore != null ? `<span>score ${idea.profitabilityScore}</span>` : ''}
      </div>`;
    li.addEventListener('click', () => selectIdea(idea.id));
    list.appendChild(li);
  }
}

async function selectIdea(id) {
  state.selectedIdeaId = id;
  renderIdeasList();
  const idea = await api('GET', `/api/opportunity/ideas/${id}`);
  renderIdeaDetail(idea);
}

function renderIdeaDetail(idea) {
  const el = document.getElementById('idea-detail');
  const research = idea.research;
  const script = idea.script;

  let researchHtml = '';
  if (research) {
    const dims = research.analysis || {};
    researchHtml = `
      <h3>Research (score ${idea.profitabilityScore ?? '—'})</h3>
      <pre>${esc(Object.entries(dims).map(([k, v]) => `${k}: ${v.score} — ${v.reasoning}`).join('\n'))}</pre>`;
  }

  let scriptHtml = '';
  if (script) {
    const scenes = [`<div class="scene"><div class="scene-label">Hook</div>${esc(script.hook)}</div>`]
      .concat((script.scenes || []).map((s) => `
        <div class="scene">
          <div class="scene-label">Scene ${s.sceneNumber}</div>
          <div><strong>Voiceover:</strong> ${esc(s.voiceover)}</div>
          <div><strong>Visual:</strong> ${esc(s.visual)}</div>
        </div>`))
      .concat(script.callToAction ? [`<div class="scene"><div class="scene-label">Call to action</div>${esc(script.callToAction)}</div>`] : []);
    scriptHtml = `<h3>Script: ${esc(script.title)}</h3>${scenes.join('')}`;
  }

  el.innerHTML = `
    <h2>${esc(idea.title)}</h2>
    <div class="sub"><span class="badge ${idea.status}">${idea.status}</span> · created ${fmtDate(idea.createdAt)}</div>
    ${idea.notes ? `<p>${esc(idea.notes)}</p>` : ''}
    <div class="action-row">
      <button id="btn-research" ${idea.status !== 'new' ? 'disabled' : ''}>Run research</button>
      <button id="btn-script" ${idea.status !== 'researched' ? 'disabled' : ''}>Generate script</button>
      <button id="btn-goto-production" class="secondary" ${idea.status !== 'scripted' ? 'disabled' : ''}>Create production</button>
      <button id="btn-delete-idea" class="danger">Delete</button>
    </div>
    ${researchHtml}
    ${scriptHtml}
  `;

  el.querySelector('#btn-research').addEventListener('click', (e) => withBusy(e.target, async () => {
    const updated = await api('POST', `/api/opportunity/ideas/${idea.id}/research`, {});
    toast('Research complete');
    await loadIdeas();
    renderIdeaDetail(updated);
  }));

  el.querySelector('#btn-script').addEventListener('click', (e) => withBusy(e.target, async () => {
    const updated = await api('POST', `/api/opportunity/ideas/${idea.id}/script`, {});
    toast('Script generated');
    await loadIdeas();
    renderIdeaDetail(updated);
  }));

  el.querySelector('#btn-goto-production').addEventListener('click', () => {
    document.querySelector('.tab-btn[data-tab="productions"]').click();
    document.getElementById('production-idea-select').value = idea.id;
  });

  el.querySelector('#btn-delete-idea').addEventListener('click', (e) => withBusy(e.target, async () => {
    if (!confirm(`Delete idea "${idea.title}"?`)) return;
    await api('DELETE', `/api/opportunity/ideas/${idea.id}`);
    state.selectedIdeaId = null;
    document.getElementById('idea-detail').innerHTML = '<p class="empty-state">Select an idea to see details.</p>';
    toast('Idea deleted');
    await loadIdeas();
  }));
}

document.getElementById('new-idea-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('idea-title').value.trim();
  const notes = document.getElementById('idea-notes').value.trim();
  const type = document.getElementById('idea-type').value.trim();
  if (!title) return;
  try {
    await api('POST', '/api/opportunity/ideas', { title, notes: notes || undefined, type: type || undefined });
    e.target.reset();
    toast('Idea created');
    await loadIdeas();
  } catch (err) {
    toast(err.message, true);
  }
});

document.getElementById('refresh-ideas').addEventListener('click', () => loadIdeas());

// ---------- productions ----------

function populateProductionIdeaSelect() {
  const select = document.getElementById('production-idea-select');
  const current = select.value;
  const scripted = state.ideas.filter((i) => i.status === 'scripted');
  select.innerHTML = '<option value="">Select a scripted idea…</option>' +
    scripted.map((i) => `<option value="${i.id}">#${i.id} — ${esc(i.title)}</option>`).join('');
  if (current) select.value = current;
}

async function loadProductions() {
  state.productions = await api('GET', '/api/youtube/productions');
  renderProductionsList();
}

function renderProductionsList() {
  const list = document.getElementById('productions-list');
  list.innerHTML = '';
  for (const p of state.productions) {
    const li = document.createElement('li');
    li.className = 'item-row' + (p.id === state.selectedProductionId ? ' selected' : '');
    li.innerHTML = `
      <div class="item-title">#${p.id} — ${esc(p.manifest?.title || `idea ${p.ideaId}`)}</div>
      <div class="item-meta"><span class="badge ${p.status}">${p.status}</span></div>`;
    li.addEventListener('click', () => selectProduction(p.id));
    list.appendChild(li);
  }
}

async function selectProduction(id) {
  state.selectedProductionId = id;
  renderProductionsList();
  const p = await api('GET', `/api/youtube/productions/${id}`);
  renderProductionDetail(p);
}

function renderProductionDetail(p) {
  const el = document.getElementById('production-detail');
  const scenes = (p.manifest?.scenes || []).map((s) => `
    <div class="scene">
      <div class="scene-label">Scene ${s.sceneNumber} — ${esc(s.visual)}</div>
      ${esc(s.voiceover)}
    </div>`).join('');

  const videoUrl = p.videoPath ? p.videoPath.replace('/app/videos', '/videos') : null;

  let analyticsHtml = '';
  if (p.analytics) {
    analyticsHtml = `<h3>Analytics (as of ${fmtDate(p.analyticsUpdatedAt)})</h3>
      <pre>${esc(JSON.stringify(p.analytics, null, 2))}</pre>`;
  }

  el.innerHTML = `
    <h2>#${p.id} — ${esc(p.manifest?.title || `idea ${p.ideaId}`)}</h2>
    <div class="sub"><span class="badge ${p.status}">${p.status}</span> · idea #${p.ideaId} · created ${fmtDate(p.createdAt)}</div>
    <div class="action-row">
      <button id="btn-render" ${p.status !== 'pending' ? 'disabled' : ''}>Render video</button>
      <button id="btn-approve" class="secondary" ${p.status !== 'produced' ? 'disabled' : ''}>Approve</button>
      <button id="btn-reject" class="danger" ${p.status !== 'produced' ? 'disabled' : ''}>Reject</button>
      <button id="btn-publish" ${p.status !== 'approved' ? 'disabled' : ''}>Publish to YouTube</button>
      <button id="btn-analytics" class="secondary" ${p.status !== 'published' ? 'disabled' : ''}>Refresh analytics</button>
    </div>
    ${p.youtubeUrl ? `<p><a href="${esc(p.youtubeUrl)}" target="_blank" rel="noopener">${esc(p.youtubeUrl)}</a></p>` : ''}
    ${videoUrl ? `<video controls src="${esc(videoUrl)}"></video>` : ''}
    ${p.reviewNotes ? `<p><strong>Review notes:</strong> ${esc(p.reviewNotes)}</p>` : ''}
    ${analyticsHtml}
    <h3>Scenes</h3>
    ${scenes}
  `;

  el.querySelector('#btn-render').addEventListener('click', (e) => withBusy(e.target, async () => {
    const updated = await api('POST', `/api/youtube/productions/${p.id}/render`, {});
    toast('Render complete');
    await loadProductions();
    renderProductionDetail(updated);
  }));

  el.querySelector('#btn-approve').addEventListener('click', (e) => withBusy(e.target, async () => {
    const updated = await api('POST', `/api/youtube/productions/${p.id}/review`, { approved: true });
    toast('Approved');
    await loadProductions();
    renderProductionDetail(updated);
  }));

  el.querySelector('#btn-reject').addEventListener('click', (e) => withBusy(e.target, async () => {
    const notes = prompt('Rejection notes (optional):') || undefined;
    const updated = await api('POST', `/api/youtube/productions/${p.id}/review`, { approved: false, notes });
    toast('Rejected');
    await loadProductions();
    renderProductionDetail(updated);
  }));

  el.querySelector('#btn-publish').addEventListener('click', (e) => withBusy(e.target, async () => {
    const updated = await api('POST', `/api/youtube/productions/${p.id}/publish`, {});
    toast('Published to YouTube');
    await loadProductions();
    renderProductionDetail(updated);
  }));

  el.querySelector('#btn-analytics').addEventListener('click', (e) => withBusy(e.target, async () => {
    const updated = await api('GET', `/api/youtube/productions/${p.id}/analytics`);
    toast('Analytics refreshed');
    renderProductionDetail(updated);
  }));
}

document.getElementById('new-production-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ideaId = document.getElementById('production-idea-select').value;
  if (!ideaId) return;
  try {
    await api('POST', '/api/youtube/productions', { ideaId: Number(ideaId) });
    toast('Production created');
    await loadProductions();
  } catch (err) {
    toast(err.message, true);
  }
});

document.getElementById('refresh-productions').addEventListener('click', () => loadProductions());

// ---------- init ----------

loadIdeas();
loadProductions();
pollHealth();
setInterval(pollHealth, 15000);
