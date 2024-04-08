const ESRI_KEY =  "AAPKccc2cf38fecc47649e91529acf524abflSSkRTjWwH0AYmZi8jaRo-wdpcTf6z67CLCkOjVYlw3pZyUIF_Y4KGBndq35Y02z";
const MAPTILER_KEY = "KydZlIiVFdYDFFfQ4QYq"
const basemapEnum = "65aff2873118478482ec3dec199e9058";

// let timer = setTimeout(() => {
// 	// let loadingDiv = document.getElementById('loading');
// 	// loadingDiv.innerHTML = "Sorry, loading timed out: we're currently unable to load data. Please check your connection or try again later. Click anywhere to refresh.";
// 	loadingDiv.style.cursor = "pointer";
// 	loadingDiv.onclick = () => location.reload(true);
// }, 25000); // 25 seconds

// Bounding box coordinates for Los Angeles County
const LA_COUNTY_BOUNDS = {
    north: 34.8233,
    south: 33.7037,
    west: -118.6682,
    east: -117.6462
};

let features = [];
// Declare a global variable to store the route shapes data
let routeShapesData;

// Create a map of vehicle IDs to markers
let markers = {};

// Get the current time
const now = new Date();

let isFirstDataLoad = true;

// Convert the current time to PST
let pst = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));

// Get the current hour in PST
let hour = pst.getHours();

// Get the URL parameters
let params = new URLSearchParams(window.location.search);

let zoom = params.get('zoom');

// If no zoom parameter is provided, set the zoom level based on the viewport's width
if (!zoom) {
  let width = window.innerWidth;

  if (width <= 768) {
    // Phones
    zoom = 8;
  } else if (width <= 1280) {
    // Medium devices
    zoom = 9;
  } else {
    // Large devices
    zoom = 10;
  }
}

// map setup
let map = new maplibregl.Map({
    container: 'map',
    center: [-118.25133692966446, 34.00095151499077], 
    zoom: zoom,
    pitch: 0,
    bearing: 0,
    antialias: true,
    minZoom: 8, // Minimum zoom level
    style: `https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/items/${basemapEnum}?token=${ESRI_KEY}`,
});

const routeIcons = {
    '801': 'https://lacmta.github.io/metro-iconography/Service_ALine.svg',
    '802': 'https://lacmta.github.io/metro-iconography/Service_BLine.svg',
    '803': 'https://lacmta.github.io/metro-iconography/Service_CLine.svg',
    '804': 'https://lacmta.github.io/metro-iconography/Service_ELine2.svg',
    '806': 'https://lacmta.github.io/metro-iconography/Service_LLine.svg',
    '807': 'https://lacmta.github.io/metro-iconography/Service_KLine.svg',
    '805': 'https://lacmta.github.io/metro-iconography/Service_DLine.svg',
    '901': 'https://lacmta.github.io/metro-iconography/Service_GLine.svg',
    '910': 'https://lacmta.github.io/metro-iconography/Service_JLine.svg'
};

