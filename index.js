// const http = require('http');
//
// const server = http.createServer((request, response) => {
//     response.writeHead(200, {"Content-Type": "text/plain"});
//     response.end("Hello World!");
// });
//
// const port = process.env.PORT || 1337;
// server.listen(port);
//
// console.log("Server running at http://localhost:%d", port);

//The maximum zoom level to cluster data point data on the map.
var maxClusterZoomLevel = 11;

//The URL to the store location data.
var centerLocationDataUrl = 'data/HealthCareProviders.txt';
//var listItemTemplate = '<div class="listItem" onclick="itemSelected(\'{id}\')"><div class="listItem-title">{title}</div>{city}<br />Open until {closes}<br />{distance} miles away</div>';

//Create an array of country ISO 2 values to limit searches to.
var countrySet = ['US'];

var providerSet = ['Hollywood Health Center', 'Marina OBGYN', 'UCLA Rape Treatment Center', 
                   'Plaza Towers OBGYN', 'Claris Health', 'Dorothy Hecht Health Center', 
                   'Cedars-Sinai OBGYN', 'Bixby Health Center', 'Planned Parenthood of Baldwin Hills', 
                   'Planned Parenthood of Crenshaw', 'Planned Parenthood of Baldwin Hills/Crenshaw', 
                   'East Los Angeles Health Center', 'Eagle Rock Health Center'];

//The URL to the icon image.
var iconImageUrl = 'images/gynow_heart.png';
var map, popup, datasource, iconLayer, centerMarker, searchURL;

function initialize() {
    //Initialize a map instance.
    map = new atlas.Map('myMap', {
        center: [34, -118],
        zoom: 2,
        style: 'road',

        //Add your Azure Maps subscription key to the map SDK.
        authOptions: {
            authType: 'subscriptionKey',
            subscriptionKey: '5S4l4D76x5CUADU8f6F3PDm4e_-5W01imvbcz0Uj85c'
        }
    });

    //Create a pop-up window, but leave it closed so we can update it and display it later.
    popup = new atlas.Popup();

    //Use SubscriptionKeyCredential with a subscription key
    const subscriptionKeyCredential = new atlas.service.SubscriptionKeyCredential(atlas.getSubscriptionKey());

    //Use subscriptionKeyCredential to create a pipeline
    const pipeline = atlas.service.MapsURL.newPipeline(subscriptionKeyCredential, {
        retryOptions: { maxTries: 4 }, // Retry options
    });

    //Create an instance of the SearchURL client.
    searchURL = new atlas.service.SearchURL(pipeline);

    //If the user selects the search button, geocode the value the user passed in.
    document.getElementById('searchBtn').onclick = setMapToUserLocation;

    //If the user presses Enter in the search box, perform a search.
    document.getElementById('searchTbx').onkeyup = function (e) {
        if (e.keyCode === 13) {
            setMapToUserLocation();
        }
    };

    //If the user selects the My Location button, use the Geolocation API to get the user's location. Center and zoom the map on that location.
    document.getElementById('myLocationBtn').onclick = setMapToUserLocation;

    //Wait until the map resources are ready.
    map.events.add('ready', function () {

        //Add your post-map load functionality.
        //Add a zoom control to the map.
        map.controls.add(new atlas.control.ZoomControl(), {
            position: 'top-right'
        });

        //Add an HTML marker to the map to indicate the center to use for searching.
        centerMarker = new atlas.HtmlMarker({
            htmlContent: '<div class="mapCenterIcon"></div>',
            position: map.getCamera().setMapToUserLocation
        });

        map.markers.add(centerMarker);

        //Create a data source, add it to the map, and then enable clustering.
        datasource = new atlas.source.DataSource(null, {
            cluster: true,
            clusterMaxZoom: maxClusterZoomLevel - 1
        });

        map.sources.add(datasource);

        //Load all the store data now that the data source is defined.
        loadStoreData();

        //Create a bubble layer to render clustered data points.
        var clusterBubbleLayer = new atlas.layer.BubbleLayer(datasource, null, {
            radius: 12,
            color: '#007faa',
            strokeColor: 'white',
            strokeWidth: 2,
            filter: ['has', 'point_count'] //Only render data points that have a point_count property; clusters have this property.
        });

        //Create a symbol layer to render the count of locations in a cluster.
        var clusterLabelLayer = new atlas.layer.SymbolLayer(datasource, null, {
            iconOptions: {
                image: 'none' //Hide the icon image.
            },

            textOptions: {
                textField: '{point_count_abbreviated}',
                size: 12,
                font: ['StandardFont-Bold'],
                offset: [0, 0.4],
                color: 'white'
            }
        });

        map.layers.add([clusterBubbleLayer, clusterLabelLayer]);

        //Load a custom image icon into the map resources.
        map.imageSprite.add('myCustomIcon', iconImageUrl).then(function () {

            //Create a layer to render a heart symbol above each bubble for an individual location.
            iconLayer = new atlas.layer.SymbolLayer(datasource, null, {
                iconOptions: {
                    //Pass in the ID of the custom icon that was loaded into the map resources.
                    image: 'myCustomIcon',

                    //Optionally, scale the size of the icon.
                    font: ['SegoeUi-Bold'],

                    //Anchor the center of the icon image to the coordinate.
                    anchor: 'center',

                    //Allow the icons to overlap.
                    allowOverlap: true
                },

                filter: ['!', ['has', 'point_count']] //Filter out clustered points from this layer.
            });

            map.layers.add(iconLayer);
            console.log("Layers list is:" + map.layers);

            //When the mouse is over the cluster and icon layers, change the cursor to a pointer.
            map.events.add('mouseover', [clusterBubbleLayer, iconLayer], function () {
                map.getCanvasContainer().style.cursor = 'pointer';
            });

            //When the mouse leaves the item on the cluster and icon layers, change the cursor back to the default (grab).
            map.events.add('mouseout', [clusterBubbleLayer, iconLayer], function () {
                map.getCanvasContainer().style.cursor = 'grab';
            });

            //Add a click event to the cluster layer. When the user selects a cluster, zoom into it by two levels.
            map.events.add('click', clusterBubbleLayer, function (e) {
                map.setCamera({
                    center: e.position,
                    zoom: map.getCamera().zoom + 2
                });
            });

            //Add a click event to the icon layer and show the shape that was selected.
            map.events.add('click', iconLayer, function (e) {
                showPopup(e.shapes[0]);
            });

            //Add an event to monitor when the map is finished rendering the map after it has moved.
            map.events.add('render', function () {
                //Update the data in the list.
                updateListItems();
            });
        });
    });
}


