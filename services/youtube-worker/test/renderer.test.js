const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { renderVideo, sanitizeForDrawtext } = require('../src/renderer');

function hasBinary(name) {
  try {
    execFileSync('which', [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const canRender = hasBinary('ffmpeg') && hasBinary('ffprobe') && hasBinary('espeak-ng');

test('sanitizeForDrawtext strips filtergraph-unsafe characters', () => {
  assert.equal(sanitizeForDrawtext(`it's a "test": 100%`), 'its a test 100');
});

test('sanitizeForDrawtext truncates long labels', () => {
  const long = 'a'.repeat(100);
  const result = sanitizeForDrawtext(long);
  assert.ok(result.length <= 70);
  assert.ok(result.endsWith('...'));
});

test(
  'renderVideo produces a playable mp4 from scenes',
  { skip: !canRender && 'ffmpeg/ffprobe/espeak-ng not available in this environment' },
  async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-render-test-'));
    const scenes = [
      { sceneNumber: 1, voiceover: 'This is a short test scene.', visual: 'test visual' },
      { sceneNumber: 2, voiceover: 'This is the second test scene.', visual: 'another visual' },
    ];

    const finalPath = await renderVideo(scenes, outDir);
    assert.ok(fs.existsSync(finalPath));
    assert.ok(fs.statSync(finalPath).size > 0);

    fs.rmSync(outDir, { recursive: true, force: true });
  }
);
