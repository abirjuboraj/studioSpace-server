import express from "express";
import cors from "cors";
import "dotenv/config";
import multer from "multer";
import { MongoClient, ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";

const PORT = process.env.PORT || 5000;

const app = express();

app.use(express.json());
app.use(cors());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});


async function uploadToImgbb(buffer) {
  const body = new FormData();
  body.append("image", buffer.toString("base64"));

  const res = await fetch(
    `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
    { method: "POST", body },
  );
  const data = await res.json();

  if (!data.success) throw new Error("imgbb upload failed");
  return data.data.url;
}

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
const studioBookingCollection = db.collection("bookings");

const AUTH_URL = process.env.BETTER_AUTH_URL;

const JWKS = createRemoteJWKSet(new URL(`${AUTH_URL}/api/auth/jwks`));

const verifyJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({
      message: "Authorization token missing",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: AUTH_URL,
      audience: AUTH_URL,
    });

    req.jwtPayload = payload;
    next();
  } catch (error) {
    console.error("JWT Verification Error:", error.code, error.message);

    return res.status(401).send({
      message: "Invalid or expired token",
    });
  }
};

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

//host studio get

app.get("/my-studio-listings/:hostEmail", verifyJWT, async (req, res) => {
  try {
    const { hostEmail } = req.params;

    if (!hostEmail)
      return res.status(400).send({ message: "Host Email is required" });

    const hostStudios = await studioCollection
      .find({ hostEmail: hostEmail })
      .toArray();
    res.send(hostStudios);
  } catch (error) {
    console.error("GET /my-studio-listings/:hostEmail failed:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load host studios" });
  }
});

// host studio update
app.patch(
  "/edit/:id",
  verifyJWT,
  upload.array("images", 6),
  async (req, res) => {
    try {
      const { id } = req.params;
      const hostEmail = req.jwtPayload?.email;

      if (!hostEmail) {
        return res.status(401).send({
          message: "Unauthorized",
        });
      }

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          message: "Invalid studio Id",
        });
      }

      if (!req.body.data) {
        return res.status(400).send({
          message: "Studio data is required",
        });
      }

      const updatedStudio = JSON.parse(req.body.data);

      delete updatedStudio._id;
      delete updatedStudio.hostId;
      delete updatedStudio.hostEmail;

      if (req.files && req.files.length > 0) {
        const uploadedUrls = await Promise.all(
          req.files.map((file) => uploadToImgbb(file.buffer)),
        );

        updatedStudio.images = uploadedUrls;
      }

      const result = await studioCollection.updateOne(
        {
          _id: new ObjectId(id),
          hostEmail: hostEmail,
        },
        {
          $set: updatedStudio,
        },
      );

      if (result.matchedCount === 0) {
        return res.status(404).send({
          message: "Studio not found or unauthorized",
        });
      }

      res.status(200).send({
        success: true,
        message: "Studio updated successfully",
      });
    } catch (error) {
      console.error("PATCH /edit/:id failed:", error);

      res.status(500).send({
        success: false,
        message: "Failed to update studio",
      });
    }
  },
);

// host studio delete
app.delete("/studios/:id", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;

    const hostEmail = req.jwtPayload?.email;

    if (!hostEmail) {
      return res.status(401).send({
        message: "Unauthorized",
      });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid studio Id",
      });
    }

    const result = await studioCollection.deleteOne({
      _id: new ObjectId(id),
      hostEmail: hostEmail,
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "Studio not found or unauthorized",
      });
    }

    res.status(200).send({
      success: true,
      message: "Studio deleted successfully",
    });
  } catch (error) {
    console.error("DELETE /studios/:id failed:", error);

    res.status(500).send({
      success: false,
      message: "Failed to delete studio",
    });
  }
});

// featured studios get (top 6 rated)

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

// studio details get

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

app.post(
  "/studios/add-studio",
  verifyJWT,
  upload.array("images", 6),
  async (req, res) => {
    try {
      const newStudio = JSON.parse(req.body.data);

      const uploadedUrls = await Promise.all(
        (req.files || []).map((file) => uploadToImgbb(file.buffer)),
      );
      newStudio.images = uploadedUrls;

      if (newStudio.images.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "At least one image is required" });
      }

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
  },
);

// booked studio get

app.get("/bookings/:userEmail", verifyJWT, async (req, res) => {
  try {
    const { userEmail } = req.params;

    if (!userEmail)
      return res.status(400).send({ message: "User Email is required" });

    const userBookings = await studioBookingCollection
      .find({ userEmail: userEmail })
      .toArray();

    res.send(userBookings);
  } catch (error) {
    console.error("GET /bookings/:email failed:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load user bookings" });
  }
});

// studio booking add
app.post("/bookings", verifyJWT, async (req, res) => {
  try {
    const studioBooked = req.body;

    const result = await studioBookingCollection.insertOne(studioBooked);
    res.json({
      success: true,
      message: "Booking received",
      Data: studioBooked,
      Result: result,
    });
  } catch (error) {
    console.error("POST /bookings failed:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to add new booking" });
  }
});

// booking cancel

app.patch("/bookings/:id/cancel", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;

    const userId = req.jwtPayload?.sub;

    if (!userId) {
      return res.status(401).send({
        message: "Unauthorized",
      });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid booking Id",
      });
    }

    const result = await studioBookingCollection.updateOne(
      {
        _id: new ObjectId(id),
        userId: userId,
        status: "pending",
      },
      {
        $set: {
          status: "cancelled",
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        message: "Booking not found or cannot be cancelled",
      });
    }

    res.status(200).send({
      success: true,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    console.error("PATCH /bookings/:id/cancel failed:", error);

    res.status(500).send({
      success: false,
      message: "Failed to cancel booking",
    });
  }
});

// multer error handler
app.use((err, req, res, next) => {
  if (
    err instanceof multer.MulterError ||
    err.message === "Only image files are allowed"
  ) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
