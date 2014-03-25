
module.exports = function(agency, route, stop) {
    var self = {};

    var sep = '-';

    if (arguments.length == 1) {
            self.agency = agency.split(sep)[0];
            self.route = agency.split(sep)[1];
            self.stop = agency.split(sep)[2];
    } else {
        self.agency = agency;
        self.route = route;
        self.stop = stop;
    }

    self.hash = function() {
        return self.agency + sep + self.route + sep + self.stop;
    };
    self.agencyRouteHash = function() {
        return self.agency + sep + self.route;
    };

    return self;
};

