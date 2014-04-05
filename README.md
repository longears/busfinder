Busfinder
======================

A website which displays a bus departure schedule board.

Everything happens in Javascript in the browser.  You only need a basic dumb HTTP server.

The page fetches new bus times every 20 seconds.

To run:

* Run `./serve.sh` to start a basic HTTP server at `localhost:8000` for testing.

To host:

* Put `index.html` and `build/*` on a server somewhere.

To install dependencies:

* Run `npm install --production` to install local dependencies which will be bundled up into a single `bundle.min.js` file by browserify.
* Manually install, globally, the developer dependencies used to build/test/bundle the code: `sudo npm install -g browserify nodeunit react-tools reactify uglify-js`

To edit the bus routes, stops, and walking times, or work on the code:

* The transit network is specified in `build/config.js`.  Edit it to match your commute.
* Run `./make-graph.sh` to generate an image of the transit network (using graphviz command line tools)
* After making changes, run `./build.sh` to transform the jsx and bundle everything together into a single js file for the browser.
* While developing, you can run `./watch.sh` to build `bundle.js` every time you save a file.  However, this won't minify the bundle into `bundle.min.js` -- so you will need to load `/index-dev.html` which uses the unminified version, instead of `/index.html` which uses the minified version.

