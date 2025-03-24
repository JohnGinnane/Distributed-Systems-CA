const grpc         = require("@grpc/grpc-js");
const protoLoader  = require("@grpc/proto-loader");
const path         = require("path");
const readlineSync = require("readline-sync");

let WAREHOUSE_ADDRESS = "127.0.0.1:50001";

const warehouseProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../protos/warehouse.proto"))).warehouse;

const warehouseService = new warehouseProto.WarehouseService(WAREHOUSE_ADDRESS, grpc.credentials.createInsecure());

function listRobots() {
    var listRobotsCall = warehouseService.ListRobots({});

    listRobotsCall.on("data", function (response) {
        if (!response) { return; }

        console.log(`${response.serviceID} @ ${response.serviceAddress}`);
    });

    listRobotsCall.on("end", ()=>{});

    listRobotsCall.on("error", (e) => {
        console.log("Error listing robots:");
        console.error(e);
    });
}

function listLoadingBayItems() {
    var listLoadingBayItems = warehouseService.ListLoadingBayItems({});
    const loadingBay = [];

    listLoadingBayItems.on("data", function (response) {
        if (response) {
            loadingBay.push(response.itemName);
        }
    });

    listLoadingBayItems.on("end", ()=>{
        console.log("\nItems in the loading bay:");
        const numPadding = loadingBay.length.toString().length - 1;

        for (var i = 0; i < loadingBay.length; i++) {
            console.log(`${" ".repeat(numPadding)}${i+1}. ${loadingBay[i]}`);
        }
    });

    listLoadingBayItems.on("error", (e) => {
        console.log("Error listing loading bay items:");
        console.error(e);
    });
}

console.log("0. to quit");
console.log("1. List robots");
console.log("2. List loading bay items");
console.log("3. Insert loading bay items");
console.log("4. Remove loading bay item");

// Sanitise all user inputs
let userInput = readlineSync.questionInt("").toString().trim().toLowerCase();

switch (userInput) {
    case "1":
        listRobots();
        break;

    case "2":
        listLoadingBayItems();

    default:
        break;
}