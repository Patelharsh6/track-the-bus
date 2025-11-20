class RouteEngine {
    constructor() {
        this.routes = new Map();
        this.stops = new Map();
        this.vehicleRouteMap = new Map();
        console.log('✅ Route Engine initialized');
    }

    loadInitialData() {
        // Major Ahmedabad Bus Routes with real stations
        this.addRoute({
            id: 'R1',
            name: 'Lal Darwaja - Gurukul',
            stops: [
                { id: 'S1', name: 'Lal Darwaja', lat: 23.026239, lon: 72.587448 },
                { id: 'S2', name: 'Khadia', lat: 23.030000, lon: 72.585000 },
                { id: 'S3', name: 'Gheekanta', lat: 23.032000, lon: 72.583000 },
                { id: 'S4', name: 'Income Tax', lat: 23.038396, lon: 72.561848 },
                { id: 'S5', name: 'Navrangpura', lat: 23.046896, lon: 72.556848 },
                { id: 'S6', name: 'Stadium', lat: 23.051396, lon: 72.551348 },
                { id: 'S7', name: 'University', lat: 23.056896, lon: 72.545848 },
                { id: 'S8', name: 'Commerce Six Roads', lat: 23.061396, lon: 72.540848 },
                { id: 'S9', name: 'Gurukul', lat: 23.066396, lon: 72.535848 }
            ],
            schedule: ['06:00', '07:00', '08:00', '09:00', '10:00', '16:00', '17:00', '18:00', '19:00', '20:00']
        });

        this.addRoute({
            id: 'R2',
            name: 'Bapunagar - Maninagar',
            stops: [
                { id: 'S10', name: 'Bapunagar', lat: 23.041896, lon: 72.631848 },
                { id: 'S11', name: 'Ramol', lat: 23.045000, lon: 72.628000 },
                { id: 'S12', name: 'Saraspur', lat: 23.051396, lon: 72.621848 },
                { id: 'S13', name: 'Naroda', lat: 23.054000, lon: 72.618000 },
                { id: 'S14', name: 'CTM Cross Road', lat: 23.056896, lon: 72.611848 },
                { id: 'S15', name: 'Amraiwadi', lat: 23.060000, lon: 72.605000 },
                { id: 'S16', name: 'Maninagar', lat: 23.066396, lon: 72.601848 }
            ],
            schedule: ['06:30', '07:30', '08:30', '09:30', '17:00', '18:00', '19:00', '20:00']
        });

        this.addRoute({
            id: 'R3',
            name: 'SG Highway - Gota',
            stops: [
                { id: 'S17', name: 'Prahlad Nagar', lat: 23.031396, lon: 72.511848 },
                { id: 'S18', name: 'Satellite', lat: 23.036896, lon: 72.521848 },
                { id: 'S19', name: 'Jodhpur Cross', lat: 23.041396, lon: 72.531848 },
                { id: 'S20', name: 'Shyamal Cross Road', lat: 23.046000, lon: 72.536000 },
                { id: 'S21', name: 'Vastrapur', lat: 23.051000, lon: 72.541000 },
                { id: 'S22', name: 'Gurudwara', lat: 23.056000, lon: 72.546000 },
                { id: 'S23', name: 'Thaltej', lat: 23.061000, lon: 72.551000 },
                { id: 'S24', name: 'Gota', lat: 23.091396, lon: 72.541848 }
            ],
            schedule: ['07:00', '08:00', '09:00', '10:00', '17:30', '18:30', '19:30', '20:30']
        });

        this.addRoute({
            id: 'R4',
            name: 'Isanpur - Narol',
            stops: [
                { id: 'S25', name: 'Isanpur', lat: 22.991396, lon: 72.601848 },
                { id: 'S26', name: 'Vatva', lat: 22.996000, lon: 72.596000 },
                { id: 'S27', name: 'Narol', lat: 23.001396, lon: 72.591848 },
                { id: 'S28', name: 'Aslali', lat: 23.006000, lon: 72.586000 },
                { id: 'S29', name: 'Juhapura', lat: 23.011000, lon: 72.581000 }
            ],
            schedule: ['06:00', '07:00', '08:00', '17:00', '18:00', '19:00']
        });

        this.addRoute({
            id: 'R5',
            name: 'Sabarmati - Gandhigram',
            stops: [
                { id: 'S30', name: 'Sabarmati', lat: 23.081396, lon: 72.581848 },
                { id: 'S31', name: 'Ranip', lat: 23.086000, lon: 72.576000 },
                { id: 'S32', name: 'Vadaj', lat: 23.091000, lon: 72.571000 },
                { id: 'S33', name: 'Usmanpura', lat: 23.051396, lon: 72.571848 },
                { id: 'S34', name: 'Paldi', lat: 23.041396, lon: 72.566848 },
                { id: 'S35', name: 'Gandhigram', lat: 23.031396, lon: 72.561848 }
            ],
            schedule: ['06:15', '07:15', '08:15', '17:15', '18:15', '19:15']
        });

        console.log(`✅ Loaded ${this.routes.size} routes with ${this.stops.size} stops`);
    }

    addRoute(route) {
        this.routes.set(route.id, route);
        
        // Add stops to global stops map
        route.stops.forEach(stop => {
            this.stops.set(stop.id, stop);
        });
    }

    getRoute(routeId) {
        return this.routes.get(routeId);
    }

    getAllRoutes() {
        return Array.from(this.routes.values());
    }

    getAllStops() {
        return Array.from(this.stops.values());
    }

    getStop(stopId) {
        return this.stops.get(stopId);
    }

    searchStops(query) {
        const searchTerm = query.toLowerCase();
        return Array.from(this.stops.values()).filter(stop =>
            stop.name.toLowerCase().includes(searchTerm)
        ).slice(0, 10);
    }

    findNearestStop(lat, lon, maxDistance = 5000) {
        let nearestStop = null;
        let minDistance = maxDistance;

        for (const stop of this.stops.values()) {
            const distance = this.calculateDistance(lat, lon, stop.lat, stop.lon);
            if (distance < minDistance) {
                minDistance = distance;
                nearestStop = stop;
            }
        }

        return nearestStop ? {
            stop: nearestStop,
            distance: minDistance,
            walkingTime: Math.ceil(minDistance / 1.4), // seconds
            cyclingTime: Math.ceil(minDistance / 4.0), // seconds
            drivingTime: Math.ceil(minDistance / 11.0) // seconds
        } : null;
    }

    getStopsForRoute(routeId) {
        const route = this.routes.get(routeId);
        return route ? route.stops : [];
    }

    getRoutesForStop(stopId) {
        const routes = [];
        for (const route of this.routes.values()) {
            if (route.stops.some(stop => stop.id === stopId)) {
                routes.push(route);
            }
        }
        return routes;
    }

    assignVehicleToRoute(vehicleId, routeId) {
        this.vehicleRouteMap.set(vehicleId, routeId);
    }

    getRouteForVehicle(vehicleId) {
        return this.vehicleRouteMap.get(vehicleId);
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }

    findNextStop(routeId, currentLat, currentLon, direction = 'forward') {
        const route = this.routes.get(routeId);
        if (!route) return null;

        const stops = direction === 'forward' ? route.stops : [...route.stops].reverse();
        
        let nearestStop = null;
        let minDistance = Infinity;
        let stopIndex = -1;

        for (let i = 0; i < stops.length; i++) {
            const stop = stops[i];
            const distance = this.calculateDistance(currentLat, currentLon, stop.lat, stop.lon);
            
            if (distance < minDistance) {
                minDistance = distance;
                nearestStop = stop;
                stopIndex = i;
            }
        }

        if (stopIndex < stops.length - 1) {
            return stops[stopIndex + 1];
        }
        
        return nearestStop;
    }
}

module.exports = RouteEngine;