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
    let listRobotsCall = warehouseService.ListRobots({});
    let count = 0;
    listRobotsCall.on("data", function (response) {
        if (!response) { return; }
        count++;

        //console.log(response);
        console.log(`${count}\t${response.serviceID}\t${response.address}\t${response.location}\t${response.status}\t${response.heldItem}`);
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

function listLocationItems(locationNameOrID) {
    // Need to ask for location ID or name
    if (!locationNameOrID) {
        locationNameOrID = readlineSync.question("What location do you want to list the items for? ");
    }

    // Check if location exists
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
    listLocationItems.on("end", () => {
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
        console.log("Error listing items:");
        console.error(e);
    });
}

function addItem(locationNameOrID, itemName) {
    const call = warehouseService.AddToLocation((error, response) => {
        if (error) {
            console.log("An error occurred trying to add items: ");
            console.error(error);
        }
    });
    
    // Need to ask for location ID or name
    if (!locationNameOrID) {
        locationNameOrID = readlineSync.question("What location do you want to add items to? ");
    }

    // If item name was already specified then just add it and exit
    if (!itemName) {
        var keepAdding = true;

        while (keepAdding) {
            const itemName = readlineSync.question("Enter item name: ");

            if (!itemName) {
                console.log("Please enter a valid item name!");
            } else {
                call.write({
                    locationNameOrID: locationNameOrID,
                    itemName: itemName
                });

                keepAdding = readlineSync.keyInYN("Do you want to add more items? ");
            }
        }
    } else {
        // Command line set the item name
        call.write({
            locationNameOrID: locationNameOrID,
            itemName: itemName
        });
    }

    call.end();
}

function removeItem(locationNameOrID, itemName) {
    const call = warehouseService.RemoveFromLocation((error, response) => {
        if (error) {
            console.log("An error occurred trying to remove items: ");
            console.error(error);
        }
    });
    
    // Need to ask for location ID or name
    if (!locationNameOrID) {
        locationNameOrID = readlineSync.question("What location do you want to remove items from? ");
    }

    var keepDeleting = true;

    if (!itemName) {
        while (keepDeleting) {
            const itemName = readlineSync.question("Enter item name: ");

            if (!itemName) {
                console.log("Please enter a valid item name!");
            } else {
                call.write({
                    locationNameOrID: locationNameOrID,
                    itemName: itemName
                });

                keepDeleting = readlineSync.keyInYN("Do you want to delete more items? ");
            }
        }
    } else {
        // Command line set the item name
        call.write({
            locationNameOrID: locationNameOrID,
            itemName: itemName
        });
    }

    call.end();
}

function moveRobot(serviceID, locationNameOrID) {
    if (!serviceID) {
        serviceID = readlineSync.question("Enter robot service ID: ");
    }

    if (!locationNameOrID) {
        locationNameOrID = readlineSync.question("What location do you want to send the robot to? ");
    }

    warehouseService.MoveRobot({
        serviceID: serviceID,
        locationNameOrID: locationNameOrID
    }, (error, response) => {
        if (error) {
            console.log(`An error occurred moving a robot to ${locationNameOrID}`);
            console.error(error);
            return;
        }
    });
}

function loadItem(serviceID, itemName) {
    if (!serviceID) {
        serviceID = readlineSync.question("Enter robot service ID: ");
    }

    if (!itemName) {
        itemName = readlineSync.question("What item do you want to load? ");
    }

    warehouseService.LoadItem({
        serviceID: serviceID,
        itemName:  itemName
    }, (error, response) => {
        if (error) {
            console.log(`An error occurred loading '${itemName}' onto robot ${serviceID}: `);
            console.error(error);
            return;
        }
    });
}

function unloadItem(serviceID) {
    if (!serviceID) {
        serviceID = readlineSync.question("Enter robot service ID: ");
    }

    warehouseService.UnloadItem({
        serviceID: serviceID
    }, (error, response) => {
        if (error) {
            console.log(`An error occurred unloading robot ${serviceID}: `);
            console.error(error);
            return;
        }
    });
}

function controlRobot(serviceID) {
    if (!serviceID) {
        serviceID = readlineSync.question("Enter robot service ID: ");
    }
    
    // take control of a robot
    while (userInput != "quit") {
        process.stdout.write('\x1Bc');
        console.log(`Controlling Robot: ${serviceID}`);
        console.log(`         Location: ${location}`);
        console.log(`          Holding: ${heldItem}`);
        console.log(`\nCommands: `);
        console.log(`\tmove <location>`);
        console.log(`\tload <item>`);
        console.log(`\tunload`);
        console.log(`\tquit`);

        userInput = readlineSync.question("> ");
        args = userInput.split(" ");
        cmd = args[0].trim().toLowerCase();
        args.splice(0, 1);
        params = args.join(" ");
        console.log(`You want to '${cmd}' with a '${params}'? ew`);

        switch (cmd) {
            case "move":
                moveRobot(serviceID, params);
                break;

            case "load":
                loadItem(serviceID, params);
                break;

            case "unload":
                unloadItem(serviceID);
                break;
        }
    }
}

function help() {
    console.log("quit       > Quit");
    console.log("help       > Shows this list");
    console.log("robots     > List robots");
    console.log("locations  > List locations");
    console.log("items      > List location items");
    console.log("insert     > Insert items");
    console.log("remove     > Remove item");
    console.log("move       > Move robot");
    console.log("load       > Load item onto robot");
    console.log("unload     > Unload item from robot");
    console.log("control    > Take control of a robot");
}

// Sanitise all user inputs
if (!userInput) {
    help();
    
    userInput = readlineSync.question("\nEnter Option: ").toString().trim().toLowerCase();
}

switch (userInput) {
    case "robots":
        listRobots();
        break;

    case "locations":
        listLocations();
        break;

    case "items":
        // Try to get the location from the arguments if possible
        var listLocation = "";

        if (process.argv[3]) { listLocation = process.argv[3].toString().trim(); }

        listLocationItems(listLocation);
        break;

    case "insert":
        // Try to get the location from the arguments if possible
        var location = "";
        var newItem  = "";

        if (process.argv[3]) { location = process.argv[3].toString().trim(); }
        if (process.argv[4]) { newItem  = process.argv[4].toString().trim(); }

        addItem(location, newItem);
        break;

    case "remove":
        // Try to get the location from the arguments if possible
        var location   = "";
        var targetItem = "";

        if (process.argv[3]) { location   = process.argv[3].toString().trim(); }
        if (process.argv[4]) { targetItem = process.argv[4].toString().trim(); }

        removeItem(location, targetItem);
        break;

    case "move":
        var serviceID        = "";
        var locationNameOrID = "";

        if (process.argv[3]) { serviceID        = process.argv[3].toString().trim(); }
        if (process.argv[4]) { locationNameOrID = process.argv[4].toString().trim(); }

        moveRobot(serviceID, locationNameOrID);
        break;

    case "load":
        var serviceID = "";
        var itemName  = "";

        if (process.argv[3]) { serviceID = process.argv[3].toString().trim(); }
        if (process.argv[4]) { itemName  = process.argv[4].toString().trim(); }

        loadItem(serviceID, itemName);
        break;

    case "unload":
        var serviceID = "";

        if (process.argv[3]) { serviceID = process.argv[3].toString().trim(); }

        unloadItem(serviceID);
        break;

    case "control":
        var serviceID = "";
        if (process.argv[3]) { serviceID        = process.argv[3].toString().trim(); }

        controlRobot(serviceID);
        
        break;

    default:
        break;
}