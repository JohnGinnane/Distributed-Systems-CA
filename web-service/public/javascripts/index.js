//const crypto = require('crypto');

// Immediately open a web socket to the server
// This allows us to stream async data from web
// server to the client's page
const webSocket = new WebSocket('wss://localhost:3001', 'echo-protocol');

// Template rows for robots and locations
const robotRow = `<tr id="tr-robot-__id__" onclick="selectRobot('__id__')">
    <th scope="row">__id__</th>
    <td type="location">__location__</td>
    <td type="heldItem">__heldItem__</td>
    <td type="status">__status__</td>
</tr>`;

const locationRow = `<tr id="tr-location-__id__" onclick="selectLocation('__id__')">
    <th scope="row">__id__</th>
    <td type="locationName">__name__</td>
    <td type="itemCount">__itemCount__</td>
</tr>`

const itemRow = `<tr>
    <th scope="row">__row__</th>
    <td>__name__</td>
</tr>`

// Page-wide variables
let modalSelectLocation;
let modalSelectItem;
var selectedRobotID    = "";
var selectedLocationID = "";

const ITEMS_RECEIVED_EVENT     = "itemsReceived";
const ROBOTS_RECEIVED_EVENT    = "robotsReceived";
const LOCATIONS_RECEIVED_EVENT = "locationsReceived";
const ACKNOWLEDGED_EVENT       = "acknowledged";
var   SERVER_PUBLIC_KEY        = ""; // Set later when web socket connects

const authenticatedEvent       = new Event("authenticated");

function wsSend(data) {
    // Convert object to string
    var strData = JSON.stringify(data);

    // Encrypt with server key
    var encrypted = Crypto.publicEncrypt(SERVER_PUBLIC_KEY, strData);

    console.log(encrypted);
}

webSocket.onopen = (event) => {
    console.log("Web socket opened!");

    // Try to authenticate right away if
    // API key filled in
    authenticate();

    // Add event for when authenticate completes
    document.addEventListener("authenticated", function() {
        listRobots();
        listLocations();
    }, {once: true});

}

function listRobots() {
    var req = {
        key:    $("#input-api-key").val(),
        action: "listRobots"
    }

    webSocket.send(JSON.stringify(req));
}

function listLocations() {
    var req = {
        key: $("#input-api-key").val(),
        action: "listLocations"
    }

    webSocket.send(JSON.stringify(req));
}

function listItems(location) {
    console.log(`getting items for ${location}`);

    var req = {
        key:    $("#input-api-key").val(),
        action: "listItemLocations",
        data:   location
    }

    webSocket.send(JSON.stringify(req));
}

// The server will send back data for:
//   1. Robots
//   2. Locations
//   3. Location Items
//   4. Robot Details
webSocket.onmessage = (event) => {
    var response = JSON.parse(event.data);
    
    // Parse the response from the server
    // Raise events so appropriate handlers
    // will deal with the incoming data for
    // their own needs
    switch (response.type) {
        case "authenticate":
            if (response.result == true) {
                console.log("Successfully authenticated with API key");
                document.dispatchEvent(authenticatedEvent);
            } else {
                console.log("Unable to authenticate API key");
            }

            break;

        // When the web socket connects we expect the server's public key
        case "public_key":
            const SERVER_PUBLIC_KEY = response.public_key;
            break;

        // When the server acknowledges our command lets raise an event
        case "acknowledge":
            document.dispatchEvent(new CustomEvent(ACKNOWLEDGED_EVENT));
            break;

        case "robots":
            document.dispatchEvent(new CustomEvent(ROBOTS_RECEIVED_EVENT, {
                detail: response.data
            }));

            break;

        case "locations":
            document.dispatchEvent(new CustomEvent(LOCATIONS_RECEIVED_EVENT, {
                detail: response.data
            }));

            break;

        case "items":
            // Raise event that we have received a list of items from the server
            document.dispatchEvent(new CustomEvent(ITEMS_RECEIVED_EVENT, {
                detail: response.data
            }));

            break;

        case "robot":
            // Update the selected robot's details
            $("#h5-robot-id").html(response.data.serviceID);
            $("#h5-robot-location").html(response.data.location);
            $("#h5-robot-held-item").html(response.data.heldItem);
            $("#h5-robot-status").html(response.data.status);

            // set these custom attributes so we can extract them later
            // when the button is pressed
            $("#button-move").attr("serviceID", response.data.serviceID);
            $("#button-load-unload").attr("serviceID", response.data.serviceID);

            // Set the text appropriately for loading/unloading an item
            if (response.data.heldItem) {
                $("#button-load-unload").html("Unload");
            } else {
                $("#button-load-unload").html("Load");
            }
            
            break

        default: 
            break;
    }
};

