
var request = require('superagent');
var moment = require('moment');

var spec = require('./spec.js');

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

    self.locations = {}; // map from name -> displayName
    self.legs = []; // list of all possible legs
    self.routeColors = {}; // map from spec.agencyRouteHash -> color
    self.maxTransitLegs = 2;
    self.maxDumbMinutes = 9; // if a trip is more than X minutes suboptimal compared to another trip, discard it
    self.maxPastLeaveMinutes = 3; // if you should have left X minutes ago, ignore

    self.addLeg = function(leg) {
        // add a leg to the config
        // if it's "walk-x-x", add the reverse leg as well.
        // TODO: check if it exists already

        for (var ll=0; ll < self.legs.length; ll++) {
            existingLeg = self.legs[ll];
            if (   leg.spec.hash() === existingLeg.spec.hash()
                && leg.from == existingLeg.from
                && leg.to == existingLeg.to) {
                console.log('ERROR: duplicate leg');
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
            console.log('ERROR: unknown location: '+leg.from);
            throw 'unknown location: '+leg.from;
        }
        if (self.locations[leg.to] === undefined) {
            console.log('ERROR: unknown location: '+leg.to);
            throw 'unknown location: '+leg.to;
        }
    };

    //======================================================================
    // state

    // public (read-only)
    self.pendingRequests = 0;  // don't set this from the outside, but you can read it
    self.lastCalculationMs = 0;

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

    self._generateDot = function() {
        // output edges
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
        console.log('    parsing '+thisSpec.hash());
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
        console.log('    parsing '+thisSpec.hash());
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
        console.log('-----------------------------------------\\');
        console.log('fetching predictions...');
        var specHashes = self._uniqueSpecHashes();
        self.pendingRequests = 0;
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
                console.log('  about to get '+url);
                request
                    .get(url)
                    .end(function(res) {
                        console.log('    got '+url);
                        self._predictions[thisSpecHash] = parseFn(thisSpec, res.text);

                        // if all the ajax calls are done, run the callback.
                        self.pendingRequests -= 1;
                        if (self.pendingRequests === 0) {
                            console.log('    ...done fetching');
                            console.log('-----------------------------------------/');
                            callback();
                        } else {
                            console.log('      '+self.pendingRequests+' still pending');
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
        // given a from and to location, return a list of trips using live predictions.
        // each trip is a list of legs with startTime and endTime set.
        var calculationBeginTime = (new Date).getTime();

        console.log('==================== get trips from '+from+' to '+to+' ====================');

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
            console.log('\n========== possible trip with '+possibleTrip.length+' legs');

            // ignore empty trips
            if (possibleTrip.length === 0) {
                console.log('SKIPPING empty trip');
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
            console.log('+ finding first walk and transit legs');
            console.log('| first walk leg:', '\n|   '+self._legToString(firstWalkLeg));
            console.log('| first transit leg:', '\n|   '+self._legToString(firstTransitLeg));
            console.log('| remaining legs:', '\n'+legsToString(remainingLegs, '|   '));
            console.log();

            // if the trip is just a single walk leg:
            if (firstTransitLeg === undefined && firstWalkLeg !== undefined) {
                console.log('this possibleTrip is just a single walk leg');
                specificTrips.push(clone(firstWalkLeg));
                specificTrips[0].startTime = now;
                specificTrips[0].endTime = now + specificTrips[0].duration * 60 * 1000;

            } else { // the trip includes at least one transit leg
                // if the first transit leg has no predictions, bail on the entire POSSIBLE trip
                firstTransitLegStartTimes = self._predictions[firstTransitLeg.spec.hash()].startTimes;
                if (firstTransitLegStartTimes.length === 0) {
                    console.log('SKIPPING this possible trip: first transit leg has no start times (bus is not running right now)');
                    continue;
                }
                // for each start time of the first transit leg:
                console.log('+ stepping through prediction times from the first transit leg');
                for (var st=0; st < firstTransitLegStartTimes.length; st++) {
                    var virtualClock = firstTransitLegStartTimes[st];
                    var thisSpecificTripFailed = false;
                    console.log('| first transit leg predicted departure at', epochTimeToHumanTime(virtualClock));
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
                            console.log('SKIPPING this specific trip: you already missed it');
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
                                console.log('|   BAILED: no bus available for a later transit leg');
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
                        console.log('|   made a trip with '+thisSpecificTrip.length+' legs');
                        specificTrips.push(thisSpecificTrip);
                    }

                } // end of "for each start time of the first transit leg"
            } // end of "else the trip contains at least one transit leg"

            // TODO: clean up specificTrips to remove trips that will get us there at the same time

            // save the specificTrips we just made out of this possibleTrip
            allSpecificTrips = allSpecificTrips.concat(specificTrips);

            // print out the specific trips we just made out of this possibleTrip
            console.log();
            console.log('+ generated '+specificTrips.length+' specific trips:');
            specificTrips.map(function(st) {
                var duration = (st[st.length-1].endTime - st[0].startTime) / 1000 / 60;
                console.log('| '+Math.round(duration)+' minutes:');
                console.log(legsToString(st,'|   '));
            });

        } // end of for each possible trip

        // remove pointlessly slow trips
        // sort by startTime in reverse (latest-leaving trips first)
        allSpecificTrips.sort(function(a,b) {return b[0].startTime - a[0].startTime});
        var keptTrips = [];
        var bestArrivalSoFar = 9999999999999;
        for (var tt=0; tt < allSpecificTrips.length; tt++) {
            var trip = allSpecificTrips[tt];
            var arrivalTime = trip[trip.length-1].endTime;
            if (arrivalTime < bestArrivalSoFar + self.maxDumbMinutes*60*1000) {
                keptTrips.push(trip);
                console.log('this trip: '+epochTimeToHumanTime(trip[0].startTime)+' - '+epochTimeToHumanTime(arrivalTime)+' (best so far: '+epochTimeToHumanTime(bestArrivalSoFar)+').  kept.');
            } else {
                console.log('this trip: '+epochTimeToHumanTime(trip[0].startTime)+' - '+epochTimeToHumanTime(arrivalTime)+' (best so far: '+epochTimeToHumanTime(bestArrivalSoFar)+').  discarded.');
            }
            if (arrivalTime < bestArrivalSoFar) {
                bestArrivalSoFar = arrivalTime;
            }
        }
        allSpecificTrips = keptTrips;

        // sort by endTime of last leg
        allSpecificTrips.sort(function(a,b) {return a[a.length-1].endTime - b[b.length-1].endTime});

        var calculationEndTime = (new Date).getTime();
        console.log('made '+allSpecificTrips.length+' specific trips in '+(calculationEndTime-calculationBeginTime)+' ms.');
        self.lastCalculationMs = calculationEndTime - calculationBeginTime;
        return allSpecificTrips;

    }; // end of getTrips()

    return self;
};

