
//var request = require('superagent');
if (typeof window === 'undefined') {
    var request = require('req'+'uest'); // browserify can't see this
} else {
    var request = require('browser-request'); // node won't load this
}
var moment = require('moment');

var spec = require('./spec.js');
var logcolors = require('./logcolors.js')

var logError = logcolors.makelog('red');
var logMain = logcolors.makelog('green');
var logDetails = logcolors.makelog('blue');
var logBoring = logcolors.makelog('grey');

logDetails = logBoring = function(){};

// leg:
//      spec            (for walking, use 'walk-x-x')
//      from, to        locations
//      duration        in minutes
//      startTime       prediction in epochTime
//      endTime

module.exports = function() {
    var self = {};

    //======================================================================
    // config

    self.locations = {}; // map from name -> {short long color}
    self.legs = []; // list of all possible legs
    self.maxTransitLegs = 2;
    self.maxDumbMinutes = 9; // if a trip is more than X minutes suboptimal compared to another trip, discard it
    self.maxPastLeaveMinutes = 3; // if you should have left X minutes ago, ignore

    self.readConfig = function(config) {
        // config should be an object like this:
        //  {
        //      locations: {
        //          bartembr: {
        //              short: 'Embr',
        //              long: 'Embarcadero Bart',
        //              color: '#555',
        //          },
        //          /* ... */
        //      },
        //      legs: [
        //          {
        //              spec: 'actransit-F-295783',
        //              from: 'transbay',
        //              to: 'grandlake',
        //              duration: 35
        //          },
        //          /* ... */
        //      ]
        //  }
        var replaceUnlessUndefined = function(attr, val) {if (self.attr === undefined) {self.attr = val;}}
        replaceUnlessUndefined('maxTransitLegs', config.maxTransitLegs);
        replaceUnlessUndefined('maxDumbMinutes', config.maxDumbMinutes);
        replaceUnlessUndefined('maxPastLeaveMinutes', config.maxPastLeaveMinutes);

        self.locations = config.locations;
        config.legs.map(function(leg) {
            self._addLeg(leg);
        });
    };

    //======================================================================
    // state

    // public (read-only)
    self.pendingRequests = 0;  // don't set this from the outside, but you can read it
    self.lastCalculationMs = 0;
    self.lastFetchTime = 0;

    // private
    self._predictions = {}; // map from spec.hash -> {lastUpdated, startTimes}

    //======================================================================
    // utils

    var epochTimeToHumanTime = function(et) {
        return moment(et).format('hh:mm a');
    };

    self._legToString = function(leg) {
        if (leg === undefined) {
            return '(undefined)';
        }
        if (leg.startTime === undefined) {
            return '('+leg.spec.agencyRouteHash()+'.  '+leg.from+' -> '+leg.to+'.  '+leg.duration+' minutes)';
        } else {
            return '('+epochTimeToHumanTime(leg.startTime)+' - '+epochTimeToHumanTime(leg.endTime)+': '+leg.spec.agencyRouteHash()+'.  '+leg.from+' -> '+leg.to+'.  '+leg.duration+' minutes)';
        }
    };

    var legsToString = function(legs, indentString) {
        return legs.map(function(leg) {return indentString+self._legToString(leg)}).join('\n');
    };

    var clone = function(obj) {
        // Handle the 3 simple types, and null or undefined
        if (null == obj || "object" != typeof obj) return obj;

        // Handle Date
        if (obj instanceof Date) {
            var copy = new Date();
            copy.setTime(obj.getTime());
            return copy;
        }

        // Handle Array
        if (obj instanceof Array) {
            var copy = [];
            for (var i = 0, len = obj.length; i < len; i++) {
                copy[i] = clone(obj[i]);
            }
            return copy;
        }

        // Handle Object
        if (obj instanceof Object) {
            var copy = {};
            for (var attr in obj) {
                if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
            }
            return copy;
        }

        throw new Error("Unable to copy obj! Its type isn't supported.");
    }

    //======================================================================
    // private methods

    self._addLeg = function(leg) {
        // add a leg to the config
        // if it's "walk-x-x", add the reverse leg as well.

        if (typeof(leg.spec) === 'string') {
            leg.spec = spec(leg.spec);
        }

        // check if it exists already
        for (var ll=0; ll < self.legs.length; ll++) {
            existingLeg = self.legs[ll];
            if (   leg.spec.hash() === existingLeg.spec.hash()
                && leg.from == existingLeg.from
                && leg.to == existingLeg.to) {
                logError('ERROR: duplicate leg');
                throw 'duplicate leg';
            }
        }

        self.legs.push(leg);
        if (leg.spec.hash() === 'walk-x-x') {
            self.legs.push({
                spec: spec(leg.spec.hash()),
                from: leg.to,
                to: leg.from,
                duration: leg.duration
            });
        }
        if (self.locations[leg.from] === undefined) {
            logError('ERROR: unknown location: '+leg.from);
            throw 'unknown location: '+leg.from;
        }
        if (self.locations[leg.to] === undefined) {
            logError('ERROR: unknown location: '+leg.to);
            throw 'unknown location: '+leg.to;
        }
    };

    self._generateDot = function() {
        var dot = '';
        dot += 'digraph {\n';
        dot += '    edge [len=3];\n';
        for (var ll=0; ll < self.legs.length; ll++) {
            var leg = self.legs[ll];
            if (leg.spec.agency === 'walk') {
                dot += '    '+leg.from+' -> '+leg.to + '[label="walk '+leg.duration+'m", color=orange];\n';
            } else if (leg.spec.agency === 'actransit') {
                dot +='    '+leg.from+' -> '+leg.to + '[label="'+leg.spec.route+' '+leg.duration+'m", color=forestgreen, style=bold];\n';
            } else { // bart
                dot +='    '+leg.from+' -> '+leg.to + '[label="'+leg.spec.route+' '+leg.duration+'m", color=blue, style=bold];\n';
            }
        }
        dot += '}\n';
        return dot;
    }

    self._uniqueSpecHashes = function() {
        // return a sorted list of unique specHashes from all possible legs
        var specHashes = self.legs.map(function(leg) {return leg.spec.hash()});
        var uniqueSpecHashes = specHashes.filter(function(v,i,a) {return a.indexOf(v) == i});
        uniqueSpecHashes.sort();
        return uniqueSpecHashes;
    };

    self._getLegsFrom = function(location) {
        // return a list of legs from a certain location
        return self.legs.filter(function(leg) {return leg.from === location;});
    };

    self._getLegsTo = function(location) {
        // return a list of legs to a certain location
        return self.legs.filter(function(leg) {return leg.to === location;});
    };

    self._getLegsFromTo = function(from, to) {
        // return a list of legs to a certain location
        return self.legs.filter(function(leg) {return (leg.from === from && leg.to === to);});
    };

    self._enumerateTrips = function(from, to) {
        // return a list of all the trips from the start to the finish that don't visit a location twice.
        // each trip is a list of legs.
        // this doesn't take into account predictions at all -- the returned trips will have legs with no
        //  startTimes or endTimes.
        var trips = [];
        var visitedLocationsThisTrip = [];
        var legsInThisTrip = [];
        var explore = function(startLocation) {
            if (startLocation === to) {
                trips.push(legsInThisTrip.slice(0));
                return;
            }
            visitedLocationsThisTrip.push(startLocation);
            // for each outgoing path...
            var outgoingLegs = self._getLegsFrom(startLocation);
            for (var oo=0; oo < outgoingLegs.length; oo++) {
                var outgoingLeg = outgoingLegs[oo];
                var nextLocation = outgoingLeg.to;
                // if it leads to a location we haven't been yet...
                if (visitedLocationsThisTrip.indexOf(nextLocation) === -1) {
                    legsInThisTrip.push(outgoingLeg);
                    // recurse
                    explore(nextLocation);
                    legsInThisTrip.pop();
                }
            }
            visitedLocationsThisTrip.pop();
        };
        explore(from);
        trips = trips.filter(self._isInterestingTrip);
        return trips;
    };

    self._isInterestingTrip = function(trip) {
        // return true if this is an ok trip or false if it's a dumb one.

        // ignore if walking from A to B to C when you could have walked directly from A to C
        for (var ll=0; ll < trip.length - 1; ll++) {
            var thisLeg = trip[ll];
            var nextLeg = trip[ll+1];
            if (thisLeg.spec.agency === 'walk' && nextLeg.spec.agency === 'walk') {
                // look for direct walking legs from A to C
                var directLegs = self._getLegsFromTo(thisLeg.from, nextLeg.to).filter(function(leg) {return leg.spec.agency === 'walk';});
                if (directLegs.length >= 1) {
                    return false;
                }
            }
        }

        // ignore if more than self.maxTransitLegs transit legs
        var transitLegs = trip.filter(function(leg) {return leg.spec.agency !== 'walk';});
        if (transitLegs.length > self.maxTransitLegs) {
            return false;
        }

        return true;
    };

    self._parseNextbusResponse = function(thisSpec, text) {
        // given json from a nextbus multi-prediction style response (for a single stop),
        // return {startTimes: [...], lastUpdated: 12345}
        // if no buses, return undefined
        logDetails('    parsing '+thisSpec.hash());
        var json = JSON.parse(text);
        var epochTimes = [];
        for (var ii=0; ii < json.length; ii++) {
            var routePredictions = json[ii];
            for (var pp=0; pp < routePredictions.values.length; pp++) {
                var prediction = routePredictions.values[pp];
                epochTimes.push(prediction.epochTime)
            }
        }
        return {startTimes: epochTimes, lastUpdated: (new Date).getTime()};
    };

    self._parseBartResponse = function(thisSpec, text) {
        logDetails('    parsing '+thisSpec.hash());
        var epochTimes = [];
        var now = (new Date).getTime();

        var routeTexts = text.split('<abbreviation>');
        routeTexts.shift(); // remove first item
        for (var rr = 0; rr < routeTexts.length; rr++) {
            var routeText = routeTexts[rr];
            var route = routeText.split('<')[0];
            if (route !== thisSpec.route) {
                continue;
            }
            var minuteTexts = routeText.split('<minutes>');
            var epochTimes = [];
            minuteTexts.shift();
            theseEpochTimes = minuteTexts.map(function(mt) {
                var minutes = mt.split('<')[0];
                if (minutes === 'Leaving') {
                    minutes = 0;
                } else {
                    minutes = parseInt(minutes, 10);
                }
                return now + minutes * 60 * 1000;
            });
            epochTimes = epochTimes.concat(theseEpochTimes);
        }
        return {startTimes: epochTimes, lastUpdated: (new Date).getTime()};
    };

    //======================================================================
    // public methods

    self.updatePredictions = function(callback) {
        // reach out to the web and update self._predictions.  when done with all ajax calls, run callback.
        logMain('-----------------------------------------\\');
        logMain('fetching predictions...');
        var specHashes = self._uniqueSpecHashes();
        self.pendingRequests = 0;
        self.erroredRequests = 0;
        for (var ss=0; ss < specHashes.length; ss++) {
            var thisSpecHash = specHashes[ss];
            var thisSpec = spec(thisSpecHash);
            if (thisSpec.agency === 'walk') {
                // ignore walk
                continue;
            } else if (thisSpec.agency === 'actransit') {
                var url = 'http://restbus.info/api/agencies/'+thisSpec.agency+'/tuples/'+thisSpec.route+':'+thisSpec.stop+'/predictions';
                var parseFn = self._parseNextbusResponse;
            } else if (thisSpec.agency === 'bart') {
                var url = 'http://api.bart.gov/api/etd.aspx?cmd=etd&orig='+thisSpec.stop+'&key=MW9S-E7SL-26DU-VV8V';
                var parseFn = self._parseBartResponse;
            }
            self.pendingRequests += 1;
            (function(thisSpecHash, thisSpec, parseFn) {
                logDetails('  about to get '+url);
                request(
                    url,
                    function(error, response, body) {
                // // this uses superagent
                //request
                //    .get(url)
                //    .end(function(error,res) {
                        if (error) {
                            logDetails('    ERROR');
                            self.erroredRequests += 1;
                        } else {
                            logDetails('    got '+url);
                            self._predictions[thisSpecHash] = parseFn(thisSpec, body);
                        }

                        // if all the ajax calls are done, run the callback.
                        self.pendingRequests -= 1;
                        if (self.pendingRequests === 0) {
                            logMain('    ...done fetching');
                            logMain('-----------------------------------------/');
                            self.lastFetchTime = (new Date).getTime();
                            callback(self.erroredRequests);
                        } else {
                            logMain('      '+self.pendingRequests+' still pending');
                        }
                    });
            }(thisSpecHash, thisSpec, parseFn));
        }
    };

    self._coalesceAdjacentWalkLegs = function(trip) {
        // return a copy of the trip with any adjascent walking legs
        //  combined into single walking legs with summed durations
        if (trip.length === 0) {return [];}
        var newTrip = [trip[0]];
        for (var ll=1; ll < trip.length; ll++) {
            var thisLeg = trip[ll];
            var prevGoodLeg = newTrip[newTrip.length-1];
            if (prevGoodLeg.spec.agency === 'walk' && thisLeg.spec.agency === 'walk') {
                newTrip.pop();
                newTrip.push({
                    spec: prevGoodLeg.spec,
                    from: prevGoodLeg.from,
                    to: thisLeg.to,
                    duration: prevGoodLeg.duration + thisLeg.duration,
                    startTime: prevGoodLeg.startTime,
                    endTime: thisLeg.endTime,
                });
            } else {
                newTrip.push(thisLeg);
            }
        }
        return newTrip;
    };

    self.getTrips = function(from, to) {

        if (false) {
            return JSON.parse('[[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"loscantaros","duration":6,"startTime":1395933506588,"endTime":1395933866588},{"spec":{"agency":"actransit","route":"12","stop":"1011830"},"from":"loscantaros","to":"bart19th","duration":11,"startTime":1395933866588,"endTime":1395934526588},{"spec":{"agency":"bart","route":"DALY","stop":"19TH"},"from":"bart19th","to":"bartembr","duration":12,"startTime":1395934750592,"endTime":1395935470592},{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"bartembr","to":"explo","duration":20,"startTime":1395935470592,"endTime":1395936670592}],[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"loscantaros","duration":6,"startTime":1395933506588,"endTime":1395933866588},{"spec":{"agency":"actransit","route":"12","stop":"1011830"},"from":"loscantaros","to":"bart19th","duration":11,"startTime":1395933866588,"endTime":1395934526588},{"spec":{"agency":"bart","route":"SFIA","stop":"19TH"},"from":"bart19th","to":"bartembr","duration":12,"startTime":1395934990299,"endTime":1395935710299},{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"bartembr","to":"explo","duration":20,"startTime":1395935710299,"endTime":1395936910299}],[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"saloon","duration":11,"startTime":1395933524667,"endTime":1395934184667},{"spec":{"agency":"actransit","route":"B","stop":"9902310"},"from":"saloon","to":"transbay","duration":23,"startTime":1395934184667,"endTime":1395935564667},{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"transbay","to":"explo","duration":26,"startTime":1395935564667,"endTime":1395937124667}],'
                +'[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"loscantaros","duration":6,"startTime":1395933506588,"endTime":1395933866588},{"spec":{"agency":"actransit","route":"12","stop":"1011830"},"from":"loscantaros","to":"bart19th","duration":11,"startTime":1395933866588,"endTime":1395934526588},{"spec":{"agency":"bart","route":"MLBR","stop":"19TH"},"from":"bart19th","to":"bartembr","duration":12,"startTime":1395935410462,"endTime":1395936130462},{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"bartembr","to":"explo","duration":20,"startTime":1395936130462,"endTime":1395937330462}],[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"bart19th","duration":26,"startTime":1395933850462,"endTime":1395935410462},{"spec":{"agency":"bart","route":"MLBR","stop":"19TH"},"from":"bart19th","to":"bartembr","duration":12,"startTime":1395935410462,"endTime":1395936130462},{"spec":{"agency":"walk","route":"x","stop":"x"},'
                +'"from":"bartembr","to":"explo","duration":20,"startTime":1395936130462,"endTime":1395937330462}],[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"bart19th","duration":26,"startTime":1395934030592,"endTime":1395935590592},{"spec":{"agency":"bart","route":"DALY","stop":"19TH"},"from":"bart19th","to":"bartembr","duration":12,"startTime":1395935590592,"endTime":1395936310592},{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"bartembr","to":"explo","duration":20,"startTime":1395936310592,"endTime":1395937510592}],[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"saloon","duration":11,"startTime":1395933634514,"endTime":1395934294514},{"spec":{"agency":"actransit","route":"NL","stop":"9902310"},"from":"saloon","to":"transbay","duration":31,"startTime":1395934294514,"endTime":1395936154514},{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"transbay","to":"explo","duration":26,"startTime":1395936154514,"endTime":1395937714514}],[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"loscantaros","duration":6,"startTime":1395934179922,"endTime":1395934539922},{"spec":{"agency":"actransit","route":"NL","stop":"1011830"},"from":"loscantaros","to":"transbay","duration":28,"startTime":1395934539922,"endTime":1395936219922},{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"transbay","to":"explo","duration":26,"startTime":1395936219922,"endTime":1395937779922}],[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"loscantaros","duration":6,"startTime":1395934618103,'
                +'"endTime":1395934978103},{"spec":{"agency":"actransit","route":"12","stop":"1011830"},"from":"loscantaros","to":"bart19th","duration":11,"startTime":1395934978103,"endTime":1395935638103},{"spec":{"agency":"bart","route":"SFIA","stop":"19TH"},"from":"bart19th","to":"bartembr","duration":12,"startTime":1395935890299,"endTime":1395936610299},{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"bartembr","to":"explo","duration":20,"startTime":1395936610299,"endTime":1395937810299}],[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"bart19th","duration":26,"startTime":1395934330299,"endTime":1395935890299},{"spec":{"agency":"bart","route":"SFIA","stop":"19TH"},"from":"bart19th","to":"bartembr","duration":12,"startTime":1395935890299,"endTime":1395936610299},{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"bartembr","to":"explo","duration":20,"startTime":1395936610299,"endTime":1395937810299}],[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"loscantaros","duration":6,"startTime":1395934618103,"endTime":1395934978103},{"spec":{"agency":"actransit",'
                +'"route":"12","stop":"1011830"},"from":"loscantaros","to":"bart19th","duration":11,"startTime":1395934978103,"endTime":1395935638103},{"spec":{"agency":"bart","route":"MLBR","stop":"19TH"},"from":"bart19th","to":"bartembr","duration":12,"startTime":1395936310462,"endTime":1395937030462},{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"bartembr","to":"explo","duration":20,"startTime":1395937030462,"endTime":1395938230462}],[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"bart19th","duration":26,"startTime":1395934750462,"endTime":1395936310462},{"spec":{"agency":"bart","route":"MLBR","stop":"19TH"},"from":"bart19th","to":"bartembr","duration":12,"startTime":1395936310462,"endTime":1395937030462},{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"bartembr","to":"explo","duration":20,"startTime":1395937030462,"endTime":1395938230462}],[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"loscantaros",'
                +'"duration":6,"startTime":1395935107730,"endTime":1395935467730},{"spec":{"agency":"actransit","route":"NL","stop":"1011830"},"from":"loscantaros","to":"transbay","duration":28,"startTime":1395935467730,"endTime":1395937147730},{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"transbay","to":"explo","duration":26,"startTime":1395937147730,"endTime":1395938707730}],[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"saloon","duration":11,"startTime":1395934949622,"endTime":1395935609622},{"spec":{"agency":"actransit","route":"NX","stop":"9902310"},"from":"saloon","to":"transbay","duration":27,"startTime":1395935609622,"endTime":1395937229622},{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"transbay","to":"explo","duration":26,"startTime":1395937229622,"endTime":1395938789622}],[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"saloon","duration":11,"startTime":1395935444038,"endTime":1395936104038},'
                +'{"spec":{"agency":"actransit","route":"NL","stop":"9902310"},"from":"saloon","to":"transbay","duration":31,"startTime":1395936104038,"endTime":1395937964038},{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"transbay","to":"explo","duration":26,"startTime":1395937964038,"endTime":1395939524038}],[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"loscantaros","duration":6,"startTime":1395935951926,"endTime":1395936311926},{"spec":{"agency":"actransit","route":"NL","stop":"1011830"},"from":"loscantaros","to":"transbay","duration":28,"startTime":1395936311926,"endTime":1395937991926},{"spec":{"agency":"walk","route":"x","stop":"x"},'
                +'"from":"transbay","to":"explo","duration":26,"startTime":1395937991926,"endTime":1395939551926}],[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"saloon","duration":11,"startTime":1395937119322,"endTime":1395937779322},{"spec":{"agency":"actransit","route":"NL","stop":"9902310"},"from":"saloon","to":"transbay","duration":31,"startTime":1395937779322,"endTime":1395939639322},{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"transbay","to":"explo","duration":26,"startTime":1395939639322,"endTime":1395941199322}],[{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"home","to":"loscantaros","duration":6,"startTime":1395937627210,"endTime":1395937987210},{"spec":{"agency":"actransit","route":"NL","stop":"1011830"},"from":"loscantaros","to":"transbay","duration":28,"startTime":1395937987210,"endTime":1395939667210},{"spec":{"agency":"walk","route":"x","stop":"x"},"from":"transbay","to":"explo","duration":26,"startTime":1395939667210,"endTime":1395941227210}]]');
        }


        // given a from and to location, return a list of trips using live predictions.
        // each trip is a list of legs with startTime and endTime set.
        var calculationBeginTime = (new Date).getTime();

        logDetails('==================== get trips from '+from+' to '+to+' ====================');

        // first get a list of all possible trips with coalesced walk legs
        var possibleTrips = self._enumerateTrips(from, to).map(function(trip) {return self._coalesceAdjacentWalkLegs(trip)});

        // remove trips that have a transit leg with no predicted times
        possibleTrips = possibleTrips.filter(function(trip) {
            for (var ll=0; ll < trip.length; ll++) {
                var leg = trip[ll];
                if (leg.spec.agency === 'walk') {continue;}
                if (   (self._predictions[leg.spec.hash()] === undefined)
                    || (self._predictions[leg.spec.hash()].startTimes.length === 0)  ) {
                    return false;
                }
            }
            return true;
        });

        // sort by number of legs, lowest first
        possibleTrips.sort(function(a,b) {return a.length - b.length});

        var allSpecificTrips = [];
        var now = (new Date).getTime();

        // for each possible trip
        for (var pp = 0; pp < possibleTrips.length; pp++) {
            var specificTrips = [];
            var possibleTrip = possibleTrips[pp];
            logBoring();
            logDetails('========== possible trip with '+possibleTrip.length+' legs');

            // ignore empty trips
            if (possibleTrip.length === 0) {
                logBoring('SKIPPING empty trip');
                continue;
            }

            // find first walking leg and first transit leg of possibleTrip
            var firstWalkLeg = undefined; // can only be element 0
            var firstTransitLeg = undefined; // can be element 0 or 1
            var remainingLegs = [];
            for (var ll = 0; ll < possibleTrip.length; ll++) {
                var leg = possibleTrip[ll];
                if (ll === 0 && leg.spec.agency === 'walk') {
                    firstWalkLeg = leg;
                } else if (ll <= 1 && leg.spec.agency !== 'walk' && firstTransitLeg === undefined) {
                    firstTransitLeg = leg;
                } else {
                    remainingLegs.push(leg);
                }
            }
            logBoring('+ finding first walk and transit legs');
            logBoring('| first walk leg:', '\n|   '+self._legToString(firstWalkLeg));
            logBoring('| first transit leg:', '\n|   '+self._legToString(firstTransitLeg));
            logBoring('| remaining legs:', '\n'+legsToString(remainingLegs, '|   '));
            logBoring();

            // if the trip is just a single walk leg:
            if (firstTransitLeg === undefined && firstWalkLeg !== undefined) {
                logBoring('this possibleTrip is just a single walk leg');
                var walkLeg = clone(firstWalkLeg);
                walkLeg.startTime = now;
                walkLeg.endTime = now + walkLeg.duration * 60 * 1000;
                specificTrips.push([walkLeg]);

            } else { // the trip includes at least one transit leg
                // if the first transit leg has no predictions, bail on the entire POSSIBLE trip
                firstTransitLegStartTimes = self._predictions[firstTransitLeg.spec.hash()].startTimes;
                if (firstTransitLegStartTimes.length === 0) {
                    logBoring('SKIPPING this possible trip: first transit leg has no start times (bus is not running right now)');
                    continue;
                }
                // for each start time of the first transit leg:
                logBoring('+ stepping through prediction times from the first transit leg');
                for (var st=0; st < firstTransitLegStartTimes.length; st++) {
                    var virtualClock = firstTransitLegStartTimes[st];
                    var thisSpecificTripFailed = false;
                    logBoring('| first transit leg predicted departure at', epochTimeToHumanTime(virtualClock));
                    // make a specific trip
                    var thisSpecificTrip = [];
                    // special handling of first walk leg: slide it forward to hit the startTime
                    if (firstWalkLeg !== undefined) {
                        // start with the walk leg if there is one
                        var specificFirstWalkLeg = clone(firstWalkLeg);
                        specificFirstWalkLeg.startTime = virtualClock - firstWalkLeg.duration * 60 * 1000;
                        specificFirstWalkLeg.endTime = virtualClock;
                        thisSpecificTrip.push(specificFirstWalkLeg);

                        // if first walk leg's start time is < now, bail on the entire specific trip
                        if (specificFirstWalkLeg.startTime < now - self.maxPastLeaveMinutes*60*1000) {
                            logBoring('SKIPPING this specific trip: you already missed it');
                            continue;
                        }
                    }
                    // add the first transit leg
                    var specificFirstTransitLeg = clone(firstTransitLeg);
                    specificFirstTransitLeg.startTime = virtualClock;
                    specificFirstTransitLeg.endTime = virtualClock + specificFirstTransitLeg.duration * 60 * 1000;
                    virtualClock = specificFirstTransitLeg.endTime;
                    thisSpecificTrip.push(specificFirstTransitLeg);

                    // add the rest of the legs
                    for (var rr = 0; rr < remainingLegs.length; rr++) {
                        var thisLeg = remainingLegs[rr];
                        var thisSpecificLeg = clone(thisLeg);
                        if (thisLeg.spec.agency === 'walk') {
                            thisSpecificLeg.startTime = virtualClock;
                            thisSpecificLeg.endTime = thisSpecificLeg.startTime + thisSpecificLeg.duration * 60 * 1000;
                            virtualClock = thisSpecificLeg.endTime;
                            thisSpecificTrip.push(thisSpecificLeg);
                        } else {
                            // it's a transit leg
                            // get predictions, use earliest one greater than virtualClock
                            var nextPossibleStartTimes = self._predictions[thisSpecificLeg.spec.hash()].startTimes
                                                            .filter(function(st) {return st >= virtualClock;});
                            if (nextPossibleStartTimes.length === 0) {
                                // no possible times.  bus isn't running or we got there too late.
                                // bail on this entire specific trip.
                                logBoring('|   BAILED: no bus available for a later transit leg');
                                thisSpecificTripFailed = true;
                                break;
                            } else {
                                var nextPossibleStartTime = nextPossibleStartTimes[0];
                                thisSpecificLeg.startTime = nextPossibleStartTime;
                                thisSpecificLeg.endTime = thisSpecificLeg.startTime + thisSpecificLeg.duration * 60 * 1000;
                                virtualClock = thisSpecificLeg.endTime;
                                thisSpecificTrip.push(thisSpecificLeg);
                            }
                        }
                    } // end of "add the rest of the legs"

                    // done building this specific trip
                    if (!thisSpecificTripFailed) {
                        logBoring('|   made a trip with '+thisSpecificTrip.length+' legs');
                        specificTrips.push(thisSpecificTrip);
                    }

                } // end of "for each start time of the first transit leg"
            } // end of "else the trip contains at least one transit leg"

            // clean up specificTrips to remove trips that will get us there at the same time ("redundant trips")
            // sort by leaving time in reverse (latest-leaving trips first)
            specificTrips.sort(function(a,b) {return b[0].startTime - a[0].startTime;});
            // step through and ignore ones that have the same arrival time as the previous one
            var prevArrival;
            var keptSpecificTrips = [];
            for (var tt=0; tt < specificTrips.length; tt++) {
                var thisSpecificTrip = specificTrips[tt];
                var thisArrival = thisSpecificTrip[thisSpecificTrip.length-1].endTime;
                if (thisArrival !== prevArrival) {
                    keptSpecificTrips.push(thisSpecificTrip);
                } else {
                    logDetails('discarded a redundant specific trip');
                }
                prevArrival = thisArrival;
            }
            specificTrips = keptSpecificTrips;

            // save the specificTrips we just made out of this possibleTrip
            allSpecificTrips = allSpecificTrips.concat(specificTrips);

            // print out the specific trips we just made out of this possibleTrip
            logBoring();
            logDetails('+ generated '+specificTrips.length+' specific trips:');
            specificTrips.map(function(st) {
                var duration = (st[st.length-1].endTime - st[0].startTime) / 1000 / 60;
                logBoring('| '+Math.round(duration)+' minutes:');
                logBoring(legsToString(st,'|   '));
            });

        } // end of for each possible trip
        logBoring();
        logBoring('done generating specific trips.');
        logBoring();

        // remove "dumb trips" -- trips that have strictly better alternatives (leave later and arrive earlier)
        // sort by startTime in reverse (latest-leaving trips first)
        logBoring('+ removing pointlessly slow trips');
        allSpecificTrips.sort(function(a,b) {return b[0].startTime - a[0].startTime;});
        var keptTrips = [];
        var bestArrivalSoFar = 9999999999999;
        for (var tt=0; tt < allSpecificTrips.length; tt++) {
            var trip = allSpecificTrips[tt];
            var arrivalTime = trip[trip.length-1].endTime;
            if (arrivalTime < bestArrivalSoFar + self.maxDumbMinutes*60*1000) {
                keptTrips.push(trip);
                logBoring('| trip: '+epochTimeToHumanTime(trip[0].startTime)+' - '+epochTimeToHumanTime(arrivalTime)+' (best so far: '+epochTimeToHumanTime(bestArrivalSoFar)+').  kept.');
            } else {
                logBoring('| trip: '+epochTimeToHumanTime(trip[0].startTime)+' - '+epochTimeToHumanTime(arrivalTime)+' (best so far: '+epochTimeToHumanTime(bestArrivalSoFar)+').  discarded.');
            }
            if (arrivalTime < bestArrivalSoFar) {
                bestArrivalSoFar = arrivalTime;
            }
        }
        allSpecificTrips = keptTrips;

        // sort by endTime of last leg
        allSpecificTrips.sort(function(a,b) {return a[a.length-1].endTime - b[b.length-1].endTime});

        var calculationEndTime = (new Date).getTime();
        logDetails('made '+allSpecificTrips.length+' specific trips in '+(calculationEndTime-calculationBeginTime)+' ms.');
        self.lastCalculationMs = calculationEndTime - calculationBeginTime;
        return allSpecificTrips;

    }; // end of getTrips()

    return self;
};

