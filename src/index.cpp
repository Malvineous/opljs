/*
 * JavaScript wrapper for DOSBox OPL synth.
 *
 * Copyright (C) 2010-2018 Adam Nielsen <malvineous@shikadi.net>
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

#include <emscripten.h>
#include <emscripten/bind.h>

#include "dbopl.h"

using namespace emscripten;
using namespace DBOPL;

// Max buffer size.  Since only 512 samples can be generated at a time, setting
// this to 512 * 2 channels means it'll be the largest it'll ever need to be.
#define BUFFER_SIZE_SAMPLES 1024

// Size of each sample in bytes (2 == 16-bit)
#define SAMPLE_SIZE 2

// Volume amplication (0 == none, 1 == 2x, 2 == 4x)
#define VOL_AMP 1

// Clipping function to prevent integer wraparound after amplification
#define SAMP_BITS (SAMPLE_SIZE << 3)
#define SAMP_MAX ((1 << (SAMP_BITS-1)) - 1)
#define SAMP_MIN -((1 << (SAMP_BITS-1)))
#define CLIP(v) (((v) > SAMP_MAX) ? SAMP_MAX : (((v) < SAMP_MIN) ? SAMP_MIN : (v)))

class SampleHandler: public MixerChannel {
	public:
		int16_t *jsbuffer;
		uint8_t channels;

		SampleHandler(int16_t *jsbuffer, uint8_t channels)
			: jsbuffer(jsbuffer),
			  channels(channels)
		{
		}

		virtual ~SampleHandler()
		{
		}

		virtual void AddSamples_m32(Bitu samples, Bit32s *buffer)
		{
			// Convert samples from mono s32 to stereo s16
			int16_t *out = (int16_t *)this->jsbuffer;
			for (unsigned int i = 0; i < samples; i++) {
				Bit32s v = buffer[i] << VOL_AMP;
				*out++ = CLIP(v);
				if (channels == 2) *out++ = CLIP(v);
			}
			return;
		}

		virtual void AddSamples_s32(Bitu samples, Bit32s *buffer)
		{
			// Convert samples from stereo s32 to stereo s16
			int16_t *out = (int16_t *)this->jsbuffer;
			for (unsigned int i = 0; i < samples; i++) {
				Bit32s v = buffer[i*2] << VOL_AMP;
				*out++ = CLIP(v);
				if (channels == 2) {
					v = buffer[i*2+1] << VOL_AMP;
					*out++ = CLIP(v);
				}
			}
			return;
		}
};

class OPL {
	private:
		DBOPL::Handler dbopl;
		int16_t *jsbuffer;
		int lenBufferSamples;
		SampleHandler mixer;
		int channels;

	public:
		OPL(int freq, int channels, int lenBufferSamples)
			: jsbuffer(new int16_t[BUFFER_SIZE_SAMPLES * channels]),
			  lenBufferSamples(BUFFER_SIZE_SAMPLES),
			  mixer(jsbuffer, channels),
			  channels(channels)
		{
			this->dbopl.Init(freq);
		}

		~OPL()
		{
			delete[] this->jsbuffer;
		}

		void write(int reg, int val) {
			this->dbopl.WriteReg(reg, val);
		}

		val getBuffer()
		{
			return val(typed_memory_view(this->lenBufferSamples * channels, this->jsbuffer));
		}

		void generate(int lenSamples)
		{
			if (lenSamples > 512) {
				EM_ASM({
					throw new Error('OPL.generate() cannot generate more than 512 samples per call');
				});
				return;
			}
			if (lenSamples < 2) {
				EM_ASM({
					throw new Error('OPL.generate() cannot generate fewer than 2 samples per call');
				});
				return;
			}
			this->dbopl.Generate(&this->mixer, lenSamples);
		}
};

EMSCRIPTEN_BINDINGS(main) {
	class_<OPL>("OPL")
		.constructor<int, int, int>()
		.function("write", &OPL::write)
		.function("generate", &OPL::generate)
		.function("getBuffer", &OPL::getBuffer)
	;
}
