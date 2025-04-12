const webSocket = new WebSocket("ws://localhost:3001/", "echo-protocol");

webSocket.onopen = (event) => {
    console.log("Web socket opened!");
    webSocket.send("hello world!");
}

webSocket.onmessage = (event) => {
    console.log("Web socket: ");
    let data = JSON.parse(event.data);
    console.log(data);
};

webSocket.onerror = (event) => {
    console.error(event);
}

$("#form-api").on("submit", (event) => {
    // Client side JS
    console.log("API Key:", $("#input-api-key").val());
});