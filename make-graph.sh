#!/bin/sh

nodeunit build/test
mv graph.dot build/
neato -Tpng build/graph.dot -o build/graph.png && open build/graph.png

