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
var storeLocationDataUrl = 'data/ContosoCoffee.txt';

//The URL to the icon image.
var iconImageUrl = 'images/CoffeeIcon.png';
var map, popup, datasource, iconLayer, centerMarker, searchURL;

function initialize() {
    //Initialize a map instance.
    map = new atlas.Map('myMap', {
        center: [-90, 40],
        zoom: 2,

        //Add your Azure Maps subscription key to the map SDK.
        authOptions: {
            authType: 'subscriptionKey',
            subscriptionKey: '<Your Azure Maps Key>'
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
    document.getElementById('searchBtn').onclick = performSearch;

    //If the user presses Enter in the search box, perform a search.
    document.getElementById('searchTbx').onkeyup = function(e) {
        if (e.keyCode === 13) {
            performSearch();
        }
    };

    //If the user selects the My Location button, use the Geolocation API to get the user's location. Center and zoom the map on that location.
    document.getElementById('myLocationBtn').onclick = setMapToUserLocation;

    //Wait until the map resources are ready.
    map.events.add('ready', function() {

   		//Add your post-map load functionality.
      //Add a zoom control to the map.
      map.controls.add(new atlas.control.ZoomControl(), {
        position: 'top-right'
      });

  //Add an HTML marker to the map to indicate the center to use for searching.
      centerMarker = new atlas.HtmlMarker({
        htmlContent: '<div class="mapCenterIcon"></div>',
        position: map.getCamera().center
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

    });
}

//Create an array of country ISO 2 values to limit searches to.
var countrySet = ['USA'];

function performSearch() {
    var query = document.getElementById('searchTbx').value;

    //Perform a fuzzy search on the users query.
    searchURL.searchFuzzy(atlas.service.Aborter.timeout(3000), query, {
        //Pass in the array of country ISO2 for which we want to limit the search to.
        countrySet: countrySet
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
    navigator.geolocation.getCurrentPosition(function(position) {
        //Convert the Geolocation API position to a longitude and latitude position value that the map can interpret and center the map over it.
        map.setCamera({
            center: [position.coords.longitude, position.coords.latitude],
            zoom: maxClusterZoomLevel + 1
        });
    }, function(error) {
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
