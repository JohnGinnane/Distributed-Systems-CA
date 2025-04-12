const webSocket = new WebSocket("ws://localhost:3001/", "echo-protocol");

const robotRow = `<tr>
    <th scope="row">__id__</th>
    <td>__location__</td>
    <td>__heldItem__</td>
    <td>__status__</td>
</tr>`;

webSocket.onopen = (event) => {
    console.log("Web socket opened!");
}

webSocket.onmessage = (event) => {
    let response = JSON.parse(event.data);
    
    // Add the objects to respective list
    switch (response.type) {
        case "robot":
            const tableRobots = $("#table-robots tr:last");
            console.log(response.data);
            
            let newRobot = robotRow;
            newRobot = newRobot.replace("__id__", response.data.serviceID);
            newRobot = newRobot.replace("__location__", response.data.location);
            newRobot = newRobot.replace("__heldItem__", response.data.heldItem);
            newRobot = newRobot.replace("__status__", response.data.status);
            tableRobots.after(newRobot);

            break;

        case "location":
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