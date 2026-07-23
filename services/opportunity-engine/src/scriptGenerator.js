const gatewayClient = require('./gatewayClient');

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

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  return candidate.trim();
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

async function generateScript({ title, notes, research, model }) {
  const prompt = buildScriptPrompt({ title, notes, research });
  const text = await gatewayClient.generate(prompt, model);
  const script = parseScript(text);
  return { ...script, generatedAt: new Date().toISOString() };
}

module.exports = { generateScript, buildScriptPrompt, parseScript, ScriptParseError };
