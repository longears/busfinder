

module.exports = {

    maxTransitLegs: 2, // don't allow trips to have more than this many transit legs (not counting walking legs)
    maxDumbMinutes: 9, // if a trip is more than X minutes suboptimal compared to another trip, discard it
    maxPastLeaveMinutes: 3, // if you should have left X minutes ago, ignore

    locations: {
        a4n: {
            short: 'A4n',
            long: 'A4n',
            color: '#555',
            show: true,
        },
        a4noutside: {
            short: 'A4n out',
            long: 'A4n (outside)',
            color: '#555',
            show: false,
        },
        bart19th: {
            short: '19th',
            long: '19th St Bart',
            color: '#55c',
            show: true,
        },
        bartembr: {
            short: 'Embr',
            long: 'Embarcadero Bart',
            color: '#229',
            show: false,
        },
        bartembroutside: {
            short: 'Embr',
            long: 'Embarcadero Bart (outside)',
            color: '#22a',
            show: true,
        },
        bellevuegrand: {
            short: 'Bellev+Grand',
            long: 'Bellevue & Grand',
            color: '#555',
            show: false,
        },
        explo: {
            short: 'Explo',
            long: 'Exploratorium',
            color: '#555',
            show: true,
        },
        ferry: {
            short: 'Ferry',
            long: 'Ferry Building',
            color: '#555',
            show: true,
        },
        home: {
            short: 'Home',
            long: 'Home',
            color: '#555',
            show: true,
        },
        loscantaros: {
            short: 'Los C.',
            long: 'Los Cantaros',
            color: '#962',
            show: true,
        },
        saloon: {
            short: 'Saloon',
            long: 'Heart & Dagger Saloon',
            color: '#822',
            show: true,
        },
        saloonish: {
            short: 'Saloonish',
            long: 'Saloonish',
            color: '#822',
            show: false,
        },
        transbay: {
            short: 'Transbay',
            long: 'Transbay Terminal',
            color: '#f90',
            show: true,
        },
    },

    legs: [
        // These are the possible legs that a trip can have.
        //
        // Each of these has a "spec", which specifies a particular bus stop.
        // A spec looks like this: "actransit-12-1011830"
        // It has three parts: agency, route, and stop number.
        //
        // Walking is a special case and should be entered "walk-x-x".
        //
        // To get AC Transit stop numbers:
        //      1. Go to nextbus.com
        //      2. Choose the route, direction, and stop you want
        //      3. Look at the URL and extract this number:
        //          http://www.nextbus.com/#!/actransit/NL/NL_147_1/1011830/1001340
        //                                                          ^^^^^^^
        //      4. Do this for each route at the same stop because sometimes the
        //         stop numbers are different.  For example, the Transbay Terminal
        //         is actually many smaller stops with different stop numbers.
        //
        // BART stop and route abbreviations are here:
        //     http://api.bart.gov/docs/overview/abbrev.aspx
        // BART uses the same abbreviations for both stops and routes, so for example
        //     "bart-SFO-19TH"
        // is the SFO-bound train stopping at 19th street.

        // walking in the east bay
        {
            spec: 'walk-x-x',
            from: 'home',
            to: 'bellevuegrand',
            duration: 2,
        },
        {
            spec: 'walk-x-x',
            from: 'bellevuegrand',
            to: 'saloonish',
            duration: 5,
        },
        {
            spec: 'walk-x-x',
            from: 'saloonish',
            to: 'saloon',
            duration: 4,
        },
        {
            spec: 'walk-x-x',
            from: 'bellevuegrand',
            to: 'loscantaros',
            duration: 5
        },
        {
            spec: 'walk-x-x',
            from: 'loscantaros',
            to: 'bart19th',
            duration: 20
        },

        // walking in SF
        {
            spec: 'walk-x-x',
            to: 'explo',
            from: 'ferry',
            duration: 11
        },
        {
            spec: 'walk-x-x',
            from: 'ferry',
            to: 'bartembroutside',
            duration: 5
        },
        {
            spec: 'walk-x-x',
            from: 'bartembroutside',
            to: 'a4noutside',
            duration: 6
        },
        {
            spec: 'walk-x-x',
            from: 'a4noutside',
            to: 'transbay',
            duration: 2.5
        },


        // inside-outside walking
        {
            spec: 'walk-x-x',
            from: 'bartembr',
            to: 'bartembroutside',
            duration: 4
        },
        {
            spec: 'walk-x-x',
            from: 'a4noutside',
            to: 'a4n',
            duration: 2
        },

        // morning bus to bart
        // 12 to 19th st bart: 11 min; grand and staten (1011860) or los cantaros
        // 58L to 19th st bart:  9 min; grand and perkins (los cantaros) (not weekends)
        {
            spec: 'actransit-12-1011830',
            from: 'loscantaros',
            to: 'bart19th',
            duration: 11,
        },
        // evening bus from bart
        {
            spec: 'actransit-12-1006450',
            from: 'bart19th',
            to: 'loscantaros',
            duration: 11,
        },

        // morning bart
        {
            spec: 'bart-MLBR-19TH',
            from: 'bart19th',
            to: 'bartembr',
            duration: 12,
        },
        {
            spec: 'bart-SFIA-19TH',
            from: 'bart19th',
            to: 'bartembr',
            duration: 12,
        },
        {
            spec: 'bart-DALY-19TH',
            from: 'bart19th',
            to: 'bartembr',
            duration: 12,
        },
        // evening bart
        {
            spec: 'bart-RICH-EMBR',
            from: 'bartembr',
            to: 'bart19th',
            duration: 12,
        },
        {
            spec: 'bart-PITT-EMBR',
            from: 'bartembr',
            to: 'bart19th',
            duration: 12,
        },
    
        // morning transbay
        {
            spec: 'actransit-B-9902310',
            from: 'saloon',
            to: 'transbay',
            duration: 20,
        },
        {
            spec: 'actransit-NL-9902310',
            from: 'saloon',
            to: 'transbay',
            duration: 31,
        },
        {
            spec: 'actransit-NX-9902310',
            from: 'saloon',
            to: 'transbay',
            duration: 20,
        },
        {
            spec: 'actransit-NL-1011830',
            from: 'loscantaros',
            to: 'transbay',
            duration: 28,
        },
        // evening transbay
        {
            spec: 'actransit-B-1410350',
            from: 'transbay',
            to: 'saloon',
            duration: 28.5,
        },
        {
            spec: 'actransit-NL-1410340',
            from: 'transbay',
            to: 'loscantaros',
            duration: 29,
        },
        {
            spec: 'actransit-NX1-1410350',
            from: 'transbay',
            to: 'saloon',
            duration: 28.5,
        },
    ],

};
