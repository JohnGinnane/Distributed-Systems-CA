// Immediately open a web socket to the server
// This allows us to stream async data from web
// server to the client's page
const webSocket = new WebSocket("ws://localhost:3001/", "echo-protocol");

// Template rows for robots and locations
const robotRow = `<tr>
    <th scope="row">__id__</th>
    <td>__location__</td>
    <td>__heldItem__</td>
    <td>__status__</td>
</tr>`;

const locationRow = `<tr>
    <th scope="row">__id__</th>
    <td>__name__</td>
    <td>__itemCount__</td>
</tr>`

webSocket.onopen = (event) => {
    console.log("Web socket opened!");
}

webSocket.onmessage = (event) => {
    var response = JSON.parse(event.data);
    
    // Add the objects to respective list
    switch (response.type) {
        case "robot":
            var tableRobots = $("#table-robots tbody");
            
            var newRobot = robotRow;
            newRobot = newRobot.replace("__id__", response.data.serviceID);
            newRobot = newRobot.replace("__location__", response.data.location);
            newRobot = newRobot.replace("__heldItem__", response.data.heldItem);
            newRobot = newRobot.replace("__status__", response.data.status);
            tableRobots.append(newRobot);

            break;

        case "location":
            var tableLocations = $("#table-locations tbody");
            var newLocation = locationRow;

            newLocation = newLocation.replace("__id__", response.data.locationID);
            newLocation = newLocation.replace("__name__", response.data.locationName);
            var itemCount = response.data.locationItemCount + "/" + response.data.locationMaxSize;
            newLocation = newLocation.replace("__itemCount__", itemCount);
            tableLocations.append(newLocation);

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