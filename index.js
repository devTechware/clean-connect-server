require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 3000;

const admin = require('firebase-admin');
const decoded = Buffer.from(process.env.FIREBASE_SERVICE_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);

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
    const db = client.db('clean_connect_db');
    const issuesCollection = db.collection('issues');
    const contributorsCollection = db.collection('contributors');

    // 🔥 UPDATED: Enhanced filtering with priority and sorting
    app.get("/issues", async (req, res) => {
      const { category, status, priority, sort } = req.query;
      const filter = {};

      if (category) filter.category = category;
      if (status) filter.status = status;
      if (priority) filter.priority = priority;

      // Sorting options
      let sortOption = {};
      if (sort === 'newest') {
        sortOption = { createdAt: -1 };
      } else if (sort === 'oldest') {
        sortOption = { createdAt: 1 };
      } else if (sort === 'priority') {
        // Custom sort: high -> medium -> low
        sortOption = { priority: 1 };
      } else if (sort === 'title') {
        sortOption = { title: 1 };
      } else {
        sortOption = { createdAt: -1 }; // Default: newest first
      }

      const result = await issuesCollection.find(filter).sort(sortOption).toArray();
      res.send(result);
    });

    app.get('/issues/:id', verifyFireBaseToken, async(req,res) => {
      const id = req.params.id;      
      const query = {_id: new ObjectId(id)};
      const result = await issuesCollection.findOne(query);
      res.send(result);
    });

    app.get('/latest-issues', async(req, res) => {
      const result = await issuesCollection.find().sort({createdAt: -1}).limit(6).toArray();
      res.send(result);
    });

    // 🔥 UPDATED: Post with automatic timestamp and default values
    app.post('/issues', verifyFireBaseToken, async (req,res) => {
      const newIssue = {
        ...req.body,
        createdAt: new Date().toISOString(), // Add timestamp
        updatedAt: new Date().toISOString(),
        status: req.body.status || 'pending', // Default status
        priority: req.body.priority || 'medium', // Default priority
        contributions: req.body.contributions || 0, // Default contributions
        totalContributions: req.body.totalContributions || 0, // Track total money
        userEmail: req.token_email, // Store who created it
      };
      const result = await issuesCollection.insertOne(newIssue);
      res.send(result);
    });

    // 🔥 UPDATED: Patch with more fields and updated timestamp
    app.patch('/issues/:id', verifyFireBaseToken, async(req, res) => {
      const id = req.params.id;      
      const updatedIssue = req.body;      
      const query = { _id: new ObjectId(id) };
      
      const updateFields = {
        updatedAt: new Date().toISOString(),
      };

      // Only update fields that are provided
      if (updatedIssue.title) updateFields.title = updatedIssue.title;
      if (updatedIssue.category) updateFields.category = updatedIssue.category;
      if (updatedIssue.amount) updateFields.amount = updatedIssue.amount;
      if (updatedIssue.description) updateFields.description = updatedIssue.description;
      if (updatedIssue.status) updateFields.status = updatedIssue.status;
      if (updatedIssue.priority) updateFields.priority = updatedIssue.priority;
      if (updatedIssue.location) updateFields.location = updatedIssue.location;
      if (updatedIssue.image) updateFields.image = updatedIssue.image;

      const update = { $set: updateFields };
      const result = await issuesCollection.updateOne(query, update);
      res.send(result);           
    });

    app.delete('/issues/:id', verifyFireBaseToken, async(req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }
        const result = await issuesCollection.deleteOne(query);
        res.send(result);
    });

    app.get('/my-issues', verifyFireBaseToken ,async (req, res) => {
      const email = req.query.email;      
      const query = {};
      if (email) {
          query.email = email;
          if(email !== req.token_email){
              return res.status(403).send({message: 'forbidden access'})
          }
      }
      const result = await issuesCollection.find(query).sort({createdAt: -1}).toArray();     
      res.send(result);
    });

    // 🔥 NEW: Get issues by user email for dashboard
    app.get('/issues/user/:email', verifyFireBaseToken, async (req, res) => {
      const email = req.params.email;
      
      if (email !== req.token_email) {
        return res.status(403).send({ message: 'forbidden access' });
      }

      const query = { userEmail: email };
      const result = await issuesCollection.find(query).sort({createdAt: -1}).toArray();
      res.send(result);
    });

    app.get('/contributors/:id', verifyFireBaseToken, async (req,res) => {
      const issueId = req.params.id;      
      const query = {issueId: issueId};
      const result = await contributorsCollection.find(query).toArray();
      res.send(result);
    });

    // 🔥 UPDATED: Add contribution and update issue total
    app.post('/contributors', verifyFireBaseToken, async (req,res) => {
      const contributor = {
        ...req.body,
        createdAt: new Date().toISOString(),
        email: req.token_email,
      };
      
      // Insert contributor
      const result = await contributorsCollection.insertOne(contributor);

      // Update issue's total contributions
      if (contributor.issueId && contributor.amount) {
        const issueQuery = { _id: new ObjectId(contributor.issueId) };
        await issuesCollection.updateOne(
          issueQuery,
          { 
            $inc: { 
              totalContributions: parseFloat(contributor.amount),
              contributions: 1 // Increment contribution count
            }
          }
        );
      }

      res.send(result);
    });

    app.get('/my-contributions', verifyFireBaseToken ,async (req, res) => {
      const email = req.query.email;      
      const query = {};
      if (email) {
          query.email = email;
          if(email !== req.token_email){
              return res.status(403).send({message: 'forbidden access'})
          }
      }
      const result = await contributorsCollection.find(query).sort({createdAt: -1}).toArray();     
      res.send(result);
    });

    // 🔥 NEW: Get statistics endpoint (optional)
    app.get('/stats', async (req, res) => {
      const totalIssues = await issuesCollection.countDocuments();
      const resolvedIssues = await issuesCollection.countDocuments({ status: 'resolved' });
      const pendingIssues = await issuesCollection.countDocuments({ status: 'pending' });
      
      // Get total contributions amount
      const contributions = await contributorsCollection.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: { $toDouble: "$amount" } }
          }
        }
      ]).toArray();

      const totalContributions = contributions.length > 0 ? contributions[0].total : 0;

      res.send({
        totalIssues,
        resolvedIssues,
        pendingIssues,
        totalContributions
      });
    });

    console.log('Pinged your deployment. You successfully connected to MongoDB!');
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Clean Connect Server is Running on port: ${port}`);  
});