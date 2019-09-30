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


app.use(express.static(path.join(__dirname, 'public')))
app.use(bodyParser.json());
app.use(cors());
var urlencodedParser = bodyParser.urlencoded({ extended: false })
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.get('/', (req, res) => res.render('pages/index'))
app.listen(PORT, () => console.log(`Listening on ${ PORT }`))


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
            question: req.body.question
        }
        let db = client.db(dbName);
        let qcollection = req.body.collection;
        db.collection(qcollection).insertOne(studentRequest, (err, result) => {
            assert.equal(null, err);
            if (result.insertedCount > 0) {
                console.log('inserted request');
                res.status(200).send({ inserted: true });
                res.end();
            } else {
                console.error('request was not inserted');
                res.status(500).send({ inserted: false });
                res.end();
            }

            client.close();
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
    mongo.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
        let db = client.db(dbName);
        let qcollection = req.body.collection;
        db.collection(qcollection).find().toArray((error, result) => {
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