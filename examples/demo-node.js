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

import { readFile, writeFile } from 'fs/promises';
import OPL from '../index.js';

const [,,filename, outputFilename] = process.argv;

if (!filename || !outputFilename) {
	console.error('Use: demo <input-imf-file> <output-wav-file>');
	process.exit(1);
}

const opl = await OPL.create();
await writeFile(outputFilename, await opl.wave(await readFile(filename)));
