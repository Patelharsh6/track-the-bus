class ETAEngine {
    constructor(osrmEngine, routeEngine) {
        this.osrm = osrmEngine;
        this.routes = routeEngine;
        this.busIntelligence = new Map();
        console.log('✅ ETA Engine initialized');
    }

    async calculateTripPlan(from, to, mode = 'walking') {
        try {
            // Step 1: Find nearest stop to user
            const nearestStopInfo = this.routes.findNearestStop(from.lat, from.lon);
            if (!nearestStopInfo) {
                throw new Error('No bus stops found near your location');
            }

            // Step 2: Find nearest stop to destination
            const destStopInfo = this.routes.findNearestStop(to.lat, to.lon);
            if (!destStopInfo) {
                throw new Error('No bus stops found near your destination');
            }

            // Step 3: Calculate route from user to nearest stop
            const toStopRoute = await this.osrm.getRoute(from, nearestStopInfo.stop, mode);
            
            // Step 4: Find connecting routes
            const connectingRoutes = this.findConnectingRoutes(
                nearestStopInfo.stop.id, 
                destStopInfo.stop.id
            );

            if (connectingRoutes.length === 0) {
                throw new Error('No direct bus routes found between these locations');
            }

            // Step 5: Calculate bus route
            const busRouteInfo = connectingRoutes[0]; // Take first route
            const busTravelTime = await this.calculateBusRouteTime(busRouteInfo);

            // Step 6: Calculate route from destination stop to final destination
            const fromStopRoute = await this.osrm.getRoute(destStopInfo.stop, to, 'walking');

            const totalDuration = 
                toStopRoute.duration + 
                300 + // 5 min wait time
                busTravelTime + 
                fromStopRoute.duration;

            return {
                from: { lat: from.lat, lon: from.lon, name: 'Your Location' },
                to: { lat: to.lat, lon: to.lon, name: 'Destination' },
                nearestStop: nearestStopInfo,
                destinationStop: destStopInfo,
                toStopRoute: toStopRoute,
                fromStopRoute: fromStopRoute,
                busRoute: busRouteInfo,
                busTravelTime: busTravelTime,
                waitTime: 300,
                totalDuration: totalDuration,
                mode: mode
            };

        } catch (error) {
            console.error('Trip plan calculation error:', error);
            throw error;
        }
    }

    async calculateBusRouteTime(routeInfo) {
        const busStops = routeInfo.direction === 'forward' 
            ? routeInfo.route.stops.slice(routeInfo.fromStopIndex, routeInfo.toStopIndex + 1)
            : routeInfo.route.stops.slice(routeInfo.toStopIndex, routeInfo.fromStopIndex + 1).reverse();

        let totalTime = 0;
        if (busStops.length > 1) {
            for (let i = 1; i < busStops.length; i++) {
                const segment = await this.osrm.getRoute(busStops[i-1], busStops[i], 'driving');
                totalTime += this.osrm.calculateBusTime(segment.distance);
            }
        }
        return totalTime;
    }

    findConnectingRoutes(fromStopId, toStopId) {
        const routes = [];
        
        for (const route of this.routes.getAllRoutes()) {
            const fromIndex = route.stops.findIndex(stop => stop.id === fromStopId);
            const toIndex = route.stops.findIndex(stop => stop.id === toStopId);
            
            if (fromIndex !== -1 && toIndex !== -1 && fromIndex < toIndex) {
                routes.push({
                    route,
                    fromStopIndex: fromIndex,
                    toStopIndex: toIndex,
                    direction: 'forward'
                });
            } else if (fromIndex !== -1 && toIndex !== -1 && fromIndex > toIndex) {
                routes.push({
                    route,
                    fromStopIndex: fromIndex,
                    toStopIndex: toIndex,
                    direction: 'reverse'
                });
            }
        }
        
        return routes;
    }

    updateBusIntelligence(vehicleId, position, routeId) {
        const route = this.routes.getRoute(routeId);
        if (!route) return;

        const nextStop = this.routes.findNextStop(routeId, position.lat, position.lon);
        const distanceToNextStop = nextStop ? 
            this.routes.calculateDistance(position.lat, position.lon, nextStop.lat, nextStop.lon) : 0;

        const intelligence = {
            vehicleId,
            routeId,
            nextStop,
            distanceToNextStop,
            etaToNextStop: this.osrm.calculateBusTime(distanceToNextStop),
            lastUpdate: new Date().toISOString(),
            status: distanceToNextStop < 100 ? 'approaching' : 'enroute'
        };

        this.busIntelligence.set(vehicleId, intelligence);
        return intelligence;
    }

    getBusIntelligence(vehicleId) {
        return this.busIntelligence.get(vehicleId);
    }

    getAllBusIntelligence() {
        return Array.from(this.busIntelligence.values());
    }
}

module.exports = ETAEngine;