// The 'building' layer in the streets vector source contains building-height
// data from OpenStreetMap.
map.on('load', () => {
    // Insert the layer beneath any symbol layer.
    const layers = map.getStyle().layers;

    let labelLayerId;
    for (let i = 0; i < layers.length; i++) {
        if (layers[i].type === 'symbol' && layers[i].layout['text-field']) {
            labelLayerId = layers[i].id;
            break;
        }
    }
    new mapboxglEsriSources.TiledMapService('imagery-source', map, {
        url: 'https://tiles.arcgis.com/tiles/TNoJFjk1LsD45Juj/arcgis/rest/services/Map_RGB_Vector_Offset_RC5/MapServer'
    });
   
    // Toggle attribution control to hide it by default
    document.getElementsByClassName('maplibregl-ctrl-attrib-button')[0].click();

    map.addLayer({
        id: 'imagery-layer',
        type: 'raster',
        source: 'imagery-source'
    })

    let apiUrl = `https://api.metro.net/LACMTA_Rail/vehicle_positions?format=geojson&nocache=${new Date().getTime()}`;

    // Declare and initialize the popups object
    let popups = {};
    let brtUrl = 'https://api.metro.net/LACMTA/vehicle_positions/route_code/901%2C910?format=geojson'

    // Extract the fetch logic into a separate function

    function handleError(error) {
        if (error instanceof TypeError) {
            document.getElementById('loading').innerHTML = "We're experiencing technical difficulties with our data. We're attempting to reload the data. Please wait<span class='dot1'>.</span><span class='dot2'>.</span><span class='dot3'>.</span>";
            console.error('TypeError caught: ', error);
            // Retry loading data
            fetchData();
        } else if (error instanceof SyntaxError) {
            document.getElementById('loading').innerHTML = "We're currently facing some technical issues. Our team is working on it. Please try again later.";
        } else if (error instanceof ReferenceError) {
            document.getElementById('loading').innerHTML = "We're unable to find some necessary information. Please try again later.";
        } else {
            document.getElementById('loading').innerHTML = `We're experiencing unexpected issues: ${error.message}. Our team is looking into it. Please try again later.`;
        }
    }

    // Define a function to hide the loading div
    function hideLoadingDiv() {
        document.getElementById('loading').style.display = 'none';
    }

    const updateTimeDivDom = document.getElementById('update-time');
    // Add an event listener to the update time div

    map.addSource('openmaptiles', {
        url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${MAPTILER_KEY}`,
        type: 'vector',
    });

    map.addLayer(
        {
            'id': '3d-buildings',
            'source': 'openmaptiles',
            'source-layer': 'building',
            'type': 'fill-extrusion',
            'minzoom': 14,
            'paint': {
                'fill-extrusion-color': [
                    'interpolate',
                    ['linear'],
                    ['get', 'render_height'],0, 'lightgray', 200, 'hsl(38, 28%, 77%)', 400, 'hsl(38, 28%, 77%)'
                ],
                'fill-extrusion-opacity': 0.5,
                'fill-extrusion-height': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    15,
                    0,
                    16,
                    ['get', 'render_height']
                ],
                'fill-extrusion-base': ['case',
                    ['>=', ['get', 'zoom'], 16],
                    ['get', 'render_min_height'], 0
                ]
            }
        },
        labelLayerId
    );
});

// Add navigation controls to the top-left corner of the map
map.addControl(new maplibregl.NavigationControl(), 'top-left');

class VehicleMarker extends maplibregl.Marker {
    constructor(options, id) {
        super(options);
        this.id = id;
    }
}

// Create a home button
class HomeControl {
    onAdd(map) {
        this.map = map;
        this.container = document.createElement('div');
        this.container.className = 'maplibregl-ctrl';
        const button = document.createElement('button');
        button.className = 'maplibregl-ctrl-icon home-icon'; // Add 'home-icon' class
        button.innerHTML = '<i class="fas fa-home"></i>';
        button.addEventListener('click', () => {
            this.map.flyTo({
                center: [-118.25133692966446, 34.00095151499077],
                zoom: 9,
                pitch: 0,
                bearing: 0
            });
        });
        this.container.appendChild(button);
        return this.container;
    }

    onRemove() {
        this.container.parentNode.removeChild(this.container);
        this.map = undefined;
    }
}

window.onload = function() {
    const legend = document.getElementById('legend');
    const toggleLegend = document.getElementById('toggle-legend');

    if (legend && toggleLegend) {
        legend.addEventListener('click', function() {
            this.classList.toggle('hidden');

            // Change the icon based on the visibility
            toggleLegend.innerHTML = this.classList.contains('hidden') ? '<i class="fas fa-chevron-left"></i>' : '<i class="fas fa-chevron-right"></i>';
        });
    } else {
        console.error('Element not found');
    }
};

let lastProcessedTime = 0;
const throttleInterval = 5000; // Adjust this value to change the throttle time

// Handle the connection opening
// Handle incoming messages

let animations = {};
let isAnimating = false;
let pendingData = null;



function animateMarker(vehicle, diffLng, diffLat, steps, currentCoordinates) {
    return new Promise(resolve => {
        let i = 0;
        function animate() {
            if (i <= steps) {
                let progress = i / steps;
                let easedProgress = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

                markers[vehicle.properties.vehicle_id].setLngLat([
                    currentCoordinates.lng + easedProgress * diffLng,
                    currentCoordinates.lat + easedProgress * diffLat
                ]);

                // Update the rotation of the marker
                // if (vehicle.properties && vehicle.properties.position_bearing) {
                //     markers[vehicle.properties.vehicle_id].setRotation(vehicle.properties.position_bearing);
                // }

                i++;
                animations[vehicle.properties.vehicle_id] = requestAnimationFrame(animate);
            } else {
                resolve();
            }
        }
        animate();
    });
}

function setupWebSocket(url, processData) {
    let socket = new WebSocket(url);
    let dataStore = {};

    socket.onopen = function(event) {
        console.log("WebSocket connection opened");
        setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send('ping');
                // console.log('Sent ping'); // for debugging purposes
            }
        }, 30000);
    };

    socket.onerror = function(error) {
        console.error(error);
        // document.getElementById('loading').style.display = 'none';
        // document.getElementById('loading').innerHTML = "Error loading data. Please check your connection or try again later.";
    };

    socket.onclose = function(event) {
        console.log("WebSocket connection closed");
        // Try to reconnect after a delay
        setTimeout(() => setupWebSocket(url, processData), 5000); // 5000 ms delay before reconnecting
    };



	socket.onmessage = function(event) {
		const currentTime = Date.now();
		lastUpdateTime = currentTime;

		// Process the update
		let data = JSON.parse(event.data);

		// Store the data with the current timestamp
		dataStore[data.id] = {
			data: data,
			timestamp: Date.now()
		};

		// Filter data based on routeId if a filter function is provided
		if (processData) {
			data = processData(data);
		}

		// If an animation is currently running, store the data and wait
		if (isAnimating) {
			pendingData = data;
		} else if (document.hidden) {
			// If the document is not visible, disregard all pending data
			cleanupData();
			pendingData = null;
		} else {
			processAndUpdate(data);
		}

		// Remove the loading div after the first data load
		if (isFirstDataLoad) {
			let loadingDiv = document.getElementById('loading');
			if (loadingDiv) {
				loadingDiv.parentNode.removeChild(loadingDiv);
			}
			isFirstDataLoad = false;
		}
	};

    // Handle visibility change
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden && pendingData) {
            // The tab has become visible again
            // Process the pending data
            processAndUpdate(pendingData);
            pendingData = null;
        }
    });

    // Function to clean up old data
    function cleanupData() {
        let now = Date.now();
        for (let id in dataStore) {
            // If the data is older than 2 mins, delete it
            if (now - dataStore[id].timestamp > 12000) {
                delete dataStore[id];
            }
        }
    }

    // Run the cleanup function every minute
    setInterval(cleanupData, 60000);
}

// Call setupWebSocket twice with different URLs and processing functions
setupWebSocket("wss://api.metro.net/ws/LACMTA_Rail/vehicle_positions");
setupWebSocket("wss://api.metro.net/ws/LACMTA/vehicle_positions/910,901");

map.on('load', function() {
    // Set up the WebSocket connection and the onmessage event handler here
    setupWebSocket();
    // Set the zoom level based on the screen width
    if (screenWidth > 2000) { // Change 1440 to whatever width you consider "large"
        map.setZoom(12); // Change 10 to the zoom level you want for large screens
    } else {
        map.setZoom(9); // Change 5 to the zoom level you want for smaller screens
    }
});

function updateMap(features) {
	if (!map.getSource('vehicles')) {
		map.addSource('vehicles', {
			type: 'geojson',
			data: {
				type: 'FeatureCollection',
				features: features
			}
		});
	} else {
		map.getSource('vehicles').setData({
			type: 'FeatureCollection',
			features: features
		});
	}
}

function processAndUpdate(data) {
    // Check if the data has 'vehicle' and 'vehicle.trip' properties
    if (!data.vehicle || !data.vehicle.trip) {
        return;
    }
    let feature = {
        type: "Feature",
        properties: {
            id: data.vehicle.vehicle.id,
            vehicle_id: data.vehicle.vehicle.id,
            currentStatus: data.vehicle.currentStatus,
            currentStopSequence: data.vehicle.currentStopSequence,
            stopId: data.vehicle.stopId,
            timestamp: parseInt(data.vehicle.timestamp),
            route_code: data.route_code,
            trip: data.vehicle.trip,
            trip_id: data.vehicle.trip.tripId,
            position_bearing: data.vehicle.position.bearing,
            position_speed: data.vehicle.position.speed,
            position_latitude: data.vehicle.position.latitude,
            position_longitude: data.vehicle.position.longitude
        },
        geometry: {
            type: "Point",
            coordinates: [data.vehicle.position.longitude, data.vehicle.position.latitude]
        }
    };

    let geojson = {
        type: "FeatureCollection",
        features: [feature]
    };

    const features = getFeaturesFromData(geojson);
    let newVehicleIds = new Set([feature.properties.vehicle_id]);
    let this_data = {features}
    // removeOldMarkers(newVehicleIds, this_data);
    processVehicleData(this_data, features);
    updateMap(features);
    updateUI();

    // Get the current time
    const now = new Date();

    // Get the update time div
    const updateTimeDiv = document.getElementById('update-time');

    // Update the content of the update time div
    updateTimeDiv.textContent = `Updated at ${now.toLocaleTimeString()}`;
    updateTimeDiv.style.fontSize = '12px';

}
function getFeaturesFromData(data) {
    let features;
    if (data && data.features) {
        features = Array.isArray(data.features) ? data.features : Object.values(data.features);
    } else if (data && Object.keys(data).length > 0) {
        const routeData = data[Object.keys(data)[0]];
        if (routeData && routeData.features) {
            features = Array.isArray(routeData.features) ? routeData.features : Object.values(routeData.features);
        }
    }

    if (!features) {
        throw new Error('The API response does not have a features property');
    }

    // Filter out data that does not have valid latitude and longitude values
    features = features.filter(feature => {
        const coordinates = feature.geometry.coordinates;
        return Array.isArray(coordinates) && coordinates.length === 2 && !isNaN(coordinates[0]) && !isNaN(coordinates[1]);
    });

    return features;
}
function updateUI() {
    const now = new Date();
    const updateTimeDiv = document.getElementById('update-time');
    updateTimeDiv.textContent = `Updated at ${now.toLocaleTimeString()}`;
    updateTimeDiv.style.fontSize = '12px';

    let pst = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
    let hour = pst.getHours();
}


function processVehicleData(data, features) {
    const currentTimestamp = Math.floor(Date.now() / 1000); // Get current timestamp in seconds

    data.features.filter(vehicle => vehicle.properties && vehicle.properties.trip_id).forEach(vehicle => {
        const vehicleTimestamp = parseInt(vehicle.properties.timestamp);

        // Check if the data is older than 1 minute
        if (currentTimestamp - vehicleTimestamp > 60) {
            return; // Skip this vehicle data
        }

        if (markers[vehicle.properties.vehicle_id]) {
            // Check if the new timestamp is newer than the current marker's timestamp
            if (vehicleTimestamp > parseInt(markers[vehicle.properties.vehicle_id].timestamp)){
                // Update the marker's timestamp
                markers[vehicle.properties.vehicle_id].timestamp = vehicleTimestamp;
                // Update the marker's position
                updateExistingMarker(vehicle,features);
            }
		} else {
			// Check if a marker with the same vehicle_id already exists
			const existingMarker = markers[vehicle.properties.vehicle_id];
			if (existingMarker) {
				// If the new timestamp is newer, update the existing marker
				if (vehicleTimestamp > parseInt(existingMarker.timestamp)) {
					existingMarker.timestamp = vehicleTimestamp;
					updateExistingMarker(vehicle,features);
				}
			} else {
				createNewMarker(vehicle, features);
			}
		}
    });
}

function createNewMarker(vehicle, features) {
    const existingMarker = markers[vehicle.properties.vehicle_id];

    let routeCode = vehicle.properties.route_code;
    let tripId = vehicle.properties.trip_id;
    let isBus = false;

    if (routeCode == '901' || routeCode == '910' || routeCode == '950') {
        isBus = true;
    }

    // Check the route code and set the icon URL accordingly
    let iconUrl = isBus ? 'bus.svg' : 'rail.svg';

    if (existingMarker) {
        // If it exists, remove the existing marker from the map
        existingMarker.remove();
        // And delete it from the markers object
        delete markers[vehicle.properties.vehicle_id];
    }

	const el = document.createElement('div');
	el.className = 'marker';
    el.setAttribute('data-route', routeCode);
    el.setAttribute('data-trip', tripId);
    el.setAttribute('data-mode', isBus ? 'bus' : 'rail')
	el.setAttribute('data-timestamp', vehicle.properties.timestamp);

	el.style.background = `url(${iconUrl}) no-repeat center/cover`;

    // Rotate the icon based on the heading
    const heading = vehicle.properties.position_bearing;

    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.backgroundColor = 'white';
    el.style.cursor = 'pointer';
	// set border radius to 50% if it is a rail vehicle
	if (!isBus) {
		el.style.borderRadius = '50%';
	}
	
    const zoom = map.getZoom();
    const size = 16; // Set the size to a constant value

    // el.style.width = `${size}px`;
    // el.style.height = `${size}px`;
	let vehicleLabel = ['901', '910'].includes(vehicle.properties.route_code) ? 'Bus ID ' : 'Train Car #';

    const popup = new maplibregl.Popup()
	.setHTML(`
	<div style="display: flex; align-items: center;justify-content:center;">
		<img src="${routeIcons[vehicle.properties.route_code]}" style="width: 24px; height: 24px; border-radius: 50%;">
		<span></span>
	</div>        
	<div style="text-align: center;">${vehicleLabel}${vehicle.properties.vehicle_id}<br>

	Data from ${new Date(vehicle.properties.timestamp * 1000).toLocaleTimeString()}</div>`);
    const marker = new maplibregl.Marker({element: el, anchor: 'center'})
        .setLngLat(vehicle.geometry.coordinates)
        .setPopup(popup) // Set the popup
        .addTo(map);

		// .setRotation(heading) // Rotate the marker
    marker.properties = {
        vehicle_id: vehicle.properties.vehicle_id,
        Heading: heading
    };
    // Convert the timestamp to a number and store it
    marker.timestamp = parseInt(vehicle.properties.timestamp);
    marker.route_code = vehicle.properties.route_code;

    markers[vehicle.properties.vehicle_id] = marker;

    const feature = {
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [vehicle.geometry[0], vehicle.geometry[1]]
        },
        properties: {
            vehicle_id: vehicle.properties.vehicle_id,
            Heading: heading
            
        }
    };
    features.push(feature);
}



let arrowSvg;
function cancelAnimationFrameForVehicle(vehicleId) {
    if (animations[vehicleId]) {
        cancelAnimationFrame(animations[vehicleId]);
        delete animations[vehicleId];
    }
}
function updateExistingMarker(vehicle,features) {
    const marker = markers[vehicle.properties.vehicle_id];
    let currentCoordinates = marker.getLngLat();

    if (vehicle.geometry && vehicle.geometry.coordinates) {
        let diffLng = vehicle.geometry.coordinates[0] - currentCoordinates.lng;
        let diffLat = vehicle.geometry.coordinates[1] - currentCoordinates.lat;
        let distance = Math.sqrt(diffLng * diffLng + diffLat * diffLat);

        // Convert the distance from degrees to miles
        let distanceInMiles = distance * 69;

        // If the distance is greater than 1.0 mile, remove the old marker and add a new one
        if (distanceInMiles > 1.0) {
            // Remove the old marker from the map and the markers object
            marker.remove();
            delete markers[vehicle.properties.vehicle_id];

            // Add the new marker
            createNewMarker(vehicle,features);
            return;
        }

        let steps = 60; // 60 frames per second

        animateMarker(vehicle, diffLng, diffLat, steps, currentCoordinates).then(() => {
            if (vehicle.properties) {
                let newTimestamp = parseInt(vehicle.properties.timestamp);
                let currentTimestamp = marker.timestamp;

                marker.timestamp = newTimestamp;
            }
        });
    }

    // updateMarkerRotations();
    updatePopup(vehicle);
}

function updatePopup(vehicle) {
	// Get the existing marker
	let marker = markers[vehicle.properties.vehicle_id];

	// Check if the marker has a popup
	let popup = marker.getPopup();
	if (popup) {
		// Determine the label based on the route code
		let vehicleLabel = ['901', '910'].includes(markers[vehicle.properties.vehicle_id].route_code) ? 'Bus ID ' : 'Train Car #';

		// Update the popup's HTML
		popup.setHTML(`
		<div style="display: flex; align-items: center;justify-content:center;">
		<img src="${routeIcons[markers[vehicle.properties.vehicle_id].route_code]}" style="width: 24px; height: 24px; border-radius: 50%;">
		<span></span>
	</div>
			<div style="text-align: center;">${vehicleLabel}${vehicle.properties.vehicle_id}<br>                      
			Data from: ${new Date(markers[vehicle.properties.vehicle_id].timestamp * 1000).toLocaleTimeString()}
			</div>
			`);
	}
}

map.on('rotate', function() {
    // updateMarkerRotations();
});


map.on('zoom', function() {
    // Get the current zoom level
    const zoom = map.getZoom();

    // Calculate the size of the marker and the arrow based on the zoom level
    const markerSize = zoom >= 15 ? 32 : 32 * 0.55;

    // Update the size of each marker
    for (const vehicleId in markers) {
        const marker = markers[vehicleId];
        const el = marker.getElement();

        // Update the size of the marker
        el.style.width = `${markerSize}px`;
        el.style.height = `${markerSize}px`;
    }
});

function updateMarkerRotations() {
    // Get the map's current bearing
    const mapBearing = map.getBearing();

    // Iterate over each marker
    for (const vehicleId in markers) {
        const marker = markers[vehicleId];

        // Get the bearing from the marker object
        const bearing = marker.properties.Heading;

        // Adjust the bearing by 180 degrees
        const adjustedBearing = (bearing) % 360;

        // Calculate the final bearing based on the map's bearing
        const finalBearing = (adjustedBearing - mapBearing);

        // Set the marker's rotation
        marker.setRotation(finalBearing);
    }
}

map.addControl(new HomeControl(), 'top-left');

// Check if Geolocation API is available
if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(function(position) {
        let lat = position.coords.latitude;
        let lng = position.coords.longitude;

        // Check if the user is in Los Angeles County
        if (lat >= LA_COUNTY_BOUNDS.south && lat <= LA_COUNTY_BOUNDS.north && lng >= LA_COUNTY_BOUNDS.west && lng <= LA_COUNTY_BOUNDS.east) {
            // Create a new HTML element for the user's location
            let userLocation = document.createElement("div");
            userLocation.id = "userLocation";
            userLocation.className = "pulsatingIcon";

            // Add the user's location to the map
            // Create a new marker
            let marker = new maplibregl.Marker(userLocation)
                .setLngLat([lng, lat])

            // Zoom in to the user's location
            map.flyTo({center: [lng, lat], zoom: 12});

            // Add a circle to represent the accuracy of the geolocation
            let accuracy = position.coords.accuracy;
            map.addSource('circle', {
                'type': 'geojson',
                'data': {
                    'type': 'FeatureCollection',
                    'features': [{
                        'type': 'Feature',
                        'geometry': {
                            'type': 'Point',
                            'coordinates': [lng, lat]
                        }
                    }]
                }
            });
            map.addLayer({
                'id': 'circle',
                'type': 'circle',
                'source': 'circle',
                'paint': {
                    'circle-radius': accuracy,
                    'circle-color': '#007cbf',
                    'circle-opacity': 0.3
                }
            });
        }
    });
    } else {
    console.log("Geolocation is not supported by this browser.");
    }
    // Add geolocate control to the map.
    let geolocate = new maplibregl.GeolocateControl({
    positionOptions: {
        enableHighAccuracy: true
    },
    trackUserLocation: true
});

map.addControl(geolocate, 'top-left');

// Set the map's center to the user's location once it's available
geolocate.on('geolocate', function(e) {
    map.flyTo({center: [e.coords.longitude, e.coords.latitude], zoom: 14});
});