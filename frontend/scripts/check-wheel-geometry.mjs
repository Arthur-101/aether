import assert from 'node:assert/strict';

import {
  buildSlices,
  sliceActionLabel,
  wheelPosition,
} from '../src/components/RadialWheel/geometry.ts';

const slices = (ext, ask = false) => buildSlices(ext, ask);

// Video: media targets only, never image edits.
assert.deepEqual(slices('mp4'), ['WEBM', 'GIF', 'MP3', 'COMPRESS']);
assert.ok(slices('mov').includes('MP4'));
assert.ok(!slices('webm').includes('WEBM'));
assert.ok(!slices('mp4').includes('CROP'));
assert.ok(!slices('mp4').includes('B&W'));

// Image: the regression from the recording (MP3/GIF/WEBM on a JPEG).
const jpeg = slices('jpg');
assert.ok(jpeg.includes('WEBP') && jpeg.includes('PNG'));
assert.ok(jpeg.includes('COMPRESS') && jpeg.includes('CROP') && jpeg.includes('B&W'));
assert.ok(!jpeg.includes('MP3') && !jpeg.includes('GIF') && !jpeg.includes('WEBM'));
assert.ok(!jpeg.includes('JPG'));
assert.ok(!slices('jpeg').includes('JPG'));
assert.ok(!slices('png').includes('PNG'));
assert.ok(!slices('gif').includes('COMPRESS'));

// Audio: audio targets only.
assert.deepEqual(slices('mp3'), ['WAV', 'M4A', 'OGG', 'COMPRESS']);
assert.ok(slices('wav').includes('MP3') && !slices('wav').includes('WAV'));

// PDF and documents.
assert.deepEqual(slices('pdf'), ['JPG', 'PNG', 'TXT', 'COMPRESS']);
assert.deepEqual(slices('docx'), ['TXT']);

// Ask AI is the only slice for text, and unknown types get nothing.
assert.deepEqual(slices('txt', true), ['ASK']);
assert.deepEqual(slices('zip', false), []);
assert.ok(slices('png', true).includes('ASK'));

// Pretty centre labels for the new media slices.
for (const label of ['MP3', 'WAV', 'M4A', 'OGG']) {
  assert.equal(sliceActionLabel(label, false), `Audio → ${label}`);
}
assert.equal(sliceActionLabel('WEBM', false), 'Video → WEBM');
assert.equal(sliceActionLabel('TXT', false), 'Convert → TXT');

// Placement: centred on the cursor, clamped inside the frame, using the frame
// origin (a secondary monitor has a non-zero origin) and its dpr.
const fullHd = { x: 0, y: 0, width: 3840, height: 2160, dpr: 2 };
assert.deepEqual(wheelPosition(1920, 1080, fullHd), { left: 774, top: 354 });
assert.deepEqual(wheelPosition(0, 0, fullHd), { left: 8, top: 8 });
assert.deepEqual(wheelPosition(3840, 2160, fullHd), { left: 1540, top: 700 });

const leftMonitor = { x: -1280, y: 0, width: 1280, height: 1024, dpr: 1 };
assert.deepEqual(wheelPosition(-100, 200, leftMonitor), { left: 900, top: 14 });

// A frame narrower than the wheel must still keep it on-screen, never negative.
const strip = { x: 800, y: -1, width: 220, height: 60, dpr: 1 };
assert.deepEqual(wheelPosition(900, 30, strip), { left: 8, top: 8 });

console.log('wheel geometry checks passed');
