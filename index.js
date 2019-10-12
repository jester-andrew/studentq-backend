/***************************************************************
 * Libraries
 ***************************************************************/
const express = require('express')
const app = express();
require('dotenv').config()
const path = require('path')
const PORT = process.env.PORT || 5000
const mongo = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
const assert = require('assert');
const bcrypt = require('bcrypt');
const socket = require('socket.io');

/***************************************************************
 * Middleware
 ***************************************************************/
let bodyParser = require("body-parser");
let cors = require('cors');
app.use(bodyParser.json());
var urlencodedParser = bodyParser.urlencoded({ extended: false });

app.all("/*", function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');

    console.log(req.originalUrl);
    next();
});

/***************************************************************
 * Database Variables
 ***************************************************************/
let dbURL = process.env.MONGODB_URI;
const dbName = process.env.dbName;
console.log(dbURL)
console.log(dbName)


/***************************************************************
 * server setup
 ***************************************************************/
let server = app.listen(PORT, () => console.log(`Listening on ${ PORT }`));

/***************************************************************
 * Web Socket listeners
 ***************************************************************/
let io = socket(server);
io.on('connection', (socket) => {
    //adding a help request
    socket.on('add', (req) => {
        addRequest(req, (result) => {
            if (result.insertedCount > 0) {
                console.log('inserted request');
                //get que and emit
                getQ(req, (err, response) => {
                    io.sockets.emit('add', JSON.stringify(response));
                });
            } else {
                console.error('request was not inserted');
            }
        })
    });

    // removing a help request
    socket.on('remove', (req) => {
        //io.sockets.emit('remove', req);
        removeRequest(req, (err, result) => {
            if (err) {
                console.log('deleted:  false');
            } else {
                console.log('deleted:  true');
                //get que and emit
                getQ(req, (err, response) => {
                    io.sockets.emit('add', JSON.stringify(response));
                });
            }
        });
    });
});
/***************************************************************
 * Endpoints
 ***************************************************************/
/**
 * enters a request onto the que *Depricated*
 * 
 * {
 *  studentRequest:{},
 *  collection: ""
 * }
 */
app.post('/enterq', (req, res) => {
    addRequest(req, (result) => {
        if (result.insertedCount > 0) {
            console.log('inserted request');
            res.status(200).json({ inserted: true });
            res.end();
        } else {
            console.error('request was not inserted');
            res.status(500).json({ inserted: false });
            res.end();
        }
    });
});



/**
 * removes a request from the que *Depricated*
 * 
 * {
 *  id:'',
 *  collection: ""
 * }
 */
app.post('/removeq', (req, res) => {
    removeRequest(req, (err, result) => {
        if (err) {
            res.status(500).json({ deleted: false });
            res.end();
        } else {
            res.status(200).json({ deleted: true });
            res.end();
        }
    });
});

/**
 * returns the specified que
 * 
 * {
 *  collection: ""
 * }
 */
app.post('/que', (req, res) => {
    getQ(req, (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).json({ returned: false });
            res.end();
        } else {
            console.log(result);
            res.status(200).json({ returnrd: true, result: result });
            res.end();
        }
    });
});

/**
 *  lets the user login after checking credentials and returns an auth object.
 */
app.post('/login', (req, res) => {
    console.log(req.body);
    let plainText = req.body.password;
    let email = req.body.email;

    getUserByEmail(email, (result) => {
        if (result.isUser) {
            let adminUser = result.user;
            let hashedPassword = adminUser.password;
            bcrypt.compare(plainText, hashedPassword, (err, response) => {
                if (response) {
                    createSessionToken((token) => {
                        if (token != null) {
                            adminUser.token = token;
                            removeOldSessions(email, (result) => {
                                createSession(adminUser, (response) => {
                                    if (response.created) {
                                        res.status(200).json({
                                            auth: {
                                                email: email,
                                                token: token,
                                                lab: adminUser.lab,
                                                permissions: adminUser.permissions
                                            }
                                        });
                                        res.end();
                                    } else {
                                        res.status(500).json({ response: 'internal error' });
                                        res.end();
                                    }
                                });
                            });
                        } else {
                            res.status(500).json({ response: 'internal error' });
                            res.end();
                        }
                    });
                }
            });
        } else {
            res.status(401).json({ response: 'not authorized' });
            res.end();
        }
    });
});


// app.post('/hashPassword', (req, res) => {
//     let plainText = "";

//     bcrypt.hash(plainText, 10, (err, hash) => {
//         if (!err) {
//             console.log(hash);
//         } else {
//             consol.log(err);
//         }
//     });
// });