function loadStoreData() {

    //Download the store location data.
    fetch(centerLocationDataUrl)
        .then(response => response.text())
        .then(function (text) {

            //Parse the tab-delimited file data into GeoJSON features.
            var features = [];

            //Split the lines of the file.
            var lines = text.split('\n');
            console.log("lines are: " + lines);

            //Grab the header row.
            var row = lines[0].split('\t');
            console.log("row is: " + row);

            //Parse the header row and index each column to make the code for parsing each row easier to follow.
            var header = {};
            var numColumns = row.length; //11
            for (var i = 0; i < row.length; i++) {
                console.log("row's length is: " + i);
                header[row[i]] = i;
                console.log("header is: " + header[row[i]]);
            }

            //Skip the header row and then parse each row into a GeoJSON feature.
            for (var i = 1; i < lines.length; i++) {
                row = lines[i].split('\t');

                //Ensure that the row has the correct number of columns.
                if (row.length >= numColumns) {

                    features.push(new atlas.data.Feature(new atlas.data.Point([parseFloat(row[header['Longitude']]), parseFloat(row[header['Latitude']])]), {
                        Name: row[header['Name']],
                        AddressLine: row[header['AddressLine']],
                        City: row[header['City']],
                        AdminDivision: row[header['AdminDivision']],
                        Country: row[header['Country']],
                        PostCode: row[header['PostCode']],
                        Phone: row[header['Phone']],
                        Opens: parseInt(row[header['Opens']]),
                        Closes: parseInt(row[header['Closes']])
                    }));
										console.log("Name:" + features['Name']);
										console.log("Opens:" + features['Opens']);
										console.log("Closes:" + features['Closes'])
                }
            }

            //Add the features to the data source.
            datasource.add(new atlas.data.FeatureCollection(features));

            //Initially, update the list items.
            updateListItems();
        });
}

