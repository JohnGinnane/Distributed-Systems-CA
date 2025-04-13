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
let itemNum = 0;
let modalSelectLocation;
let modalSelectItem;

var locations = [];
var robots    = [];
var items     = [];

const itemsReceivedEvent = new Event("itemsReceived");

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
            var robot = response.data;
            var tableRobots = $("#table-robots tbody");

            // Check if robot is already in our list
            var robotIndex = robots.findIndex((x) => x.serviceID == robot.serviceID);

            // If we found it then update our array and table
            if (robotIndex > -1) {
                robots[robotIndex].location = robot.location;
                robots[robotIndex].heldItem = robot.heldItem;
                robots[robotIndex].status   = robot.status;

                // Update row on table
                var existingRow = $("#table-robots tbody tr#tr-robot-" + robot.serviceID);
                existingRow.find("td[type='location']").html(robot.location);
                existingRow.find("td[type='heldItem']").html(robot.heldItem);
                existingRow.find("td[type='status']").html(robot.status);
            } else {
                robots.push(robot);

                // Add to the table
                var newRobot = robotRow;
                newRobot = newRobot.replaceAll("__id__", robot.serviceID);
                newRobot = newRobot.replaceAll("__location__", robot.location);
                newRobot = newRobot.replaceAll("__heldItem__", robot.heldItem);
                newRobot = newRobot.replaceAll("__status__", robot.status);
                tableRobots.append(newRobot);                
            }

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
            items = response.data;
            document.dispatchEvent(itemsReceivedEvent);
            break;

        case "clear":
            // Clear out the specified tables contents
            var target = response.data;

            switch (target) {
                case "items":
                    $("#table-items tbody").empty();
                    $("#select-load-item").empty();
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
    // refresh list of robots
    var req = {
        key:    $("#input-api-key").val(),
        action: "listRobots"
    }

    webSocket.send(JSON.stringify(req));

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

    document.addEventListener("itemsReceived", function() {
        console.log("location items");

        // Stream details of the location's items
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
    var serviceID = e.getAttribute("serviceid")
    if (!serviceID) { return; }
    
    // Get the select robot
    var robot = robots.find((x) => (x.serviceID == serviceID));

    if (!robot) {
        console.log(`Unable to find robot with ID '${serviceID}'`);
        return;
    }

    // Check if we're loading or unloading
    switch (e.textContent.trim().toLowerCase()) {
        case "load":
            var req = {
                key:    $("#input-api-key").val(),
                action: "listItemLocations",
                data:   robot.location
            }
        
            webSocket.send(JSON.stringify(req));

            document.addEventListener("itemsReceived", function() {
                console.log("loading item");
                
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
                    serviceID: serviceID
                }
            }

            webSocket.send(JSON.stringify(req));

            break;
    }

    // // Update our items
    // var req = {
    //     key: $("#input-api-key").val(),
    //     action: "listItemLocations",
    // }

    // webSocket.send(JSON.stringify(req));

}

function loadItemConfirm() {
    var robotID = $("#h5-robot-id").html();
    var itemName = $("#select-item").find(":selected").text();

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