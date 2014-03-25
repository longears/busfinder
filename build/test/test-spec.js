
var spec = require('../spec.js');

exports['constructor with 3 arguments'] = function(test) {
    var mySpec = spec('a','b','c');
    test.equal(mySpec.agency, 'a');
    test.equal(mySpec.route, 'b');
    test.equal(mySpec.stop, 'c');
    test.equal(mySpec.hash(), 'a-b-c');
    test.done();
};

exports['constructor with 1 argument'] = function(test) {
    var mySpec = spec('a-b-c');
    test.equal(mySpec.agency, 'a');
    test.equal(mySpec.route, 'b');
    test.equal(mySpec.stop, 'c');
    test.equal(mySpec.hash(), 'a-b-c');
    test.done();
};

exports['construct two of them'] = function(test) {
    var spec1 = spec('a-b-c');
    var spec2 = spec('x-y-z');
    test.equal(spec1.hash(), 'a-b-c');
    test.equal(spec2.hash(), 'x-y-z');
    test.done();
};


