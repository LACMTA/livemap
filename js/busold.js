// hide the alert
document.querySelector('.alert').style.display = 'none';
// config options
const ESRI_KEY = "AAPKccc2cf38fecc47649e91529acf524abflSSkRTjWwH0AYmZi8jaRo-wdpcTf6z67CLCkOjVYlw3pZyUIF_Y4KGBndq35Y02z";
const MAPTILER_KEY = "KydZlIiVFdYDFFfQ4QYq"
const basemapEnum = "65aff2873118478482ec3dec199e9058";
let timer = setTimeout(() => {
	document.getElementById('loading').innerHTML = "Sorry, loading timed out: we're currently unable to load data. Please check your connection or try again later.";
}, 25000); // 25 seconds
let hasAdjustedBounds = false;
// Declare a global variable to store the route shapes data
let routeShapesData;
let currentRoute;
// Create a map of vehicle IDs to markers
let markers = {};

// Get the current time
const now = new Date();

// Convert the current time to PST
let pst = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));

// Get the current hour in PST
let hour = pst.getHours();

// map setup
let map = new maplibregl.Map({
	container: 'map',
	center: [-118.25133692966446, 34.05295151499077],
	zoom: 9,
	pitch: 20,
	bearing: 0,
	container: 'map',
	antialias: true,
	minZoom: 8, // Minimum zoom level
	style: `https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/items/${basemapEnum}?token=${ESRI_KEY}`,
});