function updateListItems() {
    //Hide the center marker.
    centerMarker.setOptions({
        visible: false
    });

    //Get the current camera and view information for the map.
    var camera = map.getCamera();
    var listPanel = document.getElementById('listPanel');

    //Get all the shapes that have been rendered in the bubble layer.
    //console.log(iconLayer.bbox);
    //console.log(map.layers[0].bbox);
    var data = map.layers.getRenderedShapes(map.getCamera().bounds, [iconLayer]);

    data.forEach(function (shape) {
        if (shape instanceof atlas.Shape) {
            //Calculate the distance from the center of the map to each shape, and then store the data in a distance property.
            shape.distance = atlas.math.getDistanceTo(camera.center, shape.getCoordinates(), 'miles');
        }
    });

    //Sort the data by distance.
    data.sort(function (x, y) {
        return x.distance - y.distance;
    });

    //Check to see whether the user is zoomed out a substantial distance. If they are, tell the user to zoom in and to perform a search or select the My Location button.
    if (camera.zoom < maxClusterZoomLevel) {
        //Close the pop-up window; clusters might be displayed on the map.
        popup.close();
        listPanel.innerHTML = '<div class="statusMessage">Search for a location, zoom the map, or select the My Location button to see individual locations.</div>';
    } else {
        //Update the location of the centerMarker property.
        centerMarker.setOptions({
            position: camera.center,
            visible: true
        });

        //List the ten closest locations in the side panel.
        var html = [], properties;

        /*
        Generating HTML for each item that looks like this:
        <div class="listItem" onclick="itemSelected('id')">
            <div class="listItem-title">1 Microsoft Way</div>
            Redmond, WA 98052<br />
            Open until 9:00 PM<br />
            0.7 miles away
        </div>
        */

        data.forEach(function (shape) {
            properties = shape.getProperties();
            html.push('<div class="listItem" onclick="itemSelected(\'', shape.getId(), '\')"><div class="listItem-title">',
                properties['Name'],

                '</div>',
                
                '<div>',
                properties['AddressLine'],
                '</div>',
                //Get a formatted addressLine2 value that consists of City, Municipality, AdminDivision, and PostCode.
                getAddressLine2(properties),
                '<br />',

                //Convert the closing time to a format that is easier to read.
                getOpenTime(properties),
                '<br />',

                //Route the distance to two decimal places.
                (Math.round(shape.distance * 100) / 100),
                ' miles away</div>');
        });

        listPanel.innerHTML = html.join('');

        //Scroll to the top of the list panel in case the user has scrolled down.
        listPanel.scrollTop = 0;
    }
}

//This converts a time that's in a 24-hour format to an AM/PM time or noon/midnight string.
function getOpenTime(properties) {
    var time = properties['Opens'];
    console.log(time);
    var t = time / 100;
    var sTime;

    if (time === 1200) {
        sTime = 'noon';
    } else if (time === 0 || time === 2400) {
        sTime = 'midnight';
    } else {
        sTime = Math.round(t).toString() + ':';

        //Get the minutes.
        t = (t - Math.round(t)) * 100;

        if (t === 0) {
            sTime += '00';
        } else if (t < 10) {
            sTime += '0' + t.toString();
        } else {
            sTime += Math.round(t).toString();
        }

        if (time < 1200) {
            sTime += ' AM';
        } else {
            sTime += ' PM';
        }
    }
    console.log(sTime);

    return 'Opens at ' + sTime;
}

//This converts a time that's in a 24-hour format to an AM/PM time or noon/midnight string.
function getOpenTillTime(properties) {
    var time = properties['Closes'];
    console.log(time);
    var t = time / 100;
    var sTime;

    if (time === 1200) {
        sTime = 'noon';
    } else if (time === 0 || time === 2400) {
        sTime = 'midnight';
    } else {
        sTime = Math.round(t).toString() + ':';

        //Get the minutes.
        t = (t - Math.round(t)) * 100;

        if (t === 0) {
            sTime += '00';
        } else if (t < 10) {
            sTime += '0' + t.toString();
        } else {
            sTime += Math.round(t).toString();
        }

        if (time < 1200) {
            sTime += ' AM';
        } else {
            sTime += ' PM';
        }
    }
    console.log(sTime);

    return 'Open until ' + sTime;
}

//When a user clicks on a result in the side panel, look up the shape by its id value and show popup.
function itemSelected(id) {
    //Get the shape from the data source using it's id. 
    var shape = datasource.getShapeById(id);
    showPopup(shape);

    //Center the map over the shape on the map.
    var center = shape.getCoordinates();
    var offset;

    //If the map is less than 700 pixels wide, then the layout is set for small screens.
    if (map.getCanvas().width < 700) {
        //When the map is small, offset the center of the map relative to the shape so that there is room for the popup to appear.
        offset = [0, -80];
    }

    map.setCamera({
        center: center,
        centerOffset: offset
    });
}

