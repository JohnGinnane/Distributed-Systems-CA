// Immediately open a web socket to the server
// This allows us to stream async data from web
// server to the client's page
const webSocket = new WebSocket("ws://localhost:3001/", "echo-protocol");

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

var locations = [];

const ITEMS_RECEIVED_EVENT     = "itemsReceived";
const ROBOTS_RECEIVED_EVENT    = "robotsReceived";
const LOCATIONS_RECEIVED_EVENT = "locationsReceived";

const authenticatedEvent = new Event("authenticated");

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
    switch (response.type) {
        case "authenticate":
            if (response.result == true) {
                console.log("Successfully authenticated with API key");
                document.dispatchEvent(authenticatedEvent);
            } else {
                console.log("Unable to authenticate API key");
            }

            break;

        case "robots":
            document.dispatchEvent(new CustomEvent(ROBOTS_RECEIVED_EVENT, {
                detail: response.data
            }));

            break;

        case "locations":
            var location = response.data;
            var tableLocations = $("#table-locations tbody");
            
            // Check if location is already in our list
            var locationIndex = locations.findIndex((x) => x.locationID == location.locationID);

            if (locationIndex > -1) {
                locations[locationIndex].locationID = location.locationID;
                locations[locationIndex].locationName = location.locationName;
                locations[locationIndex].locationItemCount = location.locationItemCount;
                locations[locationIndex].locationMaxSize = location.locationMaxSize;

                // Update row on table
                var existingRow = $("#table-locations tbody tr#tr-location-" + location.locationID);
                existingRow.find("td[type='locationName']").html(location.locationName);
                var itemCount = location.locationItemCount + "/" + location.locationMaxSize;
                existingRow.find("td[type='itemCount']").html(itemCount);
            } else {
                locations.push(location);
                
                // Add new location to table
                var newLocation = locationRow;

                newLocation = newLocation.replaceAll("__id__", location.locationID);
                newLocation = newLocation.replaceAll("__name__", location.locationName);
                var itemCount = location.locationItemCount + "/" + location.locationMaxSize;
                newLocation = newLocation.replaceAll("__itemCount__", itemCount);
                tableLocations.append(newLocation);
            }

            // Always add to the dropdown in the modal
            $("#select-new-location").append(`<option value="${location.locationID}">${location.locationName}</option>`);
            
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
    console.log("Move robot!");
    if (!e) { return; }
    var serviceID = e.getAttribute("serviceid")
    if (!serviceID) { return; }

    // Need to get list of locations from server
    // then prompt person what location to move to
    // Use modal from bootstrap

    // Empty the dropdown in the modal
    $("#select-new-location").empty();    
    
    // Update our locations, this will remake the dropdown items
    var req = {
        key:    $("#input-api-key").val(),
        action: "listLocations"
    }

    webSocket.send(JSON.stringify(req));
    
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

            // Refresh our data
            listRobots();
            listLocations();

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