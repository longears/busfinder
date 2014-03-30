
var isNode = (typeof window === 'undefined');
var colors = undefined;
if (isNode) {
    colors = require('colors');
}

exports.makelog = function(color) {
    // returns a function which you can use like console.log.
    // color should be either absent/undefined or a string matching one of the following:
    //  red
    //  yellow
    //  green
    //  cyan
    //  blue
    //  magenta
    //  grey (not "gray")
    if (color === undefined) {
        return console.log;
    } else {
        if (isNode) {
            return function() {
                var args = Array.prototype.slice.call(arguments);
                console.log.apply(console, args.map(function(arg) {
                    return (arg+'')[color];
                }));
            };
        } else {
            if (color === 'green') {
                color = '#0a0';
            } else if (color === 'cyan') {
                color = '#088';
            }
            return function() {
                var args = Array.prototype.slice.call(arguments);
                if (args.length === 0) {
                    console.log();
                } else {
                    var newArgs = ['%c'+args[0], 'color: '+color+';'];
                    newArgs = newArgs.concat(args.slice(1));
                    console.log.apply(console, newArgs);
                }
            };
        }
    }
};

