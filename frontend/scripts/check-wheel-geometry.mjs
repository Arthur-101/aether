import assert from 'node:assert/strict';

import {
  buildSlices,
  sliceActionLabel,
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

console.log('wheel geometry checks passed');
