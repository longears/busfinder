#!/bin/sh

browserify -t reactify build/ui.jsx -o static/js/bundle.js
uglifyjs static/js/bundle.js -o static/js/bundle.min.js

