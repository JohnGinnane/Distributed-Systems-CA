// Immediately open a web socket to the server
// This allows us to stream async data from web
// server to the client's page
const webSocket = new WebSocket("ws://localhost:3001/", "echo-protocol");

// Template rows for robots and locations
const robotRow = `<tr id="tr-robot-__id__" onclick="selectRobot('__id__')">
    <th scope="row">__id__</th>
    <td>__location__</td>
    <td>__heldItem__</td>
    <td>__status__</td>
</tr>`;

const locationRow = `<tr id="tr-location-__id__" onclick="selectLocation('__id__')">
    <th scope="row">__id__</th>
    <td>__name__</td>
    <td>__itemCount__</td>
</tr>`

const itemRow = `<tr>
    <th scope="row">__row__</th>
    <td>__name__</td>
</tr>`

// Page-wide variables
let itemNum = 0;
let modalSelectLocation;
let modalSelectItem;

webSocket.onopen = (event) => {
    console.log("Web socket opened!");

    // Try to authenticate right away if
    // API key filled in
    if ($("#input-api-key").val()) {
        var req = {
            key:    $("#input-api-key").val(),
            action: "authentication"
        }

        webSocket.send(JSON.stringify(req));
    }
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
        case "robots":
            // Stream details of all robots
            var tableRobots = $("#table-robots tbody");
            
            var newRobot = robotRow;
            newRobot = newRobot.replaceAll("__id__", response.data.serviceID);
            newRobot = newRobot.replaceAll("__location__", response.data.location);
            newRobot = newRobot.replaceAll("__heldItem__", response.data.heldItem);
            newRobot = newRobot.replaceAll("__status__", response.data.status);
            tableRobots.append(newRobot);

            break;

        case "locations":
            // Stream details of all the locations
            var tableLocations = $("#table-locations tbody");
            var newLocation = locationRow;

            newLocation = newLocation.replaceAll("__id__", response.data.locationID);
            newLocation = newLocation.replaceAll("__name__", response.data.locationName);
            var itemCount = response.data.locationItemCount + "/" + response.data.locationMaxSize;
            newLocation = newLocation.replaceAll("__itemCount__", itemCount);
            tableLocations.append(newLocation);

            break;

        case "items":
            // Stream details of the location's items
            var tableItems = $("#table-items tbody");
            var newItem = itemRow;
            
            itemNum++;
            newItem = newItem.replace("__row__", itemNum);
            newItem = newItem.replace("__name__", response.data.itemName);
            tableItems.append(newItem);

            break;

        case "clear":
            // Clear out the specified tables contents
            var target = response.data;

            switch (target) {
                case "items":
                    $("#table-items tbody").empty();
                    itemNum = 0;
            }

        case "robot":
            // Update the selected robot's details
            $("#h5-robot-id").empty();
            $("#h5-robot-location").empty();
            $("#h5-robot-held-item").empty();
            $("#h5-robot-status").empty();

            $("#h5-robot-id").append(response.data.serviceID);
            $("#h5-robot-location").append(response.data.location);
            $("#h5-robot-held-item").append(response.data.heldItem);
            $("#h5-robot-status").append(response.data.status);

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
    // Client side JS
    console.log("API Key:", $("#input-api-key").val());
});

// Get the details of the selected robot
function selectRobot(robot) {
    var req = {
        key:    $("#input-api-key").val(),
        action: "getRobotInformation",
        data:   robot
    }

    webSocket.send(JSON.stringify(req));
}

// Get the items for the selected 
function selectLocation(location) {
    var req = {
        key:    $("#input-api-key").val(),
        action: "listItemLocations",
        data:   location
    }

    webSocket.send(JSON.stringify(req));
}

function moveRobot(e) {
    if (!e) { return; }
    var serviceID = e.getAttribute("serviceid")
    if (!serviceID) { return; }

    // Need to get list of locations from server
    // then prompt person what location to move to
    // Use modal from bootstrap
    
    var modal = new bootstrap.Modal(modalSelectLocation, {});
    modal.show();    
}

function loadUnload(e) {
    // Extract the robot ID from the element's "serviceID" attribute
    if (!e) { return; }
    var serviceID = e.getAttribute("serviceid")
    if (!serviceID) { return; }
    
    var modal = new bootstrap.Modal(modalSelectItem, {});
    modal.show();
}

// Code to run on page load
document.addEventListener("DOMContentLoaded", function() {
    modalSelectLocation = document.getElementById('modal-select-location');
    modalSelectItem     = document.getElementById('modal-select-item');
});