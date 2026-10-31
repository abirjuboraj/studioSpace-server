import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient } from "mongodb";

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

const studioCollection = db.collection("studios");

app.get("/", (req, res) => {
  res.send("Server running successfully");
});

//all studio get

app.get("/studios", async (req, res) => {
  try {
    const studios = await studioCollection.find().toArray();

    res.send(studios);
  } catch (error) {
    console.error("GET /studios failed:", err);
    res.status(500).json({ success: false, message: "Failed to load studios" });
  }
});

//new studio add

app.post("/studios/new", async (req, res) => {
  const newStudio = req.body;

  try {
    const result = await studioCollection.insertOne(newStudio);
    res.json({
      success: true,
      message: "data received",
      Data: newStudio,
      Result: result,
    });
  } catch (err) {
    console.error("POST /studios/new failed:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to add new studio" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