webSocket.onerror = (event) => {
    console.error(event);
}

// When you press authenticate
// check the API key is valid
$("#form-api").on("submit", (event) => {
    event.preventDefault();
    authenticate();

    // Add event for when authenticate completes
    document.addEventListener("authenticated", function() {
        listRobots();
        listLocations();
    }, {once: true});
});

// Authenticate API key
function authenticate() {
    if ($("#input-api-key").val()) {
        var req = {
            key:    $("#input-api-key").val(),
            action: "authenticate"
        }

        webSocket.send(JSON.stringify(req));
    }
}

// Get the details of the selected robot
function selectRobot(robot) {
    selectedRobotID = robot;

    var req = {
        key:    $("#input-api-key").val(),
        action: "getRobotInformation",
        data:   selectedRobotID
    }

    webSocket.send(JSON.stringify(req));
}

// Get the items for the selected 
function selectLocation(location) {
    selectedLocationID = location;
    listItems(selectedLocationID);

    // When the list of items returns after selecting a location
    // we need to handle the event
    document.addEventListener(ITEMS_RECEIVED_EVENT, function(e) {
        var items = e.detail;
        
        // Iterate over the event's details and populate table
        var tableItems = $("#table-items tbody");
        tableItems.empty();

        for (var k = 0; k < items.length; k++) {
            var v = items[k].itemName;

            var newItem = itemRow;
            newItem = newItem.replace("__row__", k+1);
            newItem = newItem.replace("__name__", v);
            tableItems.append(newItem);
        }
    }, {once: true});
}

function moveRobot(e) {
    if (!e) { return; }
    var serviceID = e.getAttribute("serviceid")
    if (!serviceID) { return; }

    // Need to get list of locations from server
    // then prompt person what location to move to
    // Use modal from bootstrap

    // Empty the dropdown in the modal
    $("#select-new-location").empty();
    
    // Request all locations
    // then handle the event when it happens
    // and populate the drop
    var req = {
        key:    $("#input-api-key").val(),
        action: "listLocations"
    }

    webSocket.send(JSON.stringify(req));

    // Update the dropdown when locations come through
    document.addEventListener(LOCATIONS_RECEIVED_EVENT, function(e) {
        var locations = e.detail;

        var selectNewLocation = $("#select-new-location");
        selectNewLocation.empty();

        for (var k = 0; k < locations.length; k++) {
            var v = locations[k];
            selectNewLocation.append(`<option value="${v.locationID}">${v.locationName}</option>`);
        }
    }, {once: true});
    
    var modal = new bootstrap.Modal(modalSelectLocation, {});
    modal.show();    
}

function moveRobotConfirm() {
    // Get selected location and robot and move it
    var robotID = $("#h5-robot-id").html();
    var locationID = $("#select-new-location").find(":selected").text();

    var req = {
        key: $("#input-api-key").val(),
        action: "moveRobot",
        data: {
            serviceID: robotID,
            locationNameOrID: locationID
        }
    }

    webSocket.send(JSON.stringify(req));
}

