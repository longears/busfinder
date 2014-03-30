#!/bin/sh

watchify -t reactify build/ui.jsx -x colors -o static/js/bundle.js -v