function showPopup(shape) {
    var properties = shape.getProperties();

    /*
        Generating HTML for the popup that looks like this:
         <div class="storePopup">
                <div class="popupTitle">
                    3159 Tongass Avenue
                    <div class="popupSubTitle">Ketchikan, AK 99901</div>
                </div>
                <div class="popupContent">
                    Open until 22:00 PM<br/>
                    <img title="Phone Icon" src="images/PhoneIcon.png">
                    <a href="tel:1-800-XXX-XXXX">1-800-XXX-XXXX</a>
                    <br>Amenities:
                    <img title="Wi-Fi Hotspot" src="images/WiFiIcon.png">
                    <img title="Wheelchair Accessible" src="images/WheelChair-small.png">
                </div>
            </div>
     */

    var html = ['<div class="storePopup">'];

    html.push('<div class="popupTitle">',
        properties['Name'],
        '<div class="popupSubTitle">',
        getAddressLine2(properties),
        '</div></div><div class="popupContent">',

        //Convert the closing time into a nicely formated time.
        '<br>',
				getOpenTime(properties),
				'<br>',
        // '<br>',
        // properties['Opens'],
        // '<br>',

        //Route the distance to 2 decimal places. 
        '<br/>', (Math.round(shape.distance * 100) / 100),
        ' miles away',
        '<br /><img src="images/PhoneIcon.png" title="Phone Icon"/><a href="tel:',
        properties['Phone'],
        '">', 
        properties['Phone'],
        '</a>'
    );
/*
    if (properties['IsWiFiHotSpot'] || properties['IsWheelchairAccessible']) {
        html.push('<br/>Amenities: ');

        if (properties['IsWiFiHotSpot']) {
            html.push('<img src="images/WiFiIcon.png" title="Wi-Fi Hotspot"/>')
        }

        if (properties['IsWheelchairAccessible']) {
            html.push('<img src="images/WheelChair-small.png" title="Wheelchair Accessible"/>')
        }
    }
*/
    html.push('</div></div>');

    //Update the content and position of the popup for the specified shape information.
    popup.setOptions({
        //Create a table from the properties in the feature.
        content:  html.join(''),
        position: shape.getCoordinates()
    });

    //Open the popup.
    popup.open(map);
}

//Create an addressLine2 string that contains City, Municipality, AdminDivision, and PostCode.
function getAddressLine2(properties) {
    var html = [properties['City']];
    /*
        if (properties['Municipality']) {
            html.push(', ', properties['Municipality']);
        }*/

    if (properties['AdminDivision']) {
        html.push(', ', properties['AdminDivision']);
    }

    if (properties['PostCode']) {
        html.push(' ', properties['PostCode']);
    }

    return html.join('');
}

function performSearch() {
    var query = document.getElementById('searchTbx').value;

    //Perform a fuzzy search on the users query.
    searchURL.searchFuzzy(atlas.service.Aborter.timeout(3000), query, {
        //Pass in the array of country ISO2 for which we want to limit the search to.
        providerSet: providerSet
    }).then(results => {
        //Parse the response into GeoJSON so that the map can understand.
        var data = results.geojson.getFeatures();

        if (data.features.length > 0) {
            //Set the camera to the bounds of the results.
            map.setCamera({
                bounds: data.features[0].bbox,
                padding: 40
            });
        } else {
            document.getElementById('listPanel').innerHTML = '<div class="statusMessage">Unable to find the location you searched for.</div>';
        }
    });
}

function setMapToUserLocation() {
    //Request the user's location.
    navigator.geolocation.getCurrentPosition(function (position) {
        //Convert the Geolocation API position to a longitude and latitude position value that the map can interpret and center the map over it.
        map.setCamera({
            center: [position.coords.longitude, position.coords.latitude],
            zoom: maxClusterZoomLevel + 1
        });
    }, function (error) {
        //If an error occurs when the API tries to access the user's position information, display an error message.
        switch (error.code) {
            case error.PERMISSION_DENIED:
                alert('User denied the request for geolocation.');
                break;
            case error.POSITION_UNAVAILABLE:
                alert('Position information is unavailable.');
                break;
            case error.TIMEOUT:
                alert('The request to get user position timed out.');
                break;
            case error.UNKNOWN_ERROR:
                alert('An unknown error occurred.');
                break;
        }
    });
}

//Initialize the application when the page is loaded.
window.onload = initialize;
