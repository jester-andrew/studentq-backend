/***************************************************************
 * Libraries
 ***************************************************************/
const express = require('express')
const app = express();
require('dotenv').config()
const path = require('path')
const PORT = process.env.PORT || 2999
const mongo = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
const assert = require('assert');
const bcrypt = require('bcrypt');
const socket = require('socket.io');
const fs = require('fs');


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
let fileNames = ['CIT Web Lab.json', 'CIT Database Lab.json', 'CIT Network Lab.json'];

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

    socket.on('update', (req) => {
        updateRequest(req, (result) => {
            if (result != null) {
                io.sockets.emit('helping', JSON.stringify(result));
            } else {
                consol.log('failed-update');
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

app.post('/updateRequest', (req, res) => {
    updateRequest(req, (result) => {
        if (result != null) {
            io.sockets.emit('add', JSON.stringify(result));
            res.status(200).json({ returnrd: true });
            res.end();
        } else {
            res.status(500).json({ returned: false });
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
    let plainText = req.body.password;
    let email = req.body.email;
    console.log(plainText);
    console.log(email);
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
                                                name: adminUser.name,
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
                } else {
                    res.status(200).json({ response: 'not authorized' });
                    res.end();
                }
            });
        } else {
            res.status(200).json({ response: 'not authorized' });
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
            res.status(200).json({ labs: result });
            res.end();
        });
    });
});

app.post('/saveSession', (req, res) => {
    let helpSession = req.body.session;
    helpSession.finishedHelp = Date.now();
    let file = req.body.file;
    recordHelpSession(helpSession, "helpSessionDumps/" + file + ".json", (response, err) => {
        if (response.recorded) {
            res.status(200).json({ saved: true });
            res.end();
        } else {
            console.log(err);
            res.status(500).json({ saved: false });
            res.end();
        }
    });
});

app.post('/addAdmin', (req, res) => {
    let admin = req.body;
    addAdmin(admin, (result) => {
        console.log(result);
        if (result.inserted) {
            res.status(200).json({ inserted: true });
            res.end();
        } else {
            console.log(err);
            res.status(500).json({ inserted: false });
            res.end();
        }
    });
});

app.post('/deleteAdmin', (req, res) => {
    let id = req.body.id;
    deleteAdmin(id, (result) => {
        console.log(result);
        if (result.deleted) {
            res.status(200).json({ deleted: true });
            res.end();
        } else {
            res.status(500).json({ deleted: false });
            res.end();
        }
    });
});

app.post('/getAdmin', (req, res) => {
    let group = req.body.group;
    getAdmins(group, (err, response) => {
        if (!err) {
            res.status(200).json({ admins: response });
            res.end();
        } else {
            console.log(err);
            res.status(500).json({ admins: null });
            res.end();
        }
    });
});

app.get('/getCourses', (req, res) => {
    getCourses((err, response) => {
        if (!err) {
            res.status(200).json({ courses: response });
            res.end();
        } else {
            console.log(err);
            res.status(500).json({ courses: null });
            res.end();
        }
    });
});

app.post('/getlabCourses', (req, res) => {
    let lab = req.body.lab;
    getLabCourses(lab, (err, response) => {
        if (!err) {
            res.status(200).json({ courses: response });
            res.end();
        } else {
            console.log(err);
            res.status(500).json({ courses: null });
            res.end();
        }
    });
});

app.post('/addCourse', (req, res) => {
    console.log(req.body);
    let course = req.body;
    addCourse(course, (err, respnse) => {
        if (!err) {
            res.status(200).json({ courses: true });
            res.end();
        } else {
            console.log(err);
            res.status(500).json({ courses: false });
            res.end();
        }
    });
});

app.post('/deleteCourse', (req, res) => {
    let id = req.body.id;
    deleteCourse(id, (response) => {
        if (response.deleted) {
            res.status(200).json(response);
            res.end();
        } else {
            console.log(err);
            res.status(500).json(response);
            res.end();
        }
    });
});

app.post('/bulkReport', (req, res) => {
    let lab = req.body.lab;
    getLabData(lab, (response) => {
        if (response != null) {
            res.status(200).json({ success: true, response: response });
            res.end();
        } else {
            res.status(500).json({ success: false, message: "No data available." });
            res.end();
        }
    });
});

app.get('/getlabInfo', (req, res) => {
    getLabInfo((info) => {
        if (info.length > 0) {
            res.status(200).json(info);
            res.end();
        } else {
            res.status(500).json({ success: false, message: "No data available." });
            res.end();
        }
    });
});

app.post('/updatelabInfo', (req, res) => {
    let lab = req.body.lab;
    let updateObject = req.body.updateObj;

    updateLabInfo(updateObject, lab, (result) => {
        if (result.updated) {
            res.status(200).json({ updated: true });
            res.end();
        } else {
            res.status(200).json({ updated: false });
            res.end();
            console.log(result.error);
        }
    });
});

app.post('/init', (req, res) => {
    let sysDate = req.body.sysDate;

    initSystem(sysDate, (result) => {
        console.log('*******************************************')
        console.log(result);
        console.log('*******************************************')
        if (result.init) {
            res.status(200).json(result);
            res.end();
        } else {
            res.status(500).json(result);
            res.end();
        }
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
            timeEnteredQue: Date.now()
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
        db.collection('alias_to_collection_map').find({ alias: qcollectionAlias }).sort({ 'timeEnteredQue': 1 }).toArray((error, result) => {
            console.log(result[0].collection);
            db.collection(result[0].collection).find().toArray((error, result) => {
                console.log(result);
                callback(error, result);
            });
        });
    });
}

function updateRequest(req, callback) {
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        let db = client.db(dbName);
        let request = JSON.parse(req)
        let qcollectionAlias = request.collection;
        let id = request.id;
        db.collection('alias_to_collection_map').find({ alias: qcollectionAlias }).toArray((error, result) => {
            let collection = result[0].collection
            db.collection(collection).updateOne({ _id: ObjectId(id) }, { $set: { "beingHelped": "table-success", "helperName": request.name, "timeHelped": Date.now() } }, (err, result) => {
                getQ(req, (err, result) => {
                    callback(result);
                });
            });
        });
    });
}

