Busfinder
======================

A website which displays a bus departure schedule board.

Everything happens in Javascript in the browser.  You only need a basic dumb HTTP server.

The page fetches new bus times every 20 seconds.

To run:

* Run `./serve.sh` to start a basic HTTP server at `localhost:8000` for testing.

To edit the bus routes, stops, and walking times, or work on the code:

* The transit network is specified in `build/config.jsx`
* Run `./make-graph.sh` to generate an image of the transit network (using graphviz command line tools)
* After making changes, run `./build.sh` to transform the jsx and bundle everything together into a single js file for the browser.