function loadUnload(e) {
    // Extract the robot ID from the element's "serviceID" attribute
    if (!e) { return; }
    if (!selectedRobotID) { return; }
    
    // Check if we're loading or unloading
    switch (e.textContent.trim().toLowerCase()) {
        case "load":
            var req = {
                key:    $("#input-api-key").val(),
                action: "listItemLocations",
                data:   $("#h5-robot-location").html()
            }
        
            webSocket.send(JSON.stringify(req));

            document.addEventListener(ITEMS_RECEIVED_EVENT, function(e) {
                var items = e.detail;
                
                var selectLoadItem = $("#select-load-item");
                selectLoadItem.empty();

                for (var k = 0; k < items.length; k++) {
                    var v = items[k].itemName;
                    selectLoadItem.append(`<option value="${v}">${v}</option>`);
                }
            }, {once: true});

            var modal = new bootstrap.Modal(modalSelectItem, {});
            modal.show();
            
            break;
        
        case "unload":
            var req = {
                key: $("#input-api-key").val(),
                action: "unloadItem",
                data: {
                    serviceID: selectedRobotID
                }
            }

            webSocket.send(JSON.stringify(req));
            break;
    }

}

function loadItemConfirm() {
    var robotID = $("#h5-robot-id").html();
    var itemName = $("#select-load-item").find(":selected").text();

    var req = {
        key: $("#input-api-key").val(),
        action: "loadItem",
        data: {
            serviceID: robotID,
            itemName: itemName
        }
    }

    webSocket.send(JSON.stringify(req));
}

// Code to run on page load
document.addEventListener("DOMContentLoaded", function() {
    modalSelectLocation = document.getElementById('modal-select-location');
    modalSelectItem     = document.getElementById('modal-select-item');
});

// Every time we get robot data lets parse it
document.addEventListener(ROBOTS_RECEIVED_EVENT, function(e) {
    var robots = e.detail;
    var tableRobots = $("#table-robots tbody");

    tableRobots.empty();

    for (var k = 0; k < robots.length; k++) {
        var v = robots[k];

        // Add to the table
        var newRobot = robotRow;
        newRobot = newRobot.replaceAll("__id__", v.serviceID);
        newRobot = newRobot.replaceAll("__location__", v.location);
        newRobot = newRobot.replaceAll("__heldItem__", v.heldItem);
        newRobot = newRobot.replaceAll("__status__", v.status);
        tableRobots.append(newRobot);

        // Update selected robot if necessary
        if (v.serviceID == selectedRobotID) {
            $("#h5-robot-id").html(v.serviceID);
            $("#h5-robot-location").html(v.location);
            $("#h5-robot-held-item").html(v.heldItem);
            $("#h5-robot-status").html(v.status);
            
            if (v.heldItem) {
                $("#button-load-unload").html("Unload");
            } else {
                $("#button-load-unload").html("Load");
            }
        }
    }
});

// Every time we get location data lets parse it
document.addEventListener(LOCATIONS_RECEIVED_EVENT, function(e) {
    var locations = e.detail;
    var tableLocations = $("#table-locations tbody");
    
    tableLocations.empty();

    for (var k = 0; k < locations.length; k++) {
        var v = locations[k];

        // Add to table
        var newLocation = locationRow;

        newLocation = newLocation.replaceAll("__id__", v.locationID);
        newLocation = newLocation.replaceAll("__name__", v.locationName);
        var itemCount = v.locationItemCount + "/" + v.locationMaxSize;
        newLocation = newLocation.replaceAll("__itemCount__", itemCount);
        tableLocations.append(newLocation);
    }
    
    // Always add to the dropdown in the modal
    $("#select-new-location").append(`<option value="${location.locationID}">${location.locationName}</option>`);
});

// Every time our command is acknowledged then lets get refresh data
document.addEventListener(ACKNOWLEDGED_EVENT, function(e) {
    listRobots();
    listLocations();
    selectRobot(selectedRobotID);
    listItems(selectedLocationID);
    
    // When the list of items returns after selecting a location
    // we need to handle the event
    document.addEventListener(ITEMS_RECEIVED_EVENT, function(e) {
        var items = e.detail;
        
        // Iterate over the event's details and populate table
        var tableItems = $("#table-items tbody");
        tableItems.empty();

        for (var k = 0; k < items.length; k++) {
            var v = items[k].itemName;

            var newItem = itemRow;
            newItem = newItem.replace("__row__", k+1);
            newItem = newItem.replace("__name__", v);
            tableItems.append(newItem);
        }
    }, {once: true});
});