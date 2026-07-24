const { runChain, extractJson } = require('./agentChain');

const AI_MODEL_DRAFT = process.env.AI_MODEL_DRAFT || undefined;
const AI_MODEL_CRITIC = process.env.AI_MODEL_CRITIC || undefined;

class ScriptParseError extends Error {
  constructor(message, raw) {
    super(message);
    this.name = 'ScriptParseError';
    this.raw = raw;
  }
}

function buildScriptPrompt({ title, notes, research }) {
  return `You are a YouTube scriptwriter for an autonomous content channel.

Write a complete video script for the following idea. Break it into scenes that a
video production pipeline can render (each scene becomes one clip: a voiceover line
read by text-to-speech, paired with a short on-screen visual direction).

Return ONLY valid JSON, with no markdown formatting and no commentary, in exactly this shape:
{
  "title": string,
  "hook": string,
  "scenes": [
    { "sceneNumber": number, "voiceover": string, "visual": string }
  ],
  "callToAction": string,
  "estimatedDurationSeconds": number
}

Guidance:
- hook: the first line spoken, must grab attention in the first 5 seconds
- scenes: 5-12 scenes, each voiceover is 1-3 sentences (readable in ~10-20 seconds by TTS), visual is a short plain-language description of what should be shown on screen
- callToAction: a short closing line (subscribe/like/comment prompt)
- estimatedDurationSeconds: rough total spoken duration across hook + all scenes

Idea: """${title}"""
${notes ? `\nNotes: ${notes}` : ''}
${research ? `\nResearch context (may be partial):\n${JSON.stringify(research)}` : ''}`;
}

function buildEditorPrompt({ title, notes, research }, draftScript) {
  return `You are a senior YouTube script editor. A junior writer drafted the script below. Your job is to tighten it, not rubber-stamp it: sharpen the hook so it earns the first 5 seconds, fix any scene that's confusing, boring, or too long for TTS pacing, and make sure the call to action is natural.

Idea: """${title}"""
${notes ? `\nNotes: ${notes}` : ''}
${research ? `\nResearch context (may be partial):\n${JSON.stringify(research)}` : ''}

Draft script:
${JSON.stringify(draftScript, null, 2)}

Return your revised version. Return ONLY valid JSON, with no markdown formatting and no commentary, in exactly this shape:
{
  "title": string,
  "hook": string,
  "scenes": [
    { "sceneNumber": number, "voiceover": string, "visual": string }
  ],
  "callToAction": string,
  "estimatedDurationSeconds": number
}`;
}

function parseScript(text) {
  let parsed;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch (err) {
    throw new ScriptParseError('AI Gateway response was not valid JSON', text);
  }

  if (typeof parsed.title !== 'string' || typeof parsed.hook !== 'string') {
    throw new ScriptParseError('AI response missing "title" or "hook"', text);
  }
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new ScriptParseError('AI response missing non-empty "scenes" array', text);
  }

  const scenes = parsed.scenes.map((scene, i) => {
    if (typeof scene.voiceover !== 'string' || !scene.voiceover.trim()) {
      throw new ScriptParseError(`Scene ${i + 1} missing "voiceover"`, text);
    }
    return {
      sceneNumber: Number(scene.sceneNumber) || i + 1,
      voiceover: scene.voiceover,
      visual: typeof scene.visual === 'string' ? scene.visual : '',
    };
  });

  return {
    title: parsed.title,
    hook: parsed.hook,
    scenes,
    callToAction: typeof parsed.callToAction === 'string' ? parsed.callToAction : '',
    estimatedDurationSeconds: Number(parsed.estimatedDurationSeconds) || null,
  };
}

// Two-agent chain: a writer drafts the script, then an editor (a separate,
// reasoning-oriented model) revises it. The editor's version is what ships.
async function generateScript({ title, notes, research, model }) {
  const steps = [
    {
      role: 'writer',
      model: model || AI_MODEL_DRAFT,
      buildPrompt: () => buildScriptPrompt({ title, notes, research }),
      parse: parseScript,
    },
    {
      role: 'editor',
      model: AI_MODEL_CRITIC,
      buildPrompt: (prior) => buildEditorPrompt({ title, notes, research }, prior.writer),
      parse: parseScript,
    },
  ];

  const { finalOutput, prior, trace } = await runChain(steps, title);

  return {
    ...finalOutput,
    draftScript: prior.writer,
    modelsUsed: trace,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { generateScript, buildScriptPrompt, buildEditorPrompt, parseScript, ScriptParseError };
