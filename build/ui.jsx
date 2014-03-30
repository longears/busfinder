/** @jsx React.DOM */

var React = require('react');
var moment = require('moment');

var spec = require('./spec.js');
var routeFinder = require('./routeFinder.js');

var logcolors = require('./logcolors.js')

var log = logcolors.makelog('red');

//--------------------------------------------------------------------------------
// CONFIG

// repeating intervals
var PREDICTION_UPDATE = 20;   // fetch new predictions (triggers trip and ui updates when complete)
var TRIP_UPDATE = 10;         // calculate new trips (triggers ui update)
var UI_UPDATE = 2;            // redraw ui

// one-time timeouts (after page load)
var INITIAL_TRIP_UPDATE = 1.2;  // after X seconds, calculate the first batch of trips (maybe not all predictions are fetched yet);

var MAX_LOADING_TIME = 15; // after X seconds, show warning that loading is taking too long

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

// from http://www.quirksmode.org/js/cookies.html
var createCookie = function(name,value,days) {
    if (days) {
        var date = new Date();
        date.setTime(date.getTime()+(days*24*60*60*1000));
        var expires = "; expires="+date.toGMTString();
    }
    else {
        var expires = "";
    }
    document.cookie = name+"="+value+expires+"; path=/";
};

var readCookie = function(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for (var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') {
            c = c.substring(1,c.length);
        }
        if (c.indexOf(nameEQ) == 0) {
            return c.substring(nameEQ.length,c.length);
        }
    }
    return null;
};

var eraseCookie = function(name) {
    createCookie(name,"",-1);
};

//--------------------------------------------------------------------------------
// CLASSES

var LoadingIndicatorBar = React.createClass({
    // props:
    //      loadingState
    //      loadingStartedTime
    //      loadingFinishedTime
    render: function() {
        var now = (new Date).getTime();
        var myClassName = 'loadingIndicatorBar';
        if (this.props.loadingState === 'error') {
            // last load failed.  not currently loading.
            myClassName += ' loadingStale';
        } else if (this.props.loadingState === 'loading') {
            if (this.props.loadingStartedTime < now - MAX_LOADING_TIME*1000 && this.props.loadingStartedTime !== 0) {
                // has been loading for too long
                myClassName += ' loadingStale';
            } else {
                // normal loading is in progress
                myClassName += ' loadingNow';
            }
        } else if (this.props.loadingState === 'loaded') {
            if (this.props.loadingFinishedTime < now - (PREDICTION_UPDATE+6)*1000 && this.props.loadingFinishedTime !== 0) {
                // not loading, but it's been too long since loading finished
                myClassName += ' loadingStale';
            } else {
                // we are good
            }
        }
        return <div className={myClassName}></div>;
    }
});

var HeaderBar = React.createClass({
    // props:
    //      locations
    //      from
    //      to
    //      handleChangeTo
    //      handleChangeFrom
    //      handleRefetch
    handleChangeFrom: function(event) {
        this.props.handleChangeFrom(event.target.value);
    },
    handleChangeTo: function(event) {
        this.props.handleChangeTo(event.target.value);
    },
    render: function() {
        var now = (new Date).getTime();
        var fromElems = [];
        var toElems = [];
        var pendingElem;
        for (var location in this.props.locations) {
            fromElems.push(<option className="locationDropdownOption" value={location}>{this.props.locations[location].short}</option>);
            toElems.push(<option className="locationDropdownOption" value={location}>{this.props.locations[location].short}</option>);
        }
        var nbsp = " ";
        return <div className="headerBar">
            <form>
                <div className="headerCell">
                    <div className="headerCellSmallText">leave</div>
                    <div className="headerCellLargeText">{this.props.locations[this.props.from].short}</div>
                    <div className="locationDropdownParent">
                        <select className="locationDropdown" name="leave" value={this.props.from} onChange={this.handleChangeFrom}>
                            {fromElems}
                        </select>
                    </div>
                </div>
                <div className="headerCell">
                    <div className="headerCellSmallText">arrive</div>
                    <div className="headerCellLargeText">{this.props.locations[this.props.to].short}</div>
                    <div className="locationDropdownParent">
                        <select className="locationDropdown" name="arrive" value={this.props.to} onChange={this.handleChangeTo}>
                            {toElems}
                        </select>
                    </div>
                </div>
                <a className="headerCellRight" href="#" onClick={this.props.handleRefetch}>
                    <div className="headerCellSmallText faint">now</div>
                    <div className="headerCellLargeText faint">{moment().format('h:mm')}</div>
                </a>
            </form>
        </div>;
    }
});