function recordHelpSession(helpSession, file, callback) {
    fs.readFile(file, (err, data) => {
        if (err) {
            mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
                let db = client.db(dbName);
                db.collection('start_date').find({ _id: ObjectId("5df2de9cab1a07350096080e") }).toArray((err, result) => {
                    if (!err) {
                        let semesterStart = new Date(new Date(result[0].startDate).getTime() + (1 * 24 * 60 * 60 * 1000));
                        let db = client.db(dbName);
                        let jsonfile = {
                            week: {
                                timestamp: semesterStart.getTime(),
                                sessions: []
                            },
                            month: {
                                timestamp: semesterStart.getTime(),
                                sessions: []
                            },
                            semester: {
                                timestamp: semesterStart.getTime(),
                                sessions: []
                            }
                        }
                        jsonfile.week.sessions.push(helpSession);
                        jsonfile.month.sessions.push(helpSession);
                        jsonfile.semester.sessions.push(helpSession);
                        fs.writeFile(file, JSON.stringify(jsonfile), (err) => {
                            let response;
                            if (!err) {
                                response = { recorded: true, err: null }
                                callback(response);
                            } else {
                                response = { recorded: false, err: err }
                                callback(response)
                            }
                        });
                    }
                });
            });
        } else {
            let jsonfile = JSON.parse(data);
            console.log(jsonfile)
                //one week
            let cutOffDate = new Date(jsonfile.week.timestamp);
            cutOffDate.setTime(cutOffDate.getTime() + (7 * 24 * 60 * 60 * 1000));

            //one month
            let cutOffDate2 = new Date(jsonfile.month.timestamp);
            console.log(cutOffDate2);
            cutOffDate2.setTime(cutOffDate2.getTime() + (30 * 24 * 60 * 60 * 1000));

            //one semester 16 weeks
            let cutOffDate3 = new Date(jsonfile.semester.timestamp);
            cutOffDate3.setTime(cutOffDate3.getTime() + (112 * 24 * 60 * 60 * 1000));

            //test dates and insert sessions
            let today = new Date();
            if (today.getTime() > cutOffDate.getTime()) {
                console.log('in week');
                jsonfile.week.timestamp = Date.now();
                jsonfile.week.sessions = [];
                jsonfile.week.sessions.push(helpSession);
            } else {
                jsonfile.week.sessions.push(helpSession)
            }

            if (today.getTime() > cutOffDate2.getTime()) {
                console.log('in month');
                jsonfile.month.timestamp = Date.now();
                jsonfile.month.sessions = [];
                jsonfile.month.sessions.push(helpSession)
            } else {
                jsonfile.month.sessions.push(helpSession)
            }

            if (today.getTime() > cutOffDate3.getTime()) {
                console.log('in semester');
                jsonfile.semester.timestamp = Date.now();
                jsonfile.semester.sessions = [];
                jsonfile.semester.sessions.push(helpSession)
            } else {
                jsonfile.semester.sessions.push(helpSession)
            }

            fs.writeFile(file, JSON.stringify(jsonfile), (err) => {
                let response;
                if (!err) {
                    response = { recorded: true, err: null }
                    callback(response);
                } else {
                    response = { recorded: false, err: err }
                    callback(response)
                }
            });
        }
    });
}