// The 'building' layer in the streets vector source contains building-height
// data from OpenStreetMap.
map.on('load', () => {
	// Insert the layer beneath any symbol layer.
	const layers = map.getStyle().layers;
	map.addSource('bus', {
		'type': 'vector',
		'tiles': ['https://lacmta.github.io/vectortiles/bus/{z}/{x}/{y}.pbf']
	});


	map.addLayer({
		'id': 'bus',
		'type': 'line',
		'source': 'bus',
		'source-layer': 'flattened_bus', // This should be the name of the layer in your vector tiles
		'layout': {},
		'paint': {
			'line-color': '#E16710',
			'line-width': 2
		}
	});
	let labelLayerId;
	for (let i = 0; i < layers.length; i++) {
		if (layers[i].type === 'symbol' && layers[i].layout['text-field']) {
			labelLayerId = layers[i].id;
			break;
		}
	}
	new mapboxglEsriSources.TiledMapService('imagery-source', map, {
		url: 'https://tiles.arcgis.com/tiles/TNoJFjk1LsD45Juj/arcgis/rest/services/Map_RGB_Vector_Offset_RC5/MapServer'
	})

	map.addLayer({
		id: 'imagery-layer',
		type: 'raster',
		source: 'imagery-source'
	})
	// Get the current URL
	let currentUrl = new URL(window.location.href);

	// Get the route code from the URL parameters
	let routeCode = currentUrl.searchParams.get("route");
	let socket;

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

	//////////////////////////
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
	let intervalId;
	function calculateBounds(features) {
		return features.reduce((bounds, feature) => {
			const coordinates = feature.geometry.coordinates;
			if (Array.isArray(coordinates) && coordinates.length === 2 && !isNaN(coordinates[0]) && !isNaN(coordinates[1])) {
				return bounds.extend(coordinates);
			} else {
				return bounds;
			}
		}, new maplibregl.LngLatBounds(features[0].geometry.coordinates, features[0].geometry.coordinates));
	}

	function fetchData(route = 2) {
		const currentUrl = new URL(window.location.href);
		const routeCode = route || currentUrl.searchParams.get("route");
		currentRoute = routeCode;
		const apiUrl = routeCode
			? `https://api.metro.net/LACMTA/vehicle_positions/route_code/${routeCode}?format=geojson`
			: 'https://api.metro.net/LACMTA/vehicle_positions?format=geojson';
		return Promise.all([
			fetch(apiUrl).then(response => response.json()),
		])
			.then(([data1]) => {
				console.log(data1); // Keep this line to inspect the API response

				const features = getFeaturesFromData(data1);
				const data = { features: [...features] };

				clearTimeout(timer);
				let newVehicleIds = new Set(data.features.map(vehicle => vehicle.properties.vehicle_id));

				removeOldMarkers(newVehicleIds, data);
				processVehicleData(data, features);
				updateMap(features); // This will now also calculate bounds and zoom map
				updateUI();

			})
			.catch(error => {
				handleError(error);
			});
	}

	function removeOldMarkers(newVehicleIds, data) {
		if (data.features.length > 0) {
			for (let vehicle_id in markers) {
				if (!newVehicleIds.has(vehicle_id)) {
					markers[vehicle_id].remove();
					delete markers[vehicle_id];
				}
			}
		}
	}

	function processVehicleData(data, features) {
		data.features.filter(vehicle => vehicle.properties && vehicle.properties.trip_id).forEach(vehicle => {
			if (markers[vehicle.properties.vehicle_id]) {
				updateExistingMarker(vehicle);
			} else {
				createNewMarker(vehicle, features);
			}
		});
	}

	function updateExistingMarker(vehicle) {
		let currentCoordinates = markers[vehicle.properties.vehicle_id].getLngLat();

		if (vehicle.geometry && vehicle.geometry.coordinates) {
			let diffLng = vehicle.geometry.coordinates[0] - currentCoordinates.lng;
			let diffLat = vehicle.geometry.coordinates[1] - currentCoordinates.lat;
			let distance = Math.sqrt(diffLng * diffLng + diffLat * diffLat);

			let steps = 9000 / 60; // 60 frames per second

			if (distance > 0.001) { // Adjust this value as needed
				let lngStep = diffLng / steps;
				let latStep = diffLat / steps;

				if (vehicle.properties) {
					markers[vehicle.properties.vehicle_id].properties.Heading = vehicle.properties.position_bearing;
				}

				let i = 0;
				function animateMarker() {
					if (i <= steps) {
						let progress = i / steps;
						let easedProgress = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

						markers[vehicle.properties.vehicle_id].setLngLat([
							currentCoordinates.lng + easedProgress * diffLng,
							currentCoordinates.lat + easedProgress * diffLat
						]);

						requestAnimationFrame(animateMarker);
					}

					i++;
				}
				animateMarker();
			}

			if (vehicle.properties) {
				let newTimestamp = vehicle.properties.timestamp;
				markers[vehicle.properties.vehicle_id].timestamp = newTimestamp;
			}
		}
	}

	function createNewMarker(vehicle, features) {
		const wrapper = document.createElement('div');
		wrapper.className = 'wrapper';
		const el = document.createElement('div');
		el.className = 'marker';

		const iconUrl = 'https://raw.githubusercontent.com/LACMTA/metro-iconography/main/Arrow.svg';
		el.style.background = `url(${iconUrl}) no-repeat center/cover`;

		const heading = vehicle.properties.position_bearing;
		wrapper.style.transform = `rotateZ(${heading}deg)`;

		map.triggerRepaint();

		el.style.backgroundRepeat = 'no-repeat';
		el.style.backgroundSize = 'cover';
		el.style.backgroundPosition = 'center';
		el.style.backgroundColor = 'white';
		el.style.borderRadius = '50%';
		el.style.cursor = 'pointer';

		const zoom = map.getZoom();
		const size = zoom >= 15 ? 40 : 40 * 0.5; // Increased size to 40px

		el.style.width = `${size}px`;
		el.style.height = `${size}px`;

		wrapper.appendChild(el);

		const popup = new maplibregl.Popup()
			.setHTML(`
<div style="display: flex; align-items: center; justify-content: center;">
<span><b>${vehicle.properties.route_code}</b></span>
</div>
Data from ${new Date(vehicle.properties.timestamp * 1000).toLocaleTimeString()}`);

		const marker = new maplibregl.Marker({ element: wrapper })
			.setLngLat(vehicle.geometry.coordinates)
			.setPopup(popup) // Set the popup
			.addTo(map);

		marker.bearing = vehicle.properties.position_bearing;
		marker.properties = {
			vehicle_id: vehicle.properties.vehicle_id,
			Heading: vehicle.properties.position_bearing
		};
		marker.timestamp = vehicle.properties.timestamp;
		marker.route_code = vehicle.properties.route_code;

		markers[vehicle.properties.vehicle_id] = marker;
		updateMarkerRotations();

		const feature = {
			type: 'Feature',
			geometry: {
				type: 'Point',
				coordinates: [vehicle.geometry[0], vehicle.geometry[1]]
			},
			properties: {
				vehicle_id: vehicle.properties.vehicle_id,
				Heading: vehicle.properties.position_bearing

			}
		};
		features.push(feature);
	}

	function updateMap(features) {
		map.getSource('vehicles').setData({
			type: 'FeatureCollection',
			features: features
		});
		// Calculate bounds and zoom map after markers are rendered
		if (!hasAdjustedBounds) {
			const bounds = calculateBounds(features);
			map.fitBounds(bounds, { padding: 70 });
		}
	}

	function updateUI() {
		const now = new Date();
		const updateTimeDiv = document.getElementById('update-time');
		updateTimeDiv.textContent = `Updated at ${now.toLocaleTimeString()}`;
		updateTimeDiv.style.fontSize = '12px';

		let pst = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
		let hour = pst.getHours();

		if (Object.keys(markers).length > 1) {
			hideLoadingDiv();
		}
	}

	function handleError(error) {
		console.error('==error==');
		console.error(error);
		document.getElementById('loading').style.display = 'block';
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

	// Fetch data when the page loads
	fetchData();
	// Fetch data every 9000 milliseconds


	function startFetchingData(route) {
		// Clear the existing interval
		if (intervalId) {
			clearInterval(intervalId);
		}

		// Start a new interval
		intervalId = setInterval(() => {
			fetchData(route);
		}, 9000);
	}
	let select = document.getElementById('route-select');
	// Call startFetchingData whenever the route changes
	async function clearAllMarkersAndFetchNew(route) {
		// Clear all markers
		for (let vehicle_id in markers) {
			markers[vehicle_id].remove();
			delete markers[vehicle_id];
		}

		// Fetch and process new data
		const features = await fetchData(route);

		// Update the map to fit the new markers
		updateMap(features);

		// Fit the map to the bounds of the new markers

		const bounds = calculateBounds(features);
		map.fitBounds(bounds, { padding: 70 });
	}
	select.addEventListener('change', function () {
		const route = this.value;
		if (route) {
			clearAllMarkersAndFetchNew(route);
		}
	});
	//window.setInterval(fetchData, 9000);

	// Define a function to hide the loading div
	function hideLoadingDiv() {
		document.getElementById('loading').style.display = 'none';
	}


	// Call the updateArrow function whenever the map moves
	let features = [];
	map.addSource('openmaptiles', {
		url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${MAPTILER_KEY}`,
		type: 'vector',
	});


	map.addLayer({
		'id': 'vehicles',
		'type': 'symbol',
		'source': 'vehicles',
		'layout': {
			'icon-image': 'rail',
			'icon-allow-overlap': true,
			'icon-ignore-placement': true
		}
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
					['get', 'render_height'], 0, 'lightgray', 200, 'hsl(38, 28%, 77%)', 400, 'hsl(38, 28%, 77%)'
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
				center: [-118.25133692966446, 34.05295151499077],
				zoom: 9,
				pitch: 20,
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

window.onload = function () {
	const legend = document.getElementById('legend');
	const toggleLegend = document.getElementById('toggle-legend');

	if (legend && toggleLegend) {
		legend.addEventListener('click', function () {
			this.classList.toggle('hidden');

			// Change the icon based on the visibility
			toggleLegend.innerHTML = this.classList.contains('hidden') ? '<i class="fas fa-chevron-right"></i>' : '<i class="fas fa-chevron-left"></i>';
		});
	} else {
		console.error('Element not found');
	}
};
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
        console.error("WebSocket error: ", error);
        // Optionally, update the UI to show the error
    };

    socket.onclose = function(event) {
        console.log("WebSocket connection closed");
        // Optionally, attempt to reconnect or update the UI accordingly
    };

    socket.onmessage = function(event) {
        let data = JSON.parse(event.data);
        // Store the data with the current timestamp
        dataStore[data.id] = {
            data: data,
            timestamp: Date.now()
        };

        // Process the data if a processData function is provided
        if (processData) {
            processData(data);
        }
    };

    // Function to clean up old data
    function cleanupData() {
        let now = Date.now();
        for (let id in dataStore) {
            // If the data is older than 2 minutes, delete it
            if (now - dataStore[id].timestamp > 120000) {
                delete dataStore[id];
            }
        }
    }

    // Run the cleanup function every minute
    setInterval(cleanupData, 60000);
}

function defineDefaultValue() {
    let currentUrl = new URL(window.location.href);
    let thisrouteCode = currentUrl.searchParams.get("route");
    console.log(thisrouteCode);
    if (thisrouteCode != null) {
        let buttonElement = document.querySelector('.choices__button'); // Select the button element
        if (buttonElement) {
            buttonElement.setAttribute('data-value', thisrouteCode); // Set the data-value attribute to the route code
        }
        return thisrouteCode;
    } else {
        return 'Select a route';
    }
}

function createRouteSelect(map) {
    const select = document.getElementById('route-select');
    let defaultValue = defineDefaultValue();

    // Add a placeholder option
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.text = defaultValue;
    placeholderOption.selected = true;
    placeholderOption.disabled = true;
    select.appendChild(placeholderOption);

    // Setup WebSocket connection
    setupWebSocket('wss://api.metro.net/ws/LACMTA/vehicle_positions/', (data) => {
        // Assuming data.routes contains an array of route codes
        if (data && data.routes) {
            data.routes.forEach(route => {
                const option = document.createElement('option');
                option.value = route;
                option.text = route;
                select.appendChild(option);
            });
        }
    });

    select.addEventListener('change', function () {
        const route = this.value;
        if (route) {
            // Assuming that the route data is added to the map as a layer and a source
            if (map.getLayer('route')) {
                map.removeLayer('route');
            }
            if (map.getSource('route')) {
                map.removeSource('route');
            }

            // Setup WebSocket for specific route
            setupWebSocket(`wss://api.metro.net/ws/LACMTA/vehicle_positions/${route}`, (data) => {
                // Assuming data contains GeoJSON for the route
                if (data && data.geojson) {
                    map.addSource('route', {
                        type: 'geojson',
                        data: data.geojson
                    });

                    map.addLayer({
                        id: 'route',
                        type: 'line',
                        source: 'route',
                        layout: {},
                        paint: {
                            'line-color': '#888',
                            'line-width': 8
                        }
                    });
                } else {
                    console.error('No data for route:', route);
                }
            });
        }
    });
}

// Call the function
createRouteSelect(map);