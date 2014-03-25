/** @jsx React.DOM */

var React = require('react');
var moment = require('moment');

var spec = require('./spec.js');
var routeFinder = require('./routeFinder.js');

//--------------------------------------------------------------------------------
// CONFIG

// repeating intervals
var PREDICTION_UPDATE = 20;   // fetch new predictions (triggers trip and ui updates when complete)
var TRIP_UPDATE = 5;          // calculate new trips (triggers ui update)
var UI_UPDATE = 2;            // redraw ui

// one-time timeouts (after page load)
var INITIAL_TRIP_UPDATE = 2;  // after 2 seconds, calculate the first batch of trips (maybe not all predictions are fetched yet);

//--------------------------------------------------------------------------------
// UTILS

var SetIntervalMixin = {
    componentWillMount: function() {
        this.intervals = [];
    },
    setInterval: function() {
        this.intervals.push(setInterval.apply(null, arguments));
    },
    componentWillUnmount: function() {
        this.intervals.map(clearInterval);
    }
};

//--------------------------------------------------------------------------------
// CLASSES

var OverallInterface = React.createClass({
    mixins: [SetIntervalMixin],
    // props:
    //      locations
    //      routeColors
    //      legs
    getInitialState: function() {
        // build routeFinder
        console.log('getInitialState');
        var rf = routeFinder();
        rf.locations = this.props.locations;
        rf.routeColors = this.props.routeColors;
        for (var ll=0; ll < this.props.legs.length; ll++) {
            var leg = this.props.legs[ll];
            rf.addLeg(leg);
        }

        return {
            routeFinder: rf,
            trips: [],
            from: 'home',
            to: 'explo',
        };
    },
    componentDidMount: function() {
        var that = this;
        this.setInterval(this.fetchPredictions, PREDICTION_UPDATE * 1000);
        this.setInterval(this.calculateTrips, TRIP_UPDATE * 1000);
        this.setInterval(function() {that.forceUpdate()}, UI_UPDATE * 1000);
        this.fetchPredictions(); // when done, calls calculateTrips and then render
        setTimeout(function() {
            that.calculateTrips();
        }, INITIAL_TRIP_UPDATE * 1000);
    },
    fetchPredictions: function() {
        console.log('fetching predictions');
        var that = this;
        this.state.routeFinder.updatePredictions(function() {
            console.log('done fetching predictions');
            that.calculateTrips(); // also calls render
        });
    },
    calculateTrips: function() {
        console.log('calculating trips');
        this.setState({trips: this.state.routeFinder.getTrips('home','explo')}); // this triggers a render
    },
    render: function() {
        console.log('render');
        var tripElems = this.state.trips.map(function(trip) {
            var tripStart = moment(trip[0].startTime).format('h:mm a');
            var tripEnd = moment(trip[trip.length-1].endTime).format('h:mm a');
            var legElems = trip.map(function(leg) {
                var legStart = moment(leg.startTime).format('h:mm a');
                var legEnd = moment(leg.endTime).format('h:mm a');
                return <div>
                    {legStart} - {legEnd} on {leg.spec.agency} {leg.spec.route} for {leg.duration} minutes
                </div>;
            });
            return <div>
                <div><b>trip from {tripStart} - {tripEnd}</b></div>
                <div>{legElems}</div>
                <hr/>
            </div>;
        });
        return <div>
            <div>
                <b>From {this.state.from} to {this.state.to}</b>
            </div>
            <div>
                {tripElems}
            </div>
            <div>
                <i>
                    {this.state.routeFinder.pendingRequests} requests pending.
                    {Object.keys(this.state.routeFinder._predictions).length} predictions.
                    Calculation time = {this.state.routeFinder.lastCalculationMs} ms.
                </i>
            </div>
        </div>;
    },
});

//--------------------------------------------------------------------------------
// MAIN

