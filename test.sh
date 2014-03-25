#!/bin/sh

nodeunit build/test
mv graph.dot build/