var TripRow = React.createClass({
    // props:
    //      from
    //      to
    //      trip
    //      locations
    render: function() {
        var now = (new Date).getTime();
        var legs = this.props.trip;
        var legsToShow = [];
        var legElems = [];
        // figure out which legs to show (skip first and last legs if walking)
        // but if there's only one leg and it's walking, keep it
        if (legs.length === 1 && legs[0].spec.agency === 'walk') {
            legsToShow.push(legs[0]);
        } else {
            for (var ll=0; ll < legs.length; ll++) {
                var leg = legs[ll];
                if (ll === 0 || ll === legs.length-1) {
                    if (leg.spec.agency === 'walk') {
                        continue;
                    }
                }
                legsToShow.push(leg);
            }
        }
        // generate leg elems
        for (var ll=0; ll < legsToShow.length; ll++) {
            var leg = legsToShow[ll];
            // how to show the agency and route?
            var routeText = '';
            if (leg.spec.agency === 'walk') {
                routeText = 'Walk';
            } else if (leg.spec.agency === 'bart') {
                routeText = 'BART';
            } else {
                routeText = leg.spec.route;
            }
            // add commas between legs but not after last one
            if (ll < (legsToShow.length-1)) {
                routeText += ',';
            }
            // make loaction tag.  don't show location if it's the same as our starting point and we're walking
            var locationDetails = this.props.locations[leg.from];
            var locationElem = <div className="tripLocation" style={{background: locationDetails.color}}>{locationDetails.short}</div>
            if (leg.from === this.props.from && leg.spec.agency === 'walk') {
                locationElem = undefined;
            }
            // build leg element
            legElems.push(
                <div className="tripLegLocationAndRoute">
                    {locationElem}
                    <div className="tripRoute">{routeText}</div>
                </div>
            );
        }
        var tripStartAbs = moment(legs[0].startTime).format('h:mm');
        var tripStartRel = Math.round((legs[0].startTime - now) / 60 / 1000) + ' m';
        var tripEndAbs = moment(legs[legs.length-1].endTime).format('h:mm');
        var tripDuration = Math.round((legs[legs.length-1].endTime - legs[0].startTime) / 60 / 1000) + ' m';
        return (
            <div className="tripRow">
                <div className="tripCell tripTimeCell">
                    <div className="tripTimeCellBigText">{tripStartAbs}</div>
                    <div className="tripTimeCellSmallText">{tripStartRel}</div>
                </div>
                <div className="tripCell tripTimeCell">
                    <div className="tripTimeCellBigText">{tripEndAbs}</div>
                    <div className="tripTimeCellSmallText">{tripDuration}</div>
                </div>
                <div className="tripCell tripLegsCell">{legElems}</div>
            </div>
        );
    }
});

