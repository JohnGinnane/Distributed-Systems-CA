const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");
const uuid = require("uuid");

const PROTO_PATH = path.join(__dirname, "../protos/discovery.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const discoveryProto = grpc.loadPackageDefinition(packageDefinition).discovery;

let ADDRESS   = "127.0.0.1";
let PORT      = "50000";
let serviceID = "";
let server    = null;

let services = [];

function address() { return `${ADDRESS}:${PORT}`; }

function log(str) {
    var today  = new Date();
    console.log("[" + today.toLocaleTimeString("en-IE") + "]", str);
}

function generateNewID() {
    let newID = "";

    while (newID == "" || services.find((x) => { if (x) { x.serviceID == newID; } })) {
        newID = uuid.v4().substring(1, 5);
    }

    return newID;
}

function findService(call, callback) {
    let serviceNameOrID = call.request.serviceNameOrID;

    let service = services.find((x) => x.serviceName == serviceNameOrID || x.serviceID == serviceNameOrID);

    if (!service) {
        callback({
            status: grpc.status.NOT_FOUND,
            details: `Unable to find service with name or ID '${serviceNameOrID}'`
        });
    }
    
    callback(null, {
        serviceID:      service.serviceID,
        serviceName:    service.serviceName,
        serviceAddress: service.serviceAddress
    });
}

function listServices(call, callback) {
    for (var i = 0; i < services.length; i++) {
        var service = services[i];

        call.write({
            serviceID:      service.serviceID,
            serviceName:    service.serviceName,
            serviceAddress: service.serviceAddress
        });
    }

    call.end();
}

function getFreePort(call, callback) {
    let targetPort = parseInt(call.request.targetPort);

    // Organise all registered services' ports into an array
    let registeredPorts = []
    for (var i = 0; i < services.length; i++) {
        registeredPorts[i] = parseInt(services[i].serviceAddress.split(":")[1]);
    }

    // Check if target port is in use
    if (registeredPorts.includes(targetPort)) {
        targetPort = 50100; // Minimum port for dynamic port allocation

        while (registeredPorts.includes(targetPort)) {
            targetPort++;
        }
    }

    callback(null, { freePort: targetPort });
}

const registerService = (call, callback) => {
    const serviceName    = call.request.serviceName;
    const serviceAddress = call.request.serviceAddress;

    // Make sure service name is valid
    if (!serviceName) {
        var errMsg = `Service name '${serviceName}' is not valid!`;
        console.error(errMsg);
        callback({
            code: grpc.status.INVALID_ARGUMENT,
            details: errMsg
        });

        return;
    }

    // Make sure service address is valid and not in use
    if (!serviceAddress) {
        var errMsg = `Service address '${address}' is not valid!`;
        console.error(errMsg);
        callback({
            code: grpc.status.INVALID_ARGUMENT,
            details: errMsg
        });

        return;
    }

    if (services.find((x) => { if (x) { x.serviceAddress == serviceAddress; } })) {
        var errMsg = `Service address ${serviceAddress} is already registered!`;
        console.error(errMsg);
        callback({
            code: grpc.status.ALREADY_EXISTS,
            details: errMsg
        });

        return;
    }

    // Generate a unique ID for new service
    let newID = generateNewID();

    log(`Registering service '${serviceName}' at ${serviceAddress} with ID ${newID}`);

    // Store in services array
    services.push({
        serviceID:      newID,
        serviceName:    serviceName,
        serviceAddress: serviceAddress
    });
    
    // All good on discovery, respond to service
    callback(null, {serviceID: newID});
}

const unregisterService = (call, callback) => {    
    const serviceID = call.request.serviceID;

    // Make sure service exists
    let serviceIndex = services.findIndex((x) => x.serviceID == serviceID);

    // Remove from services array
    if (serviceIndex > -1) {
        log(`Service ID ${services[serviceIndex].serviceID} has been unregistered`);
        services.splice(serviceIndex, 1);
    }
}

server = new grpc.Server();

server.addService(discoveryProto.DiscoveryService.service, {
    RegisterService:   registerService,
    UnregisterService: unregisterService,
    ListServices:      listServices,
    FindService:       findService,
    GetFreePort:       getFreePort,
});

server.bindAsync(address(), grpc.ServerCredentials.createInsecure(), () => {
    log("Discovery Service running on " + address());

    // Register the discovery service
    serviceID = generateNewID();

    services.push({
        serviceID:      serviceID,
        serviceName:    "discovery",
        serviceAddress: address()
    });
    
    //server.start(); // No longer necessary to call this function, according to node
})

function exitHandler() {
    // Stop the server, to free up the port
    if (server) {
        server.forceShutdown();
    }
}

// Handle the node.js program stopping
// Make sure to unregister the service if possible
// Inspired by https://stackoverflow.com/a/14032965
process.on("exit",              exitHandler.bind());
process.on("SIGINT",            exitHandler.bind());
process.on("SIGUSR1",           exitHandler.bind());
process.on("SIGUSR2",           exitHandler.bind());
process.on("uncaughtException", exitHandler.bind());