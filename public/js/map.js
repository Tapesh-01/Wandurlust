// Map initialization script for listing pages using Leaflet.js
// This script handles geocoding and map display for each listing

function initializeMap(location, country) {
    // Check if Leaflet is loaded
    if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded');
        document.getElementById('map').innerHTML = '<p class="text-center p-4">Map library loading...</p>';
        // Retry after a short delay
        setTimeout(() => initializeMap(location, country), 500);
        return;
    }

    console.log('Initializing map for:', location, country);

    // Combine location and country for geocoding
    const searchQuery = `${location}, ${country}`;
    console.log('Geocoding query:', searchQuery);

    // Use Nominatim (OpenStreetMap) Geocoding API - FREE, no API key needed!
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`, {
        headers: {
            'User-Agent': 'WandurLust/1.0 (Travel Booking Website)',
            'Accept': 'application/json'
        }
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Geocoding response:', data);
            if (data && data.length > 0) {
                // Get coordinates from the first result
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                console.log('Coordinates:', lat, lon);

                // Initialize the map with fullscreen option
                const map = L.map('map', {
                    fullscreenControl: true,
                    fullscreenControlOptions: {
                        position: 'topleft'
                    }
                }).setView([lat, lon], 13);

                // Define multiple base layers
                const streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                    maxZoom: 19
                });

                const satelliteMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
                    maxZoom: 19
                });

                // Hybrid map with satellite + labels (default)
                const hybridMap = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
                    maxZoom: 20,
                    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                    attribution: '&copy; Google Maps'
                });

                // Add default layer (hybrid map - satellite with labels)
                hybridMap.addTo(map);

                // Create layer control with all three options
                const baseMaps = {
                    "🌍 Hybrid": hybridMap,
                    "🗺️ Street": streetMap,
                    "🛰️ Satellite": satelliteMap
                };

                // Add layer control to map
                L.control.layers(baseMaps, null, {
                    position: 'topright'
                }).addTo(map);

                // Create custom icon with brand color
                const customIcon = L.divIcon({
                    className: 'custom-marker',
                    html: '<div style="background-color: #fe424d; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"><div style="transform: rotate(45deg); margin-top: 5px; text-align: center; color: white; font-size: 16px;">📍</div></div>',
                    iconSize: [30, 30],
                    iconAnchor: [15, 30],
                    popupAnchor: [0, -30]
                });

                // Add a marker at the location
                L.marker([lat, lon], { icon: customIcon })
                    .addTo(map)
                    .bindPopup(`<div style="text-align: center;"><h6 style="margin: 5px 0; font-weight: 600;">${location}</h6><p style="margin: 5px 0; color: #666;">${country}</p></div>`)
                    .openPopup();

                // Add click event to show nearby places with photos
                map.on('click', function (e) {
                    const clickedLat = e.latlng.lat;
                    const clickedLng = e.latlng.lng;

                    // Show loading popup
                    const loadingPopup = L.popup()
                        .setLatLng(e.latlng)
                        .setContent('<div style="text-align: center; padding: 10px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading nearby places...</div>')
                        .openOn(map);

                    // Fetch nearby places from Wikipedia
                    fetchNearbyPlaces(clickedLat, clickedLng)
                        .then(places => {
                            if (places && places.length > 0) {
                                const place = places[0]; // Get the closest place

                                // Fetch photo for this place
                                fetchPlacePhoto(place.title)
                                    .then(photoUrl => {
                                        let popupContent = `
                      <div style="max-width: 250px; text-align: center;">
                        <h6 style="margin: 5px 0 10px 0; font-weight: 600; color: #fe424d;">${place.title}</h6>
                        ${photoUrl ? `<img src="${photoUrl}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px; margin-bottom: 8px;" alt="${place.title}">` : ''}
                        <p style="margin: 5px 0; font-size: 12px; color: #666;">${place.description || 'Popular landmark'}</p>
                        <p style="margin: 5px 0; font-size: 11px; color: #999;">📍 ${Math.round(place.dist)} meters away</p>
                        <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(place.title)}" target="_blank" style="font-size: 11px; color: #fe424d; text-decoration: none;">Learn more →</a>
                      </div>
                    `;

                                        L.popup()
                                            .setLatLng(e.latlng)
                                            .setContent(popupContent)
                                            .openOn(map);
                                    })
                                    .catch(() => {
                                        // Show place without photo
                                        let popupContent = `
                      <div style="max-width: 250px; text-align: center;">
                        <h6 style="margin: 5px 0; font-weight: 600; color: #fe424d;">${place.title}</h6>
                        <p style="margin: 5px 0; font-size: 12px; color: #666;">${place.description || 'Popular landmark'}</p>
                        <p style="margin: 5px 0; font-size: 11px; color: #999;">📍 ${Math.round(place.dist)} meters away</p>
                      </div>
                    `;

                                        L.popup()
                                            .setLatLng(e.latlng)
                                            .setContent(popupContent)
                                            .openOn(map);
                                    });
                            } else {
                                L.popup()
                                    .setLatLng(e.latlng)
                                    .setContent('<div style="text-align: center; padding: 10px; color: #999;">No popular places found nearby</div>')
                                    .openOn(map);
                            }
                        })
                        .catch(error => {
                            console.error('Error fetching nearby places:', error);
                            L.popup()
                                .setLatLng(e.latlng)
                                .setContent('<div style="text-align: center; padding: 10px; color: #999;">Unable to load nearby places</div>')
                                .openOn(map);
                        });
                });

                console.log('Map initialized successfully');
            } else {
                console.error('Location not found:', searchQuery);
                document.getElementById('map').innerHTML = '<p class="text-center p-4 text-warning">Location not found on map</p>';
            }
        })
        .catch(error => {
            console.error('Geocoding error:', error);
            document.getElementById('map').innerHTML = '<p class="text-center p-4 text-danger">Unable to load map: ' + error.message + '</p>';
        });
}

// Helper function to fetch nearby places from Wikipedia
async function fetchNearbyPlaces(lat, lng) {
    try {
        const radius = 5000; // Search within 5km
        const url = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lng}&gsradius=${radius}&gslimit=5&format=json&origin=*`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.query && data.query.geosearch) {
            return data.query.geosearch;
        }
        return [];
    } catch (error) {
        console.error('Error fetching nearby places:', error);
        return [];
    }
}

// Helper function to fetch photo for a place from Wikimedia
async function fetchPlacePhoto(title) {
    try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=300&origin=*`;

        const response = await fetch(url);
        const data = await response.json();

        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];

        if (pages[pageId].thumbnail) {
            return pages[pageId].thumbnail.source;
        }
        return null;
    } catch (error) {
        console.error('Error fetching place photo:', error);
        return null;
    }
}
