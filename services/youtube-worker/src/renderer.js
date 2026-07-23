const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execFileAsync = promisify(execFile);

// No paid TTS/stock-footage API is wired up yet, so this renderer produces a
// real, working baseline video locally: espeak-ng for voiceover, ffmpeg for a
// per-scene title-card clip synced to that audio, concatenated into one mp4.
// Swap this module out for a higher-fidelity renderer (real TTS voice, stock
// footage/b-roll) later without touching the production/review/publish flow.

const FONT_CANDIDATES = [
  process.env.FONT_PATH,
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf', // alpine (ttf-dejavu)
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', // debian/ubuntu (fonts-dejavu-core)
].filter(Boolean);

function resolveFontPath() {
  for (const candidate of FONT_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`No usable font found for video rendering (checked: ${FONT_CANDIDATES.join(', ')})`);
}

// Strips the text down to a safe character set so it never needs ffmpeg
// filtergraph escaping (colons/quotes/backslashes are all excluded).
function sanitizeForDrawtext(text, maxLen = 70) {
  const cleaned = (text || '').replace(/[^a-zA-Z0-9 ,.!?-]/g, '').trim();
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 3)}...` : cleaned;
}

async function synthesizeSpeech(text, outPath) {
  await execFileAsync('espeak-ng', ['-s', '150', '-w', outPath, text]);
  return outPath;
}

async function getAudioDuration(audioPath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    audioPath,
  ]);
  return Math.max(parseFloat(stdout.trim()) || 1, 1);
}

async function buildSceneClip(scene, audioPath, outPath, fontPath) {
  const duration = await getAudioDuration(audioPath);
  const label = sanitizeForDrawtext(`Scene ${scene.sceneNumber}: ${scene.visual || ''}`);
  const drawtext =
    `drawtext=fontfile=${fontPath}:text='${label}':fontcolor=white:fontsize=42:` +
    'x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.5:boxborderw=20';

  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', `color=c=0x1a1a2e:s=1280x720:d=${duration}`,
    '-i', audioPath,
    '-vf', drawtext,
    '-shortest',
    '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p',
    outPath,
  ]);
  return { duration, outPath };
}

async function concatClips(clipPaths, outPath) {
  const listPath = `${outPath}.txt`;
  const listContent = clipPaths.map((p) => `file '${path.resolve(p)}'`).join('\n');
  fs.writeFileSync(listPath, listContent);
  try {
    await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outPath]);
  } finally {
    fs.unlinkSync(listPath);
  }
  return outPath;
}

// scenes: [{ sceneNumber, voiceover, visual }], in render order (caller is
// responsible for including hook/callToAction as scenes if desired).
async function renderVideo(scenes, outDir) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('renderVideo requires a non-empty scenes array');
  }
  const fontPath = resolveFontPath();
  fs.mkdirSync(outDir, { recursive: true });

  const clipPaths = [];
  for (const scene of scenes) {
    const audioPath = path.join(outDir, `scene-${scene.sceneNumber}.wav`);
    await synthesizeSpeech(scene.voiceover, audioPath);
    const clipPath = path.join(outDir, `scene-${scene.sceneNumber}.mp4`);
    await buildSceneClip(scene, audioPath, clipPath, fontPath);
    clipPaths.push(clipPath);
  }

  const finalPath = path.join(outDir, 'final.mp4');
  await concatClips(clipPaths, finalPath);
  return finalPath;
}

module.exports = { renderVideo, synthesizeSpeech, buildSceneClip, concatClips, resolveFontPath, sanitizeForDrawtext };
