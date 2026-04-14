// Global Hybrid Navigation for Wanderlust
// Automatically switches between Road (Local) and Flight (Global) modes

async function initializeMap(geometry, title, price, image, location, country) {
  if (typeof L === 'undefined') {
    console.error('Leaflet library not loaded');
    setTimeout(() => initializeMap(geometry, title, price, image, location, country), 500);
    return;
  }

  const listingLng = (geometry && geometry.coordinates) ? geometry.coordinates[0] : 77.1025;
  const listingLat = (geometry && geometry.coordinates) ? geometry.coordinates[1] : 28.7041;
  const listingPos = L.latLng(listingLat, listingLng);

  // 1. Initialize Map
  const map = L.map('map', {
    fullscreenControl: true,
    fullscreenControlOptions: { position: 'topleft' }
  }).setView([listingLat, listingLng], 13);

  // 2. Base Layers (Keeping it simple and clean)
  const hybridMap = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; Google Maps'
  }).addTo(map);


  const googleStreets = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; Google Maps'
  });

  const googleTerrain = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; Google Maps'
  });

  const streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  });

  L.control.layers({ 
    "🌍 Satellite (Hybrid)": hybridMap, 
    "🗺️ Standard Map": googleStreets,
    "⛰️ Terrain": googleTerrain,
    "🚲 OpenStreetMap": streetMap 
  }, null, { position: 'topright' }).addTo(map);

  L.control.scale({ position: 'bottomright', metric: true, imperial: true }).addTo(map);

  // 3. Helper: Build Premium Popup Card
  const buildPopupContent = (status = "", icon = "🏠", flightLink = "") => `
    <div class="map-popup-card">
      ${image ? `<img src="${image}" class="map-popup-img">` : ''}
      <div class="map-popup-info">
        <div class="map-popup-title">${title}</div>
        <div class="map-popup-price">₹${price} / night</div>
        <div class="map-popup-distance">
          <i class="fa-solid ${icon === '🏠' ? 'fa-location-dot' : (icon === '🚗' ? 'fa-car' : 'fa-plane')}"></i> 
          <span>${status || `${location}, ${country}`}</span>
        </div>
        ${flightLink ? `<a href="${flightLink}" target="_blank" class="btn btn-sm btn-outline-danger mt-2 w-100" style="font-size:0.7rem;">✈️ View Best Flights</a>` : ''}
      </div>
    </div>
  `;

  const markers = L.markerClusterGroup();
  map.addLayer(markers);
  const mainMarker = L.marker([listingLat, listingLng], {
    icon: L.divIcon({
      className: 'custom-marker',
      html: `<div style="background-color: #fe424d; width: 36px; height: 36px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid white; box-shadow: 0 4px 15px rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center;"><div style="transform: rotate(45deg); color: white; font-size: 18px;">🏠</div></div>`,
      iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -36]
    })
  });
  mainMarker.bindPopup(buildPopupContent());
  markers.addLayer(mainMarker);
  mainMarker.openPopup();

  async function calculateHybridRoute(originLng, originLat, label = "Origin", destLng = listingLng, destLat = listingLat) {
    if (window.routingPath) map.removeLayer(window.routingPath);
    if (window.flightPath) map.removeLayer(window.flightPath);

    const origin = L.latLng(originLat, originLng);
    const destPos = L.latLng(destLat, destLng);
    const straightLineDist = origin.distanceTo(destPos) / 1000;

    console.log(`Analyzing route from ${label}. Straight distance: ${straightLineDist.toFixed(1)} km`);

    if (straightLineDist < 1500) {
      try {
        const roadUrl = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;
        const resp = await fetch(roadUrl);
        const data = await resp.json();

        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const dist = (route.distance / 1000).toFixed(1);
          const time = Math.round(route.duration / 60);
          
          mainMarker.setPopupContent(buildPopupContent(`${dist} km driving (${time} mins)`, '🚗'));
          mainMarker.openPopup();

          window.routingPath = L.geoJSON(route.geometry, {
            style: { color: '#3b82f6', weight: 6, opacity: 0.8, lineCap: 'round' }
          }).addTo(map);
          map.fitBounds(window.routingPath.getBounds(), { padding: [50, 50] });
          return;
        }
      } catch (e) {
        console.warn("Road routing failed, switching to flight mode...");
      }
    }

    // Flight Mode for very long distances
    console.log("Entering Flight Mode...");
    const flightTime = Math.round((straightLineDist / 800) + 0.5);
    const flightsUrl = `https://www.google.com/travel/flights?q=Flights%20to%20${encodeURIComponent(location + ',' + country)}%20from%20your%20position`;

    mainMarker.setPopupContent(buildPopupContent(`Flight: ~${flightTime} hours (${straightLineDist.toFixed(0)} km)`, '✈️', flightsUrl));
    mainMarker.openPopup();

    window.flightPath = L.Polyline.Arc([originLat, originLng], [destLat, destLng], {
      color: '#fe424d', weight: 4, opacity: 0.6, dashArray: '8, 8', vertices: 100
    }).addTo(map);

    // LIVE PLANE ANIMATION on the Arc
    if (window.planeMarker) map.removeLayer(window.planeMarker);
    window.planeMarker = L.marker([originLat, originLng], {
        icon: L.divIcon({
            className: 'plane-icon',
            html: '<i class="fa-solid fa-plane" style="color: #fe424d; font-size: 20px; text-shadow: 0 0 10px rgba(0,0,0,0.3);"></i>',
            iconSize: [20, 20], iconAnchor: [10, 10]
        })
    }).addTo(map);

    // Simple animation logic along the arc points with rotation
    const points = window.flightPath.getLatLngs();
    let i = 0;
    const animatePlane = () => {
        if (i < points.length) {
            const currentPoint = points[i];
            const nextPoint = points[i+1] || points[i];
            
            // Calculate angle for rotation
            const angle = Math.atan2(nextPoint.lat - currentPoint.lat, nextPoint.lng - currentPoint.lng) * (180 / Math.PI);
            
            window.planeMarker.setLatLng(currentPoint);
            // Apply rotation to the icon
            const iconEl = window.planeMarker.getElement();
            if (iconEl) {
                const innerIcon = iconEl.querySelector('i');
                if (innerIcon) {
                    innerIcon.style.transform = `rotate(${angle + 90}deg)`;
                }
            }
            
            i++;
            setTimeout(animatePlane, 60); 
        } else {
            i = 0;
            setTimeout(animatePlane, 2000); 
        }
    };
    animatePlane();

    map.fitBounds(window.flightPath.getBounds(), { padding: [100, 100] });
  }

  // 5. GPS Integration (Now watching Real-time)
  const locateControl = L.control.locate({
    position: 'topleft',
    strings: { title: "Track my distance LIVE" },
    flyTo: true,
    watch: true, // KEY: Real-time tracking enabled!
    keepCurrentZoomLevel: true,
    locateOptions: {
      enableHighAccuracy: true
    }
  }).addTo(map);

  map.on('locationfound', (e) => {
    calculateHybridRoute(e.latlng.lng, e.latlng.lat, "Your Location");
  });

  // 6. 🚀 Custom Universal Search Engine (Replaces flaky geocoder plugin)
  const searchContainer = document.getElementById('mapSearchContainer');
  const searchToggle = document.getElementById('mapSearchToggle');
  const searchInput = document.getElementById('mapSearchInput');
  const searchBtn = document.getElementById('mapSearchBtn');
  const resultsDropdown = document.getElementById('mapSearchResults');

  if (searchContainer && searchToggle) {
    searchToggle.addEventListener('click', () => {
      searchContainer.classList.toggle('expanded');
      searchContainer.classList.toggle('collapsed');
      if (searchContainer.classList.contains('expanded')) {
        setTimeout(() => searchInput.focus(), 300);
      } else {
        resultsDropdown.style.display = 'none';
      }
    });

    // Close on click-outside
    document.addEventListener('click', (e) => {
      if (!searchContainer.contains(e.target)) {
        searchContainer.classList.remove('expanded');
        searchContainer.classList.add('collapsed');
        resultsDropdown.style.display = 'none';
      }
    });
  }

  if (searchInput && searchBtn && resultsDropdown) {
    let searchTimeout;

    const performSearch = async (query) => {
      if (!query || query.length < 2) {
        resultsDropdown.style.display = 'none';
        return;
      }

      if (query.toLowerCase().includes(' to ')) {
        // Instant "Route" suggestion for A-to-B
        const parts = query.toLowerCase().split(' to ');
        const start = parts[0].trim();
        const end = parts[1].trim();
        
        resultsDropdown.innerHTML = `
          <div class="map-result-item" onclick="handleSelectResult('${start}', '${end}', true)">
            <div class="icon"><i class="fa-solid fa-route"></i></div>
            <div class="content">
              <span class="text-main">Route: ${start} ➔ ${end}</span>
              <span class="text-sub">Calculate path between these two places</span>
            </div>
          </div>
        `;
        resultsDropdown.style.display = 'block';
      } else {
        // Standard Geocoding Fetch
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
          const resp = await fetch(url, { headers: { 'User-Agent': 'Wanderlust/1.0' } });
          const results = await resp.json();
          
          if (results.length > 0) {
            resultsDropdown.innerHTML = results.map(res => `
              <div class="map-result-item" onclick="handleSelectResult('${res.display_name.replace(/'/g, "\\'")}', {lat:${res.lat}, lon:${res.lon}}, false)">
                <div class="icon"><i class="fa-solid fa-location-dot"></i></div>
                <div class="content">
                  <span class="text-main">${res.display_name.split(',')[0]}</span>
                  <span class="text-sub">${res.display_name}</span>
                </div>
              </div>
            `).join('');
            resultsDropdown.style.display = 'block';
          } else {
            resultsDropdown.innerHTML = '<div class="p-3 text-center text-muted small">No places found</div>';
            resultsDropdown.style.display = 'block';
          }
        } catch (e) {
          console.error("Search failed", e);
        }
      }
    };

    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => performSearch(e.target.value), 400);
    });

    resultsDropdown.addEventListener('mousedown', (e) => e.preventDefault()); // Prevent focus loss
  }

  // Global helper for result selection
  window.handleSelectResult = async (nameOrStart, posOrEnd, isRoute) => {
    resultsDropdown.style.display = 'none';
    searchInput.value = isRoute ? `Route: ${nameOrStart} to ${posOrEnd}` : nameOrStart.split(',')[0];

    if (window.searchMarker) map.removeLayer(window.searchMarker);
    if (window.endMarker) map.removeLayer(window.endMarker);

    if (isRoute) {
      // A-to-B Routing Logic
      mainMarker.setPopupContent(buildPopupContent(`Searching Route...`, '🔍'));
      mainMarker.openPopup();

      const getCoord = async (q) => {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
        const resp = await fetch(url, { headers: { 'User-Agent': 'Wanderlust/1.0' } });
        const d = await resp.json();
        return d.length > 0 ? {lat: d[0].lat, lng: d[0].lon} : null;
      };

      const startPos = await getCoord(nameOrStart);
      const endPos = await getCoord(posOrEnd);

      if (startPos && endPos) {
        mainMarker.setLatLng([endPos.lat, endPos.lng]);
        mainMarker.setPopupContent(buildPopupContent(`Dest: ${posOrEnd}`, '🏠'));
        
        window.searchMarker = L.marker([startPos.lat, startPos.lng], {
          icon: L.divIcon({
            className: 'custom-search-marker',
            html: `<div style="background-color: #4285F4; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center;"><div style="transform: rotate(45deg); color: white; font-size: 14px;">📍</div></div>`,
            iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -30]
          })
        }).addTo(map).bindPopup(`<b>Start</b><br>${nameOrStart}`).openPopup();

        calculateHybridRoute(startPos.lng, startPos.lat, nameOrStart, endPos.lng, endPos.lat);
      } else {
        alert("Could not find one of the locations. Try adding city name.");
      }
    } else {
      // Single Location Logic
      const center = L.latLng(posOrEnd.lat, posOrEnd.lon);
      mainMarker.setLatLng(listingPos);

      window.searchMarker = L.marker(center, {
        icon: L.divIcon({
          className: 'custom-search-marker',
          html: `<div style="background-color: #4285F4; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center;"><div style="transform: rotate(45deg); color: white; font-size: 14px;">📍</div></div>`,
          iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -30]
        })
      }).addTo(map).bindPopup(`<b>Result:</b><br>${nameOrStart.split(',')[0]}<br><small>${nameOrStart}</small>`).openPopup();

      calculateHybridRoute(center.lng, center.lat, nameOrStart.split(',')[0]);
    }
  };

  // 7. Interactive Map Clicking (Reverse Geocode on touch) - Guaranteed direct fetch
  map.on('click', function(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    // Fetch from OpenStreetMap with max zoom (building/POI level)
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`)
      .then(res => res.json())
      .then(data => {
        const fullName = data.display_name || "Selected Location";
        // Prefer explicit place name if available, otherwise fallback
        const shortName = data.name || (data.address ? (data.address.amenity || data.address.shop || data.address.road || fullName.split(',')[0]) : fullName.split(',')[0]);
        
        if (window.searchMarker) map.removeLayer(window.searchMarker);
        
        window.searchMarker = L.marker(e.latlng, {
          icon: L.divIcon({
            className: 'custom-search-marker',
            html: `<div style="background-color: #4285F4; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center;"><div style="transform: rotate(45deg); color: white; font-size: 14px;">📍</div></div>`,
            iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -30]
          })
        }).addTo(map).bindPopup(`
          <div class="map-popup-card" style="width: 180px;">
            <div class="map-popup-info" style="padding: 10px;">
              <div class="map-popup-title" style="font-size: 0.95rem; font-weight: bold; color: #333;">${shortName}</div>
              <div class="map-popup-distance" style="margin-top: 5px; color: #666; display: flex; gap: 6px;">
                <i class="fa-solid fa-map-pin" style="color: #4285F4; margin-top:2px;"></i> 
                <span style="font-size: 0.75rem; line-height: 1.3;">${fullName}</span>
              </div>
            </div>
          </div>
        `).openPopup();

        // Calculate Route from clicked location automatically
        mainMarker.setLatLng(listingPos); // Always route to listing
        calculateHybridRoute(lng, lat, shortName);
      })
      .catch(err => console.error("Reverse geocoding failed", err));
  });

  console.log('Global Sleek Navigation Initialized.');
}
