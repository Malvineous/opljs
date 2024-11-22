# opl.js
Javascript wrapper: Copyright 2018 Adam Nielsen <<malvineous@shikadi.net>>  
OPL emulator: Copyright 2002-2015 The DOSBox Team  

This is a Javascript wrapper around the OPL3 emulator included in DOSBox.  It
allows OPL-compatible FM synthesis from within Javascript code, running in Node
or in the browser.

The emulator is written in C++ and compiled to Javascript WebAssembly with
Emscripten.  A small wrapper is provided to simplify the interface between the
C++ code and the Javascript code.

Example code is provided, both for the Node environment (with `require()`) and
for the browser (using `<script/>`).

## Installation
```
npm install @malvineous/opl
```

You can also use it on the web, with a CDN:

```html
<script type="importmap">
  {
    "imports": {
      "@malvineous/opl": "https://esm.sh/@malvineous/opl"
    }
  }
</script>
<script type="module">
import OPL from '@malvineous/opl'
</script>
```

## Use

```js
import OPL from '@malvineous/opl';

OPL.create().then(opl => {
    opl.write(0xBD, 0x20);
    const samples = opl.generate(512);
    // samples now contains 512 16-bit stereo samples as a Uint8Array
});
```

## Examples

In the `examples/` folder there are some short demonstrations showing how to
interface with the OPL emulator.

The web example may not work if loading the HTML file directly, as some browsers
do not like loading WebAssembly files from `file://` URLs.  To run this example,
you can either upload it somewhere or use Node to run `npm start` which
will run a static web-server to host the necessary files.

## Limitations

The library is only focused on generating the audio.  It does not feature any
sort of playback or audio mixing mechanism, as this is likely to be very
different for different projects.  You will need to include another library in
your project if you wish to play the generated audio.  The web example shows how
to use WebAudio for playback in the browser, and the Node example shows how to
save the generated audio to a .wav file instead.

8-bit and floating point audio formats are not supported.  You can still use
these formats, but you'll need to convert the signed 16-bit samples into these
formats yourself.  The WebAudio sample code shows conversion to floating point.

## Contributing

When you install the release with `npm` the WebAssembly binary is included.
This is not part of the git repository, so if you clone the repo you will need
to install `emscripten` in order to compile the C++ code into Javascript.

Once `emscripten` is installed, run:

```
npm run build
```

This will compile the C++ code in `src/` and put the compiled files into `lib/`.
