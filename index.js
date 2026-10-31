import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

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

// featured studios (top 6 rated)

app.get("/featured-studios", async (req, res) => {
  try {
    const featuredStudios = await studioCollection
      .find()
      .sort({ rating: -1 })
      .limit(6)
      .toArray();

    res.send(featuredStudios);
  } catch (error) {
    console.error("GET /featured-studios failed:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to load featured studios" });
  }
});

// studio details

app.get("/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).send({ message: "Invalid studio Id" });

    const studio = await studioCollection.findOne({ _id: new ObjectId(id) });

    if (!studio) return res.status(404).send({ message: "Studio not found" });
    res.send(studio);
  } catch (error) {
    res.status(500).send({ message: "Something went wrong" });
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
