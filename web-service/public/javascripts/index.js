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

let itemNum = 0;

webSocket.onopen = (event) => {
    console.log("Web socket opened!");

    webSocket.send($("#input-api-key").val());
}

// The server will send back data for:
//   1. Robots
//   2. Locations
webSocket.onmessage = (event) => {
    var response = JSON.parse(event.data);
    
    // Add the objects to respective list
    switch (response.type) {
        case "robots":
            var tableRobots = $("#table-robots tbody");
            
            var newRobot = robotRow;
            newRobot = newRobot.replaceAll("__id__", response.data.serviceID);
            newRobot = newRobot.replaceAll("__location__", response.data.location);
            newRobot = newRobot.replaceAll("__heldItem__", response.data.heldItem);
            newRobot = newRobot.replaceAll("__status__", response.data.status);
            tableRobots.append(newRobot);

            break;

        case "locations":
            var tableLocations = $("#table-locations tbody");
            var newLocation = locationRow;

            newLocation = newLocation.replaceAll("__id__", response.data.locationID);
            newLocation = newLocation.replaceAll("__name__", response.data.locationName);
            var itemCount = response.data.locationItemCount + "/" + response.data.locationMaxSize;
            newLocation = newLocation.replaceAll("__itemCount__", itemCount);
            tableLocations.append(newLocation);

            break;

        case "items":
            var tableItems = $("#table-items tbody");
            var newItem = itemRow;
            
            itemNum++;
            newItem = newItem.replace("__row__", itemNum);
            newItem = newItem.replace("__name__", response.data.itemName);
            tableItems.append(newItem);

            break;

        default:
            break;
    }
};

webSocket.onerror = (event) => {
    console.error(event);
}

$("#form-api").on("submit", (event) => {
    // Client side JS
    console.log("API Key:", $("#input-api-key").val());
});

function selectRobot(robot) {
    console.log(robot);
}

function selectLocation(location) {
    var req = {
        key:    $("#input-api-key").val(),
        action: "listItemLocations",
        data:   location
    }

    webSocket.send(JSON.stringify(req));
}