var express          = require('express');
var router           = express.Router();
const crypto         = require('crypto');


var   PUBLIC_KEY  = "";
var   PRIVATE_KEY = "";

// /******************************
//  * PUBLIC / PRIVATE KEY
//  ******************************/
// crypto.generateKeyPair('rsa', {
//     modulusLength: 4096,
//     publicKeyEncoding: {
//         type: 'spki',
//         format: 'pem'
//     },

//     privateKeyEncoding: {
//         type: 'pkcs8',
//         format: 'pem',
//         cipher: 'aes-256-cbc',
//         passphrase: 'warehouseservicepassphrase'
//     }
//   }, (err, publicKey, privateKey) => {
//     // Handle errors and use the generated key pair.
//     if (err) {
//         console.log("Couldn't generate keys!");
//         console.error(err);
//         return;
//     }

//     PUBLIC_KEY  = publicKey;
//     PRIVATE_KEY = privateKey;

//     console.log(PUBLIC_KEY);
//     console.log(PRIVATE_KEY);
// });

/* GET home page. */
router.get('/', function(req, res, next) {
    // Server side JS
    const api_key = req.query.key;

    res.render('index', {
        title:   'Warehouse Controller',
        api_key: api_key
    });
});

module.exports = router;
