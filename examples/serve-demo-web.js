/*
 * Host the necessary files so that browsers can load the WebAssembly file via
 * HTTP, since some of them complain when loading from a file:// URL.
 */
var express = require('express');
var app = express();
var path = require('path');

app.use('/lib', express.static(path.join(__dirname, '..', 'lib'), {
	setHeaders: (res, path) => {
		if (path.substr(-5) === '.wasm') {
			res.set('Content-Type', 'application/wasm');
		}
	}
}));
app.use(express.static(path.join(__dirname, '..')));
app.use(express.static(__dirname));

app.listen(3388);
console.log('Go to http://localhost:3388/demo-web.html');