/**
 *  returns the available labs
 */
app.get('/getLabs', (req, res) => {
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        let db = client.db(dbName);
        db.collection('alias_to_collection_map').find().toArray((error, result) => {
            let returnArray = [];
            result.forEach((set) => {
                returnArray.push(set.alias);
                res.status(200).json({ labs: returnArray });
                res.end();
            });
        });
    });
});

/***************************************************************
 * Data Access Functions
 ***************************************************************/
/**
 * returns the user if one exists by email
 * @param {*} email 
 * @param {*} callback 
 */
function getUserByEmail(email, callback) {
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        let db = client.db(dbName);
        db.collection('admin_users').find({ email: email }).toArray((error, result) => {
            if (!err) {
                let response;
                if (result.length > 0) {
                    response = {
                        isUser: true,
                        user: result[0]
                    }
                } else {
                    response = {
                        isUser: false
                    }
                }
                callback(response);
            } else {
                console.log(err);
            }
        });
    });
}

/**
 * Returns a session token 128 characters long
 * @param {*} callback 
 */
function createSessionToken(callback) {
    let token = '';
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for (let i = 0; i < 128; i++) {
        token += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    callback(token);
}

/**
 * creates a session and stores it in the database.
 * @param {*} adminUser 
 * @param {*} callback 
 */
function createSession(adminUser, callback) {
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        let db = client.db(dbName);
        let oneHour = new Date();
        oneHour.setTime(oneHour.getTime() + 1000 * 60 * 60);

        db.collection('sessions').insertOne({
            email: adminUser.email,
            token: adminUser.token,
            permissions: adminUser.permissions,
            lab: adminUser.lab,
            expires: oneHour.toString()
        }, (error, result) => {
            let response;
            if (!error) {
                if (result.insertedCount > 0) {
                    response = {
                        created: true
                    }
                    callback(response);
                } else {
                    response = {
                        created: false
                    }
                    callback(response);
                }
            } else {
                response = {
                    created: false
                }
                callback(response);
            }
        });
    });
}

/**
 * Removes old sessions from the database
 * @param {*} email 
 * @param {*} callback 
 */
function removeOldSessions(email, callback) {
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        let db = client.db(dbName);
        db.collection('sessions').remove({ email: email }, (err, result) => {
            if (!err) {
                callback(result);
            } else {
                callback(result);
            }
        });
    });
}

/**
 * Adds a help request to the database
 * @param {*} req 
 * @param {*} callback 
 */
function addRequest(req, callback) {
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        assert.equal(null, err);
        let request = JSON.parse(req);
        let studentRequest = {
            name: request.name,
            class: request.class,
            question: request.question,
            campus: request.campus,
            email: request.email,
        }

        let db = client.db(dbName);
        let qcollectionAlias = request.collection;
        console.log(qcollectionAlias);
        db.collection('alias_to_collection_map').find({ alias: qcollectionAlias }).toArray((error, result) => {
            console.log(result);
            db.collection(result[0].collection).insertOne(studentRequest, (err, result) => {
                assert.equal(null, err);
                callback(result);
                client.close();
            });
        });
    });
}

/**
 * Removes a request from the database
 * @param {*} req 
 * @param {*} callback 
 */
function removeRequest(req, callback) {
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        let deleteRequest = JSON.parse(req)
        let requestId = deleteRequest.id;
        console.log(requestId);
        let db = client.db(dbName);
        let qcollectionAlias = deleteRequest.collection;
        console.log(qcollectionAlias);
        db.collection('alias_to_collection_map').find({ alias: qcollectionAlias }).toArray((error, result) => {
            db.collection(result[0].collection).deleteOne({ _id: ObjectId(requestId) }, (err, result) => {
                callback(err, result);
                client.close();
            });
        });
    });
}

/**
 * returns the Que(all help requests) that the user has selected.
 * @param {*} req 
 * @param {*} callback 
 */
function getQ(req, callback) {
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        let db = client.db(dbName);
        let qcollectionAlias;
        if (req.body != undefined) {
            qcollectionAlias = req.body.collection;
        } else {
            let request = JSON.parse(req)
            qcollectionAlias = request.collection;
        }
        console.log(qcollectionAlias);
        db.collection('alias_to_collection_map').find({ alias: qcollectionAlias }).toArray((error, result) => {
            console.log(result[0].collection);
            db.collection(result[0].collection).find().toArray((error, result) => {
                console.log(result);
                callback(error, result);
            });
        });
    });
}