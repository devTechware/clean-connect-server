const express = require('express');
const cors = require('cors');
require('dotenv').config();
const admin = require('firebase-admin');
const serviceAccount = require('./clean-connect--firebase-admin-key.json');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 3000;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

app.use(cors());
app.use(express.json());

const verifyFireBaseToken = async (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    const token = authorization.split(' ')[1];
    
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        //console.log('inside token', decoded)
        req.token_email = decoded.email;
        next();
    }
    catch (error) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@mycluster.qr6fs5z.mongodb.net/?appName=MyCluster`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

app.get('/', (req,res) => {
  res.send('Clean Connect Server is Running');
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db('clean_connect_db');
    const issuesCollection = db.collection('issues');

    app.get('/issues', async (req, res) => {
      const result = await issuesCollection.find().toArray();
      res.send(result);
    });

    app.post('/issues', verifyFireBaseToken, async (req,res) => {
      const newIssue = req.body;
      const result = await issuesCollection.insertOne(newIssue);
      res.send({
        success: true,
        result
      });
    });

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log('Pinged your deployment. You successfully connected to MongoDB!');
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Clean Connect Server is Running on port: ${port}`);  
});