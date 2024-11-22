/*
 * OPL interface module.
 *
 * This is basically a wrapper around the Emscripten-produced module to make it
 * a little more JS-like.
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

import Loader from './lib/opl3-wasm.mjs'

// 16-bit samples take up two bytes each.
const SIZEOF_INT16 = 2;

// Maximum buffer size is 512 samples (the max the synth can produce) multiplied
// by the number of bytes needed to store each sample.
const MAX_BUFFER = 512 * 2 * SIZEOF_INT16;

/**
 * OPL interface.
 *
 * @property {Number} sampleRate
 *   Sampling rate supplied during creation, e.g. 44100.
 *
 * @property {Number} channelCount
 *   Number of channels set during creation.  1 for mono, 2 for stereo.
 */
export default class OPL
{
	/**
	 * Private constructor.  Use OPL.create() instead.
	 *
	 * @param {Object} Module
	 *   Emscripten interface.
	 *
	 * @param {Number} sampleRate
	 *   Playback audio sampling rate.
	 *
	 * @param {Number} channelCount
	 *   Number of channels.
	 */
	/*private*/ constructor(Module, sampleRate, channelCount) {
		this.sampleRate = sampleRate;
		this.channelCount = channelCount;

		// Create an instance of the C++ class.
		this.opl = new Module.OPL(sampleRate, channelCount, MAX_BUFFER);

		// Get the buffer created on the Emscripten heap by the C++ code.  This is
		// easier than trying to pass a JS buffer to the C++ code.
		this.s16array = this.opl.getBuffer();
	}

	/**
	 * Create an instance of the emulator.
	 *
	 * This function returns a {Promise}, which resolves into an instance of the
	 * {OPL} class when it is ready to use.
	 *
	 * @param {Number} sampleRate
	 *   Playback audio Sampling rate, e.g. 44100.  Default is the optimum
	 *   49716 Hz used natively.  Note that the sampling rate affects the way
	 *   some sounds are produced, so a different sampling rate will also change
	 *   the way the audio sounds.
	 *
	 * @param {Number} channelCount
	 *   Number of channels to generate.  1 for mono, 2 for stereo.  The output
	 *   buffer will have samples interleaved if stereo.
	 */
	static async create(sampleRate = 49716, channelCount = 2) {
		return new Promise((resolve, reject) => {
			// Initialise Emscripten.
			Loader().then(Module => {
				resolve(new OPL(Module, sampleRate, channelCount));
			});
		});
	}

	/**
	 * Generate some OPL samples.
	 *
	 * If the synth is running at a sample rate of 44.1 kHz, then calling this
	 * function with numSamples=44100 will produce one second of audio.
	 *
	 * Each sample in the returned buffer is 16-bits, even though the Buffer is
	 * byte-based.  This means the buffer length will be numSamples * 2 for mono,
	 * or numSamples * 4 for stereo.  In stereo, the channels are interleaved in
	 * the buffer, with every second 16-bit value being for the other channel.
	 *
	 * @param {Number} numSamples
	 *   Number of samples to generate.  Minimum is 2 and maximum is 512, both
	 *   limitations imposed by the emulator itself.
	 *
	 * @param {Object} format
	 *   Which kind of TypedArray to use when returning the data.  Defaults to
	 *   Uint8Array for byte-level access, but you can supply Int16Array if you
	 *   want to access individual samples by index.
	 *
	 * @return {Uint8Array} (or other typed array if 'format' was specified)
	 *   containing the samples produced.
	 *
	 * @note Each generate() call places data into the same buffer, so you must
	 * use the data (or make a copy of it) before the next call to generate().
	 * This is most important when using async functions, which may use the data
	 * long after the function returns.  If you don't copy the buffer in these
	 * cases, the function will end up working with the wrong set of samples.
	 */
	generate(numSamples, format = Uint8Array) {
		this.opl.generate(numSamples);

		// Return a view of the C++ heap where the generated samples were just
		// placed.  No data gets copied here.
		return new format(
			this.s16array.buffer,
			this.s16array.byteOffset,
			numSamples * this.channelCount * SIZEOF_INT16
		);
	}

	/**
	 * Write data to the emulated OPL chip.
	 *
	 * @param {Number} reg
	 *   OPL register, 0-255.
	 *
	 * @param {Number} val
	 *   Value to store in OPL register, 0-255.
	 *
	 * @return No return value.
	 */
	write(reg, val) {
		this.opl.write(reg, val);
	}

	/**
	 * Output bytes for wav-output
	 * 
	 * @param {ArrayBuffer/Uint8Array/Buffer} bytes
	 *    The bytes of the input (.imf, .wlf) file
	 * 
	 * @param {Boolean} wlf
	 *   Trigger wlf file-mode (a bit faster)
	 */
	async wave(bytes, wlf=false) {
	  const imf = new Uint8Array(bytes)
	  const tempoInHz = wlf ? 700 : 560
	  const samplesPerTick = Math.round(this.sampleRate / tempoInHz)
	  const wavDataOut = []
	  let lenIMF = imf.length
	  let p = 0
	  if (imf[0] || imf[1]) {
	    lenIMF = imf[0] | (imf[1] << 8)
	    p = 2
	  }
	  let samplesWritten = 0
	  while (p < lenIMF) {
	    const reg = imf[p + 0]
	    const val = imf[p + 1]
	    const delay = imf[p + 2] | (imf[p + 3] << 8)
	    this.write(reg, val)
	    if (delay) {
	      let lenGen = delay * samplesPerTick
	      while (lenGen > 0) {
	        const lenNow = Math.max(2, Math.min(512, lenGen))
	        wavDataOut.push(...this.generate(lenNow))
	        samplesWritten += lenNow
	        lenGen -= lenNow
	      }
	    }
	    p += 4
	  }
	  const lenData = samplesWritten * 4
	  const lenRIFF = lenData + 36
	  const a = new ArrayBuffer(44 + lenData)
	  const u = new Uint8Array(a)
	  const v = new DataView(a)
	  u.set(wavDataOut, 44)
	  v.setUint32(0, 0x52494646); // RIFF
	  v.setUint32(4, lenRIFF, true);
	  v.setUint32(8, 0x57415645); // WAVE
	  v.setUint32(12, 0x666d7420); // fmt_
	  v.setUint32(16, 16, true); // fmt chunk length
	  v.setUint16(20, 1, true); // 1=PCM
	  v.setUint16(22, 2, true); // stereo
	  v.setUint32(24, this.sampleRate, true);
	  v.setUint32(28, this.sampleRate * this.channelCount * 2, true);
	  v.setUint16(32, this.channelCount * 2, true); // block align
	  v.setUint16(34, 16, true); // bits per sample
	  v.setUint32(36, 0x64617461); // data
	  v.setUint32(40, lenData, true); // data chunk length
	  return u
	}
}

