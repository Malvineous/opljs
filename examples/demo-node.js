/*
 * Example program for using the OPL synth from within the NodeJS environment.
 *
 * To keep things simple, this doesn't handle audio playback but rather just
 * the generation of the samples, writing them to a raw PCM .wav file.
 *
 * Copyright (C) 2018 Adam Nielsen <malvineous@shikadi.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const fs = require('fs');
const OPL = require('../index.js');

const filename = process.argv[2];
const outputFilename = process.argv[3];
if (!filename || !outputFilename) {
	console.error('Use: demo <input-imf-file> <output-wav-file>');
	process.exit(1);
}

// Status message while startup happens
const tInitStart = process.hrtime();
process.stdout.write('--');

OPL.create().then(opl => {
	// Finish timing the startup process.
	const tInitDuration = process.hrtime(tInitStart);

	const imf = fs.readFileSync(filename);

	// Create a stream to write the PCM data.
	const outStream = fs.createWriteStream(outputFilename);

	// Leave space for the .wav header, which we will write last because we need
	// to know how many bytes we wrote all up.
	outStream.write(new Uint8Array(44));

	// IMF files run at 560 Hz, with one delay tick being 1/560th of a second.
	let tempoInHz = 560;

	// Files with '.wlf' extension have a faster tempo.
	if (filename.substr(-3).toLowerCase() == 'wlf') {
		tempoInHz = 700;
	}

	// Work out how many samples we need to generate to produce one tick's worth
	// of a musical delay.  We process delays between notes by running the
	// synthesiser for the number of samples needed to ride out the length of the
	// delay.
	//
	// For example, at a 44.1 kHz sampling rate we would generate 22,050
	// continuous samples to produce a musical delay of 0.5 seconds.
	//
	// Handling delays in this manner gives us excellent precision (in theory down
	// to the duration of a single sample), no jitter (the song tempo won't change
	// if the script runs at an uneven speed), and low CPU load (no need for
	// high-precision timers or to run as a higher priority process.)
	const samplesPerTick = Math.round(opl.sampleRate / tempoInHz);

	// Initial status message and start the timer so we know how long the whole
	// process took.
	process.stdout.write('\r0%');
	const timeStart = process.hrtime();

	// How many ticks since the last status message.  We print a message every
	// two seconds of song data.
	let statusDelay = 0;

	// Track the total number of samples written, so we can calculate the length
	// of the song.
	let samplesWritten = 0;

	let lenIMF = imf.length, p = 0;
	if (imf[0] | imf[1]) {
		// Type-1 IMF has a length header we need to use.
		lenIMF = imf[0] | (imf[1] << 8);
		p = 2;
	} // else Type-0 IMF

	// Run through the song data, one event at a time.
	for (; p < lenIMF; p += 4) {

		// Display progress after every five seconds of audio is processed.
		if (statusDelay > tempoInHz * 5) {
			const progress = Math.round(p / imf.length * 100);
			process.stdout.write('\r' + progress + '%');
			statusDelay = 0;
		}

		// Read the song data and write it to the OPL.
		const reg = imf[p + 0];
		const val = imf[p + 1];
		let delay = imf[p + 2] | (imf[p + 3] << 8);
		opl.write(reg, val);

		if (delay) {
			statusDelay += delay;

			// Work out how many samples we need to generate to cause a musical delay
			// of the correct length.
			let lenGen = delay * samplesPerTick;

			while (lenGen > 0) {
				// We can only generate between two and 512 samples at a time, so if the
				// delay is larger than 512 we call generate() multiple times, producing
				// 512 samples at a time.  If the number of samples is only 1 then we
				// cheat and just generate 2, because the delay will increase by such
				// a tiny amount (0.02ms) that it will not be noticeable.
				let lenNow = Math.max(2, Math.min(512, lenGen));

				// Actually run the synth and produce the samples.  Note that the
				// returned buffer is a window into the Emscripten stack (not a copy of
				// the data) so you must use the data before the next call to generate()
				// or it will be overwritten.  If you are passing the buffer to an async
				// function (like we are here with file I/O) then the buffer must be
				// copied, otherwise when the function finally goes to use the buffer
				// it won't contain the original samples anymore.
				const samples = opl.generate(lenNow);

				// Since we are writing to a stream, the Buffer object we are writing
				// gets cached (not copied) and written out to the stream later.  By
				// this time the actual Buffer will be overwritten by future generate()
				// calls, so we need to copy the data into a new Buffer before passing
				// it to the stream.
				let copy = Buffer.from(samples);
				outStream.write(copy);
				samplesWritten += lenNow;

				lenGen -= lenNow;
			}
		}
	}
	outStream.on('finish', () => {
		// Go back and write the wave file header now we know the data length.
		let f = fs.openSync(outputFilename, 'r+');
		const lenData = samplesWritten * 4;
		const lenRIFF = lenData + 36;

		let ab = new ArrayBuffer(44);
		let view = new DataView(ab, 0, 44);
		view.setUint32(0, 0x52494646); // RIFF
		view.setUint32(4, lenRIFF, true);
		view.setUint32(8, 0x57415645); // WAVE
		view.setUint32(12, 0x666d7420); // fmt_
		view.setUint32(16, 16, true); // fmt chunk length
		view.setUint16(20, 1, true); // 1=PCM
		view.setUint16(22, 2, true); // stereo
		view.setUint32(24, opl.sampleRate, true);
		view.setUint32(28, opl.sampleRate * opl.channelCount * 2, true);
		view.setUint16(32, opl.channelCount * 2, true); // block align
		view.setUint16(34, 16, true); // bits per sample
		view.setUint32(36, 0x64617461); // data
		view.setUint32(40, lenData, true); // data chunk length
		fs.writeSync(f, new Uint8Array(ab, 0, 44));
		fs.closeSync(f);
	});
	outStream.end();

	process.stdout.write('\r');
	// Save how long it took to render the whole song.
	const durationTotal = process.hrtime(timeStart);
	const timeTotal = durationTotal[0] + durationTotal[1] / 1000000000;

	// Calculate the length of the song from the number of samples we wrote.
	const durationSeconds = samplesWritten / opl.sampleRate;
	const secTotal = durationSeconds % 60;
	const minTotal = Math.round(durationSeconds - secTotal) / 60;
	const strDuration = minTotal + ':' + secTotal.toFixed(2).toString().padStart(5, '0');

	// Work out how fast the synth runs compared to playing the song in real time,
	// with 1.0 being exactly real time, and 2.0 meaning the synth runs twice as
	// fast as realtime.
	const synthSpeed = durationSeconds / timeTotal;

	// How long, in milliseconds, it took to start up Emscripten.  This is useful
	// when testing different compiler optimisations.
	const initTime = (tInitDuration[0] * 1000 + tInitDuration[1] / 1000000).toFixed(2);

	// Final summary message.
	console.log(
		'Song length:', strDuration,
		'/ running time:', timeTotal.toFixed(2), 'sec / rendered at',
		synthSpeed.toFixed(1) + 'x realtime / init took',
		initTime, 'ms'
	);
});
