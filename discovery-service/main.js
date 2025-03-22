const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");
const uuid = require("uuid");

const PROTO_PATH = path.join(__dirname, "protos/discovery.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const discoveryProto = grpc.loadPackageDefinition(packageDefinition).discovery;

let ADDRESS = "127.0.0.1";
let PORT    = "50000";

let services = [];

function address() { return `${ADDRESS}:${PORT}`; }

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
    let newID = "";

    while (newID == "" || services.find((x) => { if (x) { x.serverID == newID; } })) {
        newID = uuid.v4();
    }

    console.log(`Registering service '${serviceName}' at ${serviceAddress} with ID ${newID}`);

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

    // Remove from services array`
    if (serviceIndex > -1) {
        console.log(`Service ID ${services[serviceIndex].serviceID} has been unregistered`);
        services.splice(serviceIndex, 1);
    }
}

const server = new grpc.Server();

server.addService(discoveryProto.DiscoveryService.service, {
    RegisterService:   registerService,
    UnregisterService: unregisterService,
    ListServices:      listServices
});

server.bindAsync(address(), grpc.ServerCredentials.createInsecure(), () => {
    console.log("Discovery Service running on " + address());
    //server.start(); // No longer necessary to call this function, according to node
})