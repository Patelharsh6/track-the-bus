const axios = require('axios');

class OSRMEngine {
    constructor() {
        this.baseURL = 'https://router.project-osrm.org';
        console.log('✅ OSRM Engine initialized');
    }

    async getRoute(from, to, profile = 'walking') {
        try {
            const url = `${this.baseURL}/route/v1/${profile}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;
            const response = await axios.get(url);
            
            if (response.data.code === 'Ok') {
                const route = response.data.routes[0];
                return {
                    distance: route.distance,
                    duration: route.duration,
                    geometry: route.geometry
                };
            }
            throw new Error('No route found');
        } catch (error) {
            console.error('OSRM Route error:', error.message);
            return this.getFallbackRoute(from, to, profile);
        }
    }

    getFallbackRoute(from, to, profile = 'walking') {
        const distance = this.calculateDistance(from, to);
        let speed;
        
        switch(profile) {
            case 'cycling':
                speed = 4.0; // m/s
                break;
            case 'driving':
                speed = 11.0; // m/s
                break;
            default: // walking
                speed = 1.4; // m/s
        }
        
        const duration = distance / speed;
        
        return {
            distance,
            duration,
            geometry: {
                type: "LineString",
                coordinates: [
                    [from.lon, from.lat],
                    [to.lon, to.lat]
                ]
            }
        };
    }

    calculateDistance(point1, point2) {
        const R = 6371e3;
        const φ1 = point1.lat * Math.PI / 180;
        const φ2 = point2.lat * Math.PI / 180;
        const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
        const Δλ = (point2.lon - point1.lon) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }

    calculateWalkingTime(distanceMeters) {
        return Math.ceil(distanceMeters / 1.4);
    }

    calculateCyclingTime(distanceMeters) {
        return Math.ceil(distanceMeters / 4.0);
    }

    calculateDrivingTime(distanceMeters) {
        return Math.ceil(distanceMeters / 11.0);
    }

    calculateTransitTime(distanceMeters, speedMultiplier = 1.0) {
        const baseSpeed = 8.0; // m/s for transit
        return Math.ceil(distanceMeters / (baseSpeed * speedMultiplier));
    }
}

module.exports = OSRMEngine;