function addAdmin(admin, callback) {
    bcrypt.hash(admin.password, 10, function(err, hash) {
        if (!err) {
            admin.password = hash;
            mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
                assert.equal(null, err);
                let db = client.db(dbName);
                db.collection('admin_users').insertOne(admin, (err, result) => {
                    assert.equal(null, err);
                    client.close();
                    callback({ inserted: true });
                });
            });
        }
    });
}

function deleteAdmin(id, callback) {
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        assert.equal(null, err);
        let db = client.db(dbName);
        db.collection('admin_users').deleteOne({ _id: ObjectId(id) }, (err, result) => {
            if (!err) {
                callback({ deleted: true });
            } else {
                console.log(err);
                callback({ deleted: false });
            }
            client.close();
        });
    });
}

function getAdmins(group, callback) {
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        assert.equal(null, err);
        let db = client.db(dbName);
        db.collection('admin_users').find({ permissions: group }).toArray((error, result) => {
            result.password = '';
            callback(err, result);
        });
    });
}

function getCourses(callback) {
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        assert.equal(null, err);
        let db = client.db(dbName);
        db.collection('courses').find().toArray((error, result) => {
            result.password = '';
            callback(err, result);
        });
    });
}

function addCourse(course, callback) {
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        assert.equal(null, err);
        let db = client.db(dbName);
        db.collection('courses').insertOne(course, (err, result) => {
            assert.equal(null, err);
            callback(err, result);
            client.close();
        });
    });
}

function deleteCourse(id, callback) {
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        assert.equal(null, err);
        let db = client.db(dbName);
        db.collection('courses').deleteOne({ _id: ObjectId(id) }, (err, result) => {
            if (!err) {
                callback({ deleted: true });
            } else {
                console.log(err);
                callback({ deleted: false });
            }
            client.close();
        });
    });
}

function getLabCourses(lab, callback) {
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        assert.equal(null, err);
        let db = client.db(dbName);
        db.collection('courses').find({ lab: lab }).toArray((error, result) => {
            result.password = '';
            callback(err, result);
        });
    });
}

function getLabData(lab, callback) {
    fs.readFile('helpSessionDumps/' + lab + '.json', function(err, data) {
        if (!err) {
            callback(JSON.parse(data));
        } else {
            callback(null);
            console.log(err);
        }
    });
}

function getLabInfo(callback) {
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        assert.equal(null, err);
        let db = client.db(dbName);
        db.collection('lab_times').find({}).toArray((error, result) => {
            callback(result);
        });
    });
}

function updateLabInfo(updateValue, labName, callback) {
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        assert.equal(null, err);
        let db = client.db(dbName);
        db.collection('lab_times').updateOne({ lab: labName }, { $set: updateValue }, (err, result) => {
            if (!err) {
                callback({ updated: true });
            } else {
                callback({ updated: false, error: err });
            }
        });
    });
}

function initSystem(sysDate, callback) {
    //1. store semester start date in database
    //2. transfer old files to an archive file
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        assert.equal(null, err);
        let db = client.db(dbName);
        db.collection('start_date').updateOne({ _id: ObjectId("5df2de9cab1a07350096080e") }, { $set: { startDate: sysDate } }, (err, result) => {
            if (!err) {
                console.log('success');
                for (let i = 0; i < fileNames.length; i++) {
                    console.log(fileNames[i]);
                    let file = fileNames[i];
                    let fullAddress = './helpSessionDumps/' + file;
                    let iserr = false;
                    if (fs.existsSync(fullAddress)) {
                        let dir = './helpSessionDumps/archive/';
                        let dest = path.resolve(dir, file);

                        fs.rename(fullAddress, dest, (err) => {
                            if (err) console.log(err);
                        });
                    }
                }
                callback({ init: true });
            } else {
                callback({ init: false });
            }
        });
    });
}