var OverallInterface = React.createClass({
    mixins: [SetIntervalMixin],
    // props:
    //      locations
    //      routeColors
    //      legs
    getInitialState: function() {
        // build routeFinder
        log('getInitialState');
        var rf = routeFinder();
        rf.locations = this.props.locations;
        rf.routeColors = this.props.routeColors;
        for (var ll=0; ll < this.props.legs.length; ll++) {
            var leg = this.props.legs[ll];
            rf.addLeg(leg);
        }

        var from = 'home';
        var to = 'explo';
        console.log(readCookie('from'));
        console.log(readCookie('to'));
        if (readCookie('from')) {from = readCookie('from');}
        if (readCookie('to')) {to = readCookie('to');}

        return {
            routeFinder: rf,
            trips: [],
            from: from,
            to: to,
            loadingState: 'loading',  // loading, loaded, error
            loadingStartedTime: 0,  // time of starting most recent load
            loadingFinishedTime: 0, // time of completion of last successful load
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
        setTimeout(function() {
            that.calculateTrips();
        }, INITIAL_TRIP_UPDATE * 1000 * 2);
    },
    fetchPredictions: function() {
        log('fetching predictions');
        var that = this;
        this.setState({
            loadingState: 'loading',
            loadingStartedTime: (new Date).getTime(),
        });
        this.state.routeFinder.updatePredictions(function(error) {
            log('done fetching predictions');
            if (error) {
                that.setState({
                    loadingState: 'error',
                });
            } else {
                that.setState({
                    loadingState: 'loaded',
                    loadingFinishedTime: (new Date).getTime(),
                });
            }
            that.calculateTrips(); // also calls render
        });
    },
    calculateTrips: function() {
        var trips = this.state.routeFinder.getTrips(this.state.from, this.state.to);
        log('calculated '+trips.length+' trips from '+this.state.from+' -> '+this.state.to);
        this.setState({trips: trips}); // this triggers a render
    },
    handleChangeFrom: function(from) {
        this.setState({from: from});
        this.state.from = from; // why is this hack needed?
        this.calculateTrips();
        createCookie('from', from, 30);
    },
    handleChangeTo: function(to) {
        this.setState({to: to});
        this.state.to = to; // why is this hack needed?
        this.calculateTrips();
        createCookie('to', to, 30);
    },
    handleRefetch: function() {
        this.fetchPredictions(); // foo
    },
    render: function() {
        log('render');
        var now = (new Date).getTime();
        var that=this;
        var tripRows = this.state.trips.map(function(trip) {
            return <TripRow
                        trip={trip}
                        locations={that.state.routeFinder.locations}
                        from={that.state.from}
                        to={that.state.to}
                    />;
        });
        return <div>
            <HeaderBar
                locations={this.state.routeFinder.locations}
                from={this.state.from}
                to={this.state.to}
                handleChangeFrom={this.handleChangeFrom}
                handleChangeTo={this.handleChangeTo}
                handleRefetch={this.handleRefetch}
            />
            <LoadingIndicatorBar
                loadingState={this.state.loadingState}
                loadingStartedTime={this.state.loadingStartedTime}
                loadingFinishedTime={this.state.loadingFinishedTime}
            />
            <div className="tripRows">
                {tripRows}
            </div>
            <div className="details">
                {this.state.routeFinder.pendingRequests} requests pending.
                <br/>
                {Object.keys(this.state.routeFinder._predictions).length} specs fetched.
                <br/>
                Calculation time = {this.state.routeFinder.lastCalculationMs} ms.
                <br/>
                Last fetched {Math.round((now-this.state.routeFinder.lastFetchTime)/1000)} seconds ago.
            </div>
        </div>;
    },
});

//--------------------------------------------------------------------------------
// MAIN

React.renderComponent(
    <OverallInterface
        locations={{
            work: {
                short: 'Work',
                long: 'Work',
                color: '#555',
            },
            workoutside: {
                short: 'Work out',
                long: 'Work (outside)',
                color: '#555',
            },
            bart19th: {
                short: '19th',
                long: '19th St Bart',
                color: '#55c',
            },
            bartembr: {
                short: 'Embr',
                long: 'Embarcadero Bart',
                color: '#229',
            },
            bartembroutside: {
                short: 'Embr out',
                long: 'Embarcadero Bart (outside)',
                color: '#22a',
            },
            explo: {
                short: 'Explo',
                long: 'Exploratorium',
                color: '#555',
            },
            ferry: {
                short: 'Ferry',
                long: 'Ferry Building',
                color: '#555',
            },
            home: {
                short: 'Home',
                long: 'Home',
                color: '#555',
            },
            loscantaros: {
                short: 'Los C.',
                long: 'Los Cantaros',
                color: '#962',
            },
            saloon: {
                short: 'Saloon',
                long: 'Heart & Dagger Saloon',
                color: '#822',
            },
            transbay: {
                short: 'Transbay',
                long: 'Transbay Terminal',
                color: '#f90',
            },
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
                to: 'workoutside',
                duration: 6
            },
            {
                spec: spec('walk', 'x', 'x'),
                from: 'workoutside',
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
                from: 'workoutside',
                to: 'work',
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

