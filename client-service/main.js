const grpc         = require("@grpc/grpc-js");
const protoLoader  = require("@grpc/proto-loader");
const path         = require("path");
const readlineSync = require("readline-sync");

let WAREHOUSE_ADDRESS = "127.0.0.1:50001";

const warehouseProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, "../protos/warehouse.proto"))).warehouse;

const warehouseService = new warehouseProto.WarehouseService(WAREHOUSE_ADDRESS, grpc.credentials.createInsecure());

let userInput = "";

/* 
 * Process program parameters
 *   process.argv[0]    = node.js
 *   process.argv[1]    = this-file.js
 *   process.argv[2..N] = parameters
 */

// Extract option from parameters
if (process.argv[2]) {
    userInput = process.argv[2].toString().trim().toLowerCase();
}

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

function listLocations() {
    var listRobotsCall = warehouseService.ListLocations({});
    const locations = []

    listRobotsCall.on("data", function (response) {
        if (!response) { return; }
        locations.push(response);
    });

    listRobotsCall.on("end", ()=>{
        // Format list of locations nicely
        for (let i = 0; i < locations.length; i++) {
            let loc = locations[i];
            let locName = loc.locationName;
            if (locName.length < 8) {
                locName += "\t";
            }

            let lineStr = `${i+1}.\t${loc.locationID}\t${locName}\t${loc.locationItemCount}/${loc.locationMaxSize}`;
            console.log(lineStr);
        }
    });

    listRobotsCall.on("error", (e) => {
        console.log("Error listing robots:");
        console.error(e);
    });
}

function listLocationItems() {
    // Need to ask for location ID or name
    const locationNameOrID = readlineSync.question("What location do you want to list the items for? ");

    let listLocationItems = warehouseService.ListLocationItems({
        locationNameOrID: locationNameOrID
    });

    const items = [];

    listLocationItems.on("data", function (response) {
        if (response) {
            items.push(response.itemName);
        }
    });

    // Once the server has finished streaming the data
    // then format the list so it's nice and consistent
    listLocationItems.on("end", ()=>{
        console.log("\nItems in the loading bay:");
        const numPadding = items.length.toString().length - 1;
        let maxLength = 1;

        for (let i = 0; i < items.length; i++) {
            let lineStr = `${" ".repeat(numPadding)}${i+1}. ${items[i]}`;
            
            if (lineStr.length > maxLength) {
                maxLength = lineStr.length;
            }
            console.log(lineStr);
        }

        console.log(`-`.repeat(maxLength))
        //let totalStr = 
    });

    listLocationItems.on("error", (e) => {
        console.log("Error listing loading bay items:");
        console.error(e);
    });
}

function insertLoadingBay() {
    const call = warehouseService.InsertLoadingBay((error, response) => {
        if (error) {
            console.log("An error occurred trying to insert loading bay items: ");
            console.error(error);
        } else {
            console.log(response.message);
        }
    });

    let moreOrders = true;

    while (moreOrders) {
        const itemName = readlineSync.question("Enter item name: ");

        if (!itemName) {
            console.log("Please enter a valid item name!");
        } else {
            call.write({itemName: itemName});

            moreOrders = readlineSync.keyInYN("Do you want to add more to the order? ");
        }
    }

    call.end();
}

function removeLoadingBay() {
    while (true) {
        const itemName = readlineSync.question("What item do you want to remove from the loading bay? ");

        if (!itemName) {
            console.log("Please enter a valid item name!");
            continue;
        }
    
        warehouseService.RemoveLoadingBay({itemName: itemName}, (error, response) => {
            if (error) {
                console.log(`An error occurred trying to remove the item '${itemName}'`);
                console.error(error);
                return;
            }

            console.log(`Successfully removed ${itemName} from the loading bay`);
        })

        break;
    }
}

// Sanitise all user inputs
if (!userInput) {
    console.log("0. to quit");
    console.log("1. List robots");
    console.log("2. List locations");
    console.log("3. List location items");
    console.log("4. Insert loading bay items");
    console.log("5. Remove loading bay item");
    
    userInput = readlineSync.questionInt("\nEnter Option: ").toString().trim().toLowerCase();
}

switch (userInput) {
    case "1":
        listRobots();
        break;

    case "2":
        listLocations();
        break;

    case "3":
        listLocationItems();
        break;

    case "4":
        insertLoadingBay();
        break;

    case "5":
        removeLoadingBay();
        break;

    default:
        break;
}