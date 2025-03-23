const grpc         = require("@grpc/grpc-js");
const protoLoader  = require("@grpc/proto-loader");
const path         = require("path");
const readlineSync = require("readline-sync");

let DISCOVERY_ADDRESS = "127.0.0.1:50000";
let WAREHOUSE_ADDRESS = "127.0.0.1:50001";

const discoveryProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../protos/discovery.proto"))).discovery;
const warehouseProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../protos/warehouse.proto"))).warehouse;

const discoveryService = new discoveryProto.DiscoveryService(DISCOVERY_ADDRESS, grpc.credentials.createInsecure());
const warehouseService = new warehouseProto.WarehouseService(WAREHOUSE_ADDRESS, grpc.credentials.createInsecure());

// let userInput = "";

// console.log("0. to quit");
// console.log("1. List robots");

// while (userInput != "0") {
//     //console.log("\u001B[2J\u001B[0;0f");

//     // Sanitise all user inputs
//     userInput = readlineSync.questionInt("").toString().trim().toLowerCase();
//     console.log(`User input: '${userInput}'`);
    
//     switch (userInput) {
//         case "1":
//             break;
//         default:
//             break;
//     }
// }

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
