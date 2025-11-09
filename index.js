const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req,res) => {
  res.send('Clean Connect Server is Running');
});

app.listen(port, () => {
  console.log(`Clean Connect Server is Running on port: ${port}`);  
});