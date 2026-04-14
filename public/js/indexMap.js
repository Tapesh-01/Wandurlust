document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById("mapToggleBtn");
    const mapContainer = document.getElementById("globalMapContainer");
    const listViews = document.getElementById("listViews");
    const btnText = toggleBtn.querySelector(".btn-text");
    const btnIcon = toggleBtn.querySelector("i");
    
    let isMapVisible = false;
    let globalLeafletMap = null;
    let mapInitialized = false;
  
    // Toggle Logic
    toggleBtn.addEventListener("click", () => {
      isMapVisible = !isMapVisible;
      
      if (isMapVisible) {
        // Show Map, Hide Lists
        listViews.style.display = "none";
        mapContainer.style.display = "block";
        btnText.innerText = "Show List";
        btnIcon.classList.replace("fa-map", "fa-list");
  
        // Initialize Map ONLY ONCE to save resources
        if (!mapInitialized) {
          initGlobalMap();
          mapInitialized = true;
        } else {
          // Leaflet needs to know the container size changed from display:none to block!
          setTimeout(() => {
            globalLeafletMap.invalidateSize();
          }, 100);
        }
      } else {
        // Show Lists, Hide Map
        mapContainer.style.display = "none";
        listViews.style.display = "block"; // or "flex" depending on framework, block usually wraps the row-cols
        btnText.innerText = "Show Map";
        btnIcon.classList.replace("fa-list", "fa-map");
      }
    });
  
    function initGlobalMap() {
      if (typeof L === 'undefined') {
        console.error("Leaflet library is missing.");
        return;
      }
      
      const listings = window.WANDERLUST_LISTINGS || [];
  
      // Base center - rough center of India if empty, or will be fit to bounds anyway
      globalLeafletMap = L.map('indexMap').setView([20.5937, 78.9629], 5);
  
      // Beautiful Standard Map Layer
      const baseLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps'
      }).addTo(globalLeafletMap);
  
      // Initialize Marker Cluster Group for clean UX
      const markers = L.markerClusterGroup({
        showCoverageOnHover: false,
        chunkedLoading: true
      });
  
      // Create a global bounds object so we can adjust the camera to fit ALL markers
      const bounds = L.latLngBounds();
  
    function createListingMarker(listing) {
      if (listing.geometry && listing.geometry.coordinates && listing.geometry.coordinates.length === 2) {
          const lng = listing.geometry.coordinates[0];
          const lat = listing.geometry.coordinates[1];
          const pos = L.latLng(lat, lng);
          
          const imageUrl = (listing.images && listing.images.length > 0) ? listing.images[0].url : ((listing.image && listing.image.url) ? listing.image.url : 'https://placehold.co/400x300/ffe4e6/fe424d?text=No+Image');
          
          const popupContent = `
            <div class="map-popup-card">
              <img src="${imageUrl}" class="map-popup-img" alt="Property">
              <div class="map-popup-info">
                <div class="map-popup-title">${listing.title}</div>
                <div class="map-popup-price">₹${listing.price.toLocaleString("en-IN")} / night</div>
                <div class="map-popup-distance">
                  <i class="fa-solid fa-location-dot"></i> 
                  <span>${listing.location}, ${listing.country}</span>
                </div>
                <a href="/listings/${listing._id}" class="btn btn-sm btn-dark mt-2 w-100" style="font-size:0.75rem; border-radius:15px;">Explore Place ➔</a>
              </div>
            </div>
          `;

          const marker = L.marker(pos, {
            icon: L.divIcon({
              className: 'custom-marker',
              html: `<div style="background-color: #fe424d; width: 36px; height: 36px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid white; box-shadow: 0 4px 15px rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center;"><div style="transform: rotate(45deg); color: white; font-size: 14px; font-weight:bold;">₹</div></div>`,
              iconSize: [36, 36], 
              iconAnchor: [18, 36], 
              popupAnchor: [0, -36]
            })
          });

          marker.bindPopup(popupContent, { minWidth: 200, maxWidth:220 });
          markers.addLayer(marker);
          return pos;
      }
      return null;
    }

    listings.forEach(listing => {
        const pos = createListingMarker(listing);
        if (pos) bounds.extend(pos);
    });

    globalLeafletMap.addLayer(markers);

    // ── 🚀 Custom Universal Global Search Engine ───────────────────
    const globalSearchContainer = document.getElementById('globalSearchContainer');
    const globalSearchToggle = document.getElementById('globalSearchToggle');
    const globalSearchInput = document.getElementById('globalSearchInput');
    const globalSearchBtn = document.getElementById('globalSearchBtn');
    const globalResultsDropdown = document.getElementById('globalSearchResults');

    if (globalSearchContainer && globalSearchToggle) {
        globalSearchToggle.addEventListener('click', () => {
            globalSearchContainer.classList.toggle('expanded');
            globalSearchContainer.classList.toggle('collapsed');
            if (globalSearchContainer.classList.contains('expanded')) {
                setTimeout(() => globalSearchInput.focus(), 300);
            } else {
                globalResultsDropdown.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (!globalSearchContainer.contains(e.target)) {
                globalSearchContainer.classList.remove('expanded');
                globalSearchContainer.classList.add('collapsed');
                globalResultsDropdown.style.display = 'none';
            }
        });
    }

    if (globalSearchInput && globalResultsDropdown) {
        let globalSearchTimeout;

        const performGlobalSearch = async (query) => {
            if (!query || query.length < 2) {
                globalResultsDropdown.style.display = 'none';
                return;
            }

            try {
                const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
                const resp = await fetch(url, { headers: { 'User-Agent': 'Wanderlust/1.0' } });
                const results = await resp.json();
                
                if (results.length > 0) {
                    globalResultsDropdown.innerHTML = results.map(res => `
                        <div class="map-result-item" onclick="handleSelectGlobalResult('${res.display_name.replace(/'/g, "\\'")}', {lat:${res.lat}, lon:${res.lon}})">
                            <div class="icon"><i class="fa-solid fa-location-dot"></i></div>
                            <div class="content">
                                <span class="text-main">${res.display_name.split(',')[0]}</span>
                                <span class="text-sub">${res.display_name}</span>
                            </div>
                        </div>
                    `).join('');
                    globalResultsDropdown.style.display = 'block';
                } else {
                    globalResultsDropdown.innerHTML = '<div class="p-3 text-center text-muted small">No places found</div>';
                    globalResultsDropdown.style.display = 'block';
                }
            } catch (e) {
                console.error("Global search failed", e);
            }
        };

        globalSearchInput.addEventListener('input', (e) => {
            clearTimeout(globalSearchTimeout);
            globalSearchTimeout = setTimeout(() => performGlobalSearch(e.target.value), 400);
        });

        globalResultsDropdown.addEventListener('mousedown', (e) => e.preventDefault());
    }

    // Global Discovery Result selection
    window.handleSelectGlobalResult = (name, coords) => {
        globalResultsDropdown.style.display = 'none';
        globalSearchInput.value = name.split(',')[0];

        if (window.globalSearchMarker) globalLeafletMap.removeLayer(window.globalSearchMarker);
        
        window.globalSearchMarker = L.marker([coords.lat, coords.lon], {
            icon: L.divIcon({
                className: 'custom-search-marker',
                html: `<div style="background-color: #4285F4; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center;"><div style="transform: rotate(45deg); color: white; font-size: 14px;">📍</div></div>`,
                iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -30]
            })
        }).addTo(globalLeafletMap).bindPopup(`<b>Discover:</b><br>${name}`).openPopup();

        globalLeafletMap.flyTo([coords.lat, coords.lon], 10);
    };

    // REAL-TIME: Listen for new listings and add them instantly!
    if (typeof globalSocket !== "undefined") {
      globalSocket.on("new_listing", (newListing) => {
        createListingMarker(newListing);
        console.log("New listing added to map in real-time!");
      });
    }
  
      // Zoom map to bounds if we actually have valid points
      if (bounds.isValid()) {
        setTimeout(() => {
            // Need a slight delay for Map to render before calculating fitBounds correctly
            globalLeafletMap.invalidateSize();
            globalLeafletMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        }, 300);
      }
    }
  });
  