React.renderComponent(
    <OverallInterface
        locations={{
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
        }}
        routeColors={{
            'actransit-NL': '#f99',
        }}
        legs = {[
            // walking in the east bay
            {
                spec: spec('walk', 'x', 'x'),
                from: 'home',
                to: 'saloon',
                duration: 11,
            },
            {
                spec: spec('walk', 'x', 'x'),
                from: 'home',
                to: 'loscantaros',
                duration: 6
            },
            {
                spec: spec('walk', 'x', 'x'),
                from: 'loscantaros',
                to: 'bart19th',
                duration: 20
            },

            // walking in SF
            {
                spec: spec('walk', 'x', 'x'),
                to: 'explo',
                from: 'ferry',
                duration: 11
            },
            {
                spec: spec('walk', 'x', 'x'),
                from: 'ferry',
                to: 'bartembroutside',
                duration: 5
            },
            {
                spec: spec('walk', 'x', 'x'),
                from: 'bartembroutside',
                to: 'howardandspearoutside',
                duration: 6
            },
            {
                spec: spec('walk', 'x', 'x'),
                from: 'howardandspearoutside',
                to: 'transbay',
                duration: 4
            },


            // inside-outside walking
            {
                spec: spec('walk', 'x', 'x'),
                from: 'bartembr',
                to: 'bartembroutside',
                duration: 4
            },
            {
                spec: spec('walk', 'x', 'x'),
                from: 'howardandspearoutside',
                to: 'howardandspear',
                duration: 4
            },

            // morning bus to bart
            // 12 to 19th st bart: 11 min; grand and staten (1011860) or los cantaros
            // 58L to 19th st bart:  9 min; grand and perkins (los cantaros) (not weekends)
            {
                spec: spec('actransit', '12', '1011830'),
                from: 'loscantaros',
                to: 'bart19th',
                duration: 11,
            },
            // evening bus from bart
            {
                spec: spec('actransit', '12', '1006450'),
                from: 'bart19th',
                to: 'loscantaros',
                duration: 11,
            },

            // morning bart
            {
                spec: spec('bart', 'MLBR', '19TH'),
                from: 'bart19th',
                to: 'bartembr',
                duration: 12,
            },
            {
                spec: spec('bart', 'SFIA', '19TH'),
                from: 'bart19th',
                to: 'bartembr',
                duration: 12,
            },
            {
                spec: spec('bart', 'DALY', '19TH'),
                from: 'bart19th',
                to: 'bartembr',
                duration: 12,
            },
            // evening bart
            {
                spec: spec('bart', 'RICH', 'EMBR'),
                from: 'bartembr',
                to: 'bart19th',
                duration: 12,
            },
            {
                spec: spec('bart', 'PITT', 'EMBR'),
                from: 'bartembr',
                to: 'bart19th',
                duration: 12,
            },
        
            // morning transbay
            {
                spec: spec('actransit', 'B', '9902310'),
                from: 'saloon',
                to: 'transbay',
                duration: 23,
            },
            {
                spec: spec('actransit', 'NL', '9902310'),
                from: 'saloon',
                to: 'transbay',
                duration: 31,
            },
            {
                spec: spec('actransit', 'NX', '9902310'),
                from: 'saloon',
                to: 'transbay',
                duration: 27,
            },
            {
                spec: spec('actransit', 'NL', '1011830'),
                from: 'loscantaros',
                to: 'transbay',
                duration: 28,
            },
            // evening transbay
            {
                spec: spec('actransit', 'B', '1410350'),
                from: 'transbay',
                to: 'saloon',
                duration: 30,
            },
            {
                spec: spec('actransit', 'NL', '1410340'),
                from: 'transbay',
                to: 'loscantaros',
                duration: 33,
            },
            {
                spec: spec('actransit', 'NX1', '1410350'),
                from: 'transbay',
                to: 'saloon',
                duration: 21,
            },

        ]}
    />,
    document.getElementById('slot')
);

