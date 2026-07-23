// Turns a scripted idea (from the Opportunity Engine) into the flat scene
// list the renderer consumes, plus title/description for YouTube publishing.
function buildManifest(idea) {
  const script = idea.script;
  if (!script) {
    throw new Error('Idea has no script yet');
  }

  const scenes = [];
  let sceneNumber = 1;
  if (script.hook) {
    scenes.push({ sceneNumber: sceneNumber++, voiceover: script.hook, visual: 'Hook' });
  }
  for (const scene of script.scenes || []) {
    scenes.push({ sceneNumber: sceneNumber++, voiceover: scene.voiceover, visual: scene.visual });
  }
  if (script.callToAction) {
    scenes.push({ sceneNumber: sceneNumber++, voiceover: script.callToAction, visual: 'Call to action' });
  }

  return {
    ideaId: idea.id,
    title: script.title || idea.title,
    description: buildDescription(idea),
    scenes,
  };
}

function buildDescription(idea) {
  const parts = [];
  if (idea.notes) parts.push(idea.notes);
  if (idea.script?.callToAction) parts.push(idea.script.callToAction);
  return parts.join('\n\n');
}

module.exports = { buildManifest, buildDescription };
