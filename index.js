import express from "express"
import cors from "cors"
import 'dotenv/config'
import { MongoClient } from 'mongodb';

const PORT = process.env.PORT || 5000;

const app = express();

app.use(express.json());
app.use(cors());


const client = new MongoClient(process.env.MONGODB_URI);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const studioSpaceClient = await connectToMongoDB();

const db = studioSpaceClient.db("studioSpace");


app.get("/", (req,res)=> {
    res.send("Server running successfully");
})


app.listen(PORT, ()=>{
    console.log(`Server running on port ${PORT}`);
})