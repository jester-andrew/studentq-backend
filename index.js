const express = require('express')
const app = express();
const path = require('path')
const PORT = process.env.PORT || 5000
const mongo = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
const assert = require('assert');
const dbName = 'heroku_tv8fc3vn';
const bcrypt = require('bcrypt');
let bodyParser = require("body-parser");
let cors = require('cors');
let dbURL = process.env.MONGODB_URI || 'mongodb://heroku_tv8fc3vn:4r96lahmjgk6fpmpjoc491o8ir@ds163745.mlab.com:63745/heroku_tv8fc3vn';

app.use(bodyParser.json());
var urlencodedParser = bodyParser.urlencoded({ extended: false });

app.listen(PORT, () => console.log(`Listening on ${ PORT }`));
app.all("/*", function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');

    console.log(req.originalUrl);
    next();
});

/**
 * enters a request onto the que
 * 
 * {
 *  studentRequest:{},
 *  collection: ""
 * }
 */
app.post('/enterq', (req, res) => {
    console.log('here');
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        assert.equal(null, err);
        let studentRequest = {
            name: req.body.name,
            class: req.body.class,
            question: req.body.question,
            campus: req.body.campus,
            email: req.body.email,
        }
        let db = client.db(dbName);
        let qcollectionAlias = req.body.collection;
        console.log(qcollectionAlias);
        db.collection('alias_to_collection_map').find({ alias: qcollectionAlias }).toArray((error, result) => {
            console.log(result);
            db.collection(result[0].collection).insertOne(studentRequest, (err, result) => {
                assert.equal(null, err);
                if (result.insertedCount > 0) {
                    console.log('inserted request');
                    res.status(200).json({ inserted: true });
                    res.end();
                } else {
                    console.error('request was not inserted');
                    res.status(500).json({ inserted: false });
                    res.end();
                }
                client.close();
            });
        });
    });
});

/**
 * removes a request from the que
 * 
 * {
 *  id:'',
 *  collection: ""
 * }
 */
app.delete('/removeq', (req, res) => {
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        let requestId = req.body.id;
        let db = client.db(dbName);
        let qcollection = req.body.collection;
        db.collection(qcollection).removeOne({ _id: ObjectId(requestId) }, (err, result) => {
            if (err) {
                res.status(500).json({ deleted: false });
                res.end();
            } else {
                res.status(200).json({ deleted: true });
                res.end();
            }
            client.close();
        });
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
    console.log('here');
    res.setHeader("Access-Control-Allow-Headers", "*");

    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        let db = client.db(dbName);
        let qcollectionAlias = req.body.collection;
        db.collection('alias_to_collection_map').find({ alias: qcollectionAlias }).toArray((error, result) => {
            db.collection(result[0].collection).find().toArray((error, result) => {
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
    });
});

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

app.post('/hashPassword', (req, res) => {
    let plainText = "";

    bcrypt.hash(plainText, 10, (err, hash) => {
        if (!err) {
            console.log(hash);
        } else {
            consol.log(err);
        }
    });
});

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

function createSessionToken(callback) {
    let token = '';
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for (let i = 0; i < 128; i++) {
        token += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    callback(token);
}

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