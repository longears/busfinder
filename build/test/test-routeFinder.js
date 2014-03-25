
var nodeunit = require('nodeunit');
var moment = require('moment');
var fs = require('fs');

var spec = require('../spec.js');
var routeFinder = require('../routeFinder.js');

exports.test1 = nodeunit.testCase({
    setUp: function(cb) {
        this.rf = routeFinder();
        this.rf.locations = {
            howardandspear: 'Howard and Spear',
            howardandspearoutside: 'Howard and Spear (outside)',
            bart19th: '19th St Bart',
            bartembr: 'Embarcadero Bart',
            bartembroutside: 'Embarcadero Bart (outside)',
            explo: 'Exploratorium',
            ferry: 'Ferry Building',
            home: 'Home',
            loscantaros: 'Los Cantaros',
            saloon: 'Heart & Dagger Saloon',
            transbay: 'Transbay Terminal',
        };

        // LEGS
        // walking in the east bay
        // these will be automatically added in the reverse direction also
        this.rf.addLeg({
            spec: spec('walk', 'x', 'x'),
            from: 'home',
            to: 'saloon',
            duration: 11
        });
        this.rf.addLeg({
            spec: spec('walk', 'x', 'x'),
            from: 'home',
            to: 'loscantaros',
            duration: 6
        });
        this.rf.addLeg({
            spec: spec('walk', 'x', 'x'),
            from: 'loscantaros',
            to: 'bart19th',
            duration: 20
        });

        // walking in SF
        this.rf.addLeg({
                spec: spec('walk', 'x', 'x'),
                to: 'explo',
                from: 'ferry',
                duration: 11
        });
        this.rf.addLeg({
                spec: spec('walk', 'x', 'x'),
                from: 'ferry',
                to: 'bartembroutside',
                duration: 5
        });
        this.rf.addLeg({
                spec: spec('walk', 'x', 'x'),
                from: 'bartembroutside',
                to: 'howardandspearoutside',
                duration: 6
        });
        this.rf.addLeg({
                spec: spec('walk', 'x', 'x'),
                from: 'howardandspearoutside',
                to: 'transbay',
                duration: 4
        });

        // inside-outside walking
        this.rf.addLeg({
                spec: spec('walk', 'x', 'x'),
                from: 'bartembr',
                to: 'bartembroutside',
                duration: 4
        });
        this.rf.addLeg({
                spec: spec('walk', 'x', 'x'),
                from: 'howardandspearoutside',
                to: 'howardandspear',
                duration: 4
        });

        // morning bus to bart
        // 12 to 19th st bart: 11 min; grand and staten (1011860) or los cantaros
        // 58L to 19th st bart:  9 min; grand and perkins (los cantaros) (not weekends)
        this.rf.addLeg({
                spec: spec('actransit', '12', '1011830'),
                from: 'loscantaros',
                to: 'bart19th',
                duration: 11,
        });
        // evening bus from bart
        this.rf.addLeg({
                spec: spec('actransit', '12', '1006450'),
                from: 'bart19th',
                to: 'loscantaros',
                duration: 11,
        });

        // morning bart
        this.rf.addLeg({
                spec: spec('bart', 'MLBR', '19TH'),
                from: 'bart19th',
                to: 'bartembr',
                duration: 12,
        });
        this.rf.addLeg({
                spec: spec('bart', 'SFIA', '19TH'),
                from: 'bart19th',
                to: 'bartembr',
                duration: 12,
        });
        this.rf.addLeg({
                spec: spec('bart', 'DALY', '19TH'),
                from: 'bart19th',
                to: 'bartembr',
                duration: 12,
        });

        // evening bart
        this.rf.addLeg({
                spec: spec('bart', 'RICH', 'EMBR'),
                from: 'bartembr',
                to: 'bart19th',
                duration: 12,
        });
        this.rf.addLeg({
                spec: spec('bart', 'PITT', 'EMBR'),
                from: 'bartembr',
                to: 'bart19th',
                duration: 12,
        });
        
        // morning transbay
        this.rf.addLeg({
                spec: spec('actransit', 'B', '9902310'),
                from: 'saloon',
                to: 'transbay',
                duration: 23,
        });
        this.rf.addLeg({
                spec: spec('actransit', 'NL', '9902310'),
                from: 'saloon',
                to: 'transbay',
                duration: 31,
        });
        this.rf.addLeg({
                spec: spec('actransit', 'NX', '9902310'),
                from: 'saloon',
                to: 'transbay',
                duration: 27,
        });
        this.rf.addLeg({
                spec: spec('actransit', 'NL', '1011830'),
                from: 'loscantaros',
                to: 'transbay',
                duration: 28,
        });
        // evening transbay
        this.rf.addLeg({
                spec: spec('actransit', 'B', '1410350'),
                from: 'transbay',
                to: 'saloon',
                duration: 30,
        });
        this.rf.addLeg({
                spec: spec('actransit', 'NL', '1410340'),
                from: 'transbay',
                to: 'loscantaros',
                duration: 33,
        });
        this.rf.addLeg({
                spec: spec('actransit', 'NX1', '1410350'),
                from: 'transbay',
                to: 'saloon',
                duration: 21,
        });

        this.rf.routeColors = {
            'actransit-NL': '#f99'
        };
        cb();
    },

    '_getLegsFrom': function(test) {
        test.equal(this.rf._getLegsFrom('home').length, 2);
        test.equal(this.rf._getLegsFrom('xxx').length, 0);
        test.done();
    },

    '_getLegsTo': function(test) {
        test.equal(this.rf._getLegsTo('home').length, 2);
        test.equal(this.rf._getLegsTo('xxx').length, 0);
        test.done();
    },

    '_getLegsFromTo': function(test) {
        test.equal(this.rf._getLegsFromTo('home','saloon').length, 1);
        test.equal(this.rf._getLegsFromTo('xxx','yyy').length, 0);
        test.done();
    },

    '_enumerateTrips': function(test) {
        var trips = this.rf._enumerateTrips('loscantaros','transbay');
        //console.log('');
        //for (var tt=0; tt < trips.length; tt++) {
        //    var trip = trips[tt];
        //    console.log('trip:');
        //    for (var ll=0; ll < trip.length; ll++) {
        //        var leg = trip[ll];
        //        console.log('    '+leg.from+' --> '+leg.to+' via '+leg.spec.hash()+' ('+leg.duration+' minutes)');
        //    }
        //}
        //console.log('');
        test.done();
    },

    '_uniqueSpecHashes': function(test) {
        test.deepEqual(
            this.rf._uniqueSpecHashes(),
            [
                'actransit-12-1006450',
                'actransit-12-1011830',
                'actransit-B-1410350',
                'actransit-B-9902310',
                'actransit-NL-1011830',
                'actransit-NL-1410340',
                'actransit-NL-9902310',
                'actransit-NX-9902310',
                'actransit-NX1-1410350',
                'bart-DALY-19TH',
                'bart-MLBR-19TH',
                'bart-PITT-EMBR',
                'bart-RICH-EMBR',
                'bart-SFIA-19TH',
                'walk-x-x',
            ]
        );
        test.done();
    },

    //'updatePredictions': function(test) {
    //    var that = this;
    //    this.rf.updatePredictions(function() {
    //        console.log('=== PREDICTIONS ===\\');
    //        for (var hash in that.rf._predictions) {
    //            console.log(hash + ':  ' + that.rf._predictions[hash].startTimes.map(function(st) {return moment(st).format('hh:mm a')}).join(', '));
    //        }
    //        console.log('===================/');
    //        test.done()
    //    });
    //},

    'getTrips returns legs that have startTimes': function(test) {
        var that = this;
        this.rf.updatePredictions(function() {
            var trips = that.rf.getTrips('howardandspear', 'home');
            test.ok(trips instanceof Array);
            if (trips.length > 0) { // hack
                test.ok(trips[0][0].startTime !== undefined);
            }

            // print out results
            console.log('///////////////////////////////////////');
            console.log('// TRIPS');
            var now = (new Date).getTime();
            trips.map(function(trip) {
                var duration = Math.round((trip[trip.length-1].endTime - trip[0].startTime) / 60 / 1000);
                var startTimeHuman = moment(trip[0].startTime).format('hh:mm a');
                var endTimeHuman = moment(trip[trip.length-1].endTime).format('hh:mm a');
                var minutesUntilLeave = Math.round((trip[0].startTime - now) / 60 / 1000);
                console.log('leave in '+minutesUntilLeave+' minutes, arrive at '+endTimeHuman+' ('+duration+' minutes total)');
                trip.map(function(leg) {
                    var thisTimeHuman = moment(leg.startTime).format('hh:mm a');
                    console.log('    '+that.rf._legToString(leg));
                });
                console.log();
            });
            console.log('///////////////////////////////////////');


            test.done();
        });
    },

    '_generateDot': function(test) {
        var dot = this.rf._generateDot();
        fs.writeFile('graph.dot', dot);
        test.done();
    },
});
