// index.js (updated)
// BEE-II - Express + MongoDB Atlas (saved posts linked to userId)

import express from "express";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import session from "express-session";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

// File path helpers
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 4000;

// === MIDDLEWARES ===
app.use(express.static(path.join(__dirname, "public"))); // Serve static files
app.use(express.json({ limit: "50mb" })); // Handle JSON requests (big payloads allowed)
app.use(express.urlencoded({ limit: "50mb", extended: true })); // Handle form data (big payloads allowed)

// Session management (secret from .env)
app.use(session({
  secret: process.env.SESSION_SECRET || "default_secret_change_me",
  resave: false,
  saveUninitialized: false
}));

// === DATABASE CONNECTION ===
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI is not set in .env. Set MONGO_URI and restart.");
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log("✅ Connected to MongoDB Atlas");

  // Start server AFTER DB connects
  app.listen(port, () => {
    console.log(`🚀 App running at http://localhost:${port}`);
  });
})
.catch(err => {
  console.error("❌ MongoDB Atlas connection error:", err);
  process.exit(1); // Exit if DB fails to connect
});

// === SCHEMAS (updated: Post includes userId) ===
const userSchema = new mongoose.Schema({
  name: String,
  username: { type: String, unique: true },
  email: { type: String, unique: true },
  password: String
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

const postSchema = new mongoose.Schema({
  fName: String, // author name (copied from session at creation)
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // owner reference
  fTitle: String,
  fText: String,
  tDate: String,
  imageData: String
});
const Post = mongoose.model("Post", postSchema);

const contactSchema = new mongoose.Schema({
  name: String,
  email: String,
  message: String,
  submittedAt: { type: Date, default: Date.now }
});
const Contact = mongoose.model("Contact", contactSchema);

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Pass user info to all templates
app.use((req, res, next) => {
  res.locals.isAuthenticated = !!req.session.user;
  res.locals.currentUser = req.session.user;
  next();
});

// === ROUTES ===

// Home - show all posts
app.get("/", async (req, res) => {
  try {
    const submittedData = await Post.find({}).sort({ createdAt: -1 });
    res.render("index.ejs", { submittedData, showSearchbar: false, currentUser: req.session.user });
  } catch (err) {
    console.error("Error fetching posts for /:", err);
    res.status(500).send("Internal Server Error");
  }
});

// View posts - all or only my posts (uses userId)
app.get("/view", async (req, res) => {
  try {
    let submittedData;
    let showControls = false;

    if (req.query.myPosts === "true" && req.session.user) {
      // show posts owned by current user
      submittedData = await Post.find({ userId: req.session.user._id }).sort({ createdAt: -1 });
      showControls = true;
    } else {
      submittedData = await Post.find({}).sort({ createdAt: -1 });
    }

    res.render("view.ejs", {
      submittedData,
      user: req.session.user,
      showSearchbar: true,
      showControls
    });
  } catch (err) {
    console.error("Error in /view:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Search posts
app.get("/search", async (req, res) => {
  try {
    const searchQuery = req.query.q || "";
    const submittedData = await Post.find({
      fTitle: { $regex: searchQuery, $options: "i" }
    }).sort({ createdAt: -1 });

    res.render("view.ejs", {
      submittedData,
      showSearchbar: true,
      showControls: false,
      user: req.session.user
    });
  } catch (err) {
    console.error("Error in /search:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Create page
app.get("/create", (req, res) => {
  if (!req.session.user) {
    // require login to create
    return res.redirect("/login");
  }
  res.render("create.ejs", { showSearchbar: false });
});

// Submit new post (now enforces logged-in user and stores userId)
app.post("/submit", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).send("You must be logged in to create a post.");
    }

    const { title, text, imageData } = req.body;
    const today = new Date();

    const newPost = new Post({
      fName: req.session.user.name,         // authoritative author name
      userId: req.session.user._id,         // link post to user
      fTitle: title,
      fText: text,
      tDate: today.toDateString(),
      imageData
    });

    await newPost.save();
    res.redirect("/");
  } catch (error) {
    console.error("Error submitting post:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Get post count for current user
app.get("/api/user-post-count", async (req, res) => {
  if (!req.session.user) return res.json({ count: 0 });
  try {
    const count = await Post.countDocuments({ userId: req.session.user._id });
    res.json({ count });
  } catch (err) {
    console.error("Error fetching post count:", err);
    res.status(500).json({ count: 0 });
  }
});

// Edit (show edit page) - only owner allowed to edit
app.get("/edit/:id", async (req, res) => {
  try {
    const postToEdit = await Post.findById(req.params.id);
    if (!postToEdit) return res.status(404).send("Post not found");

    // Ownership check
    if (!req.session.user || postToEdit.userId.toString() !== req.session.user._id.toString()) {
      return res.status(403).send("You are not authorized to edit this post.");
    }

    res.render("create", { postToEdit, showSearchbar: false });
  } catch (err) {
    console.error("Error in GET /edit/:id:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Edit (submit changes) - owner only
app.post("/edit/:id", async (req, res) => {
  try {
    const { title, text, imageData } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).send("Post not found");

    // Ownership check
    if (!req.session.user || post.userId.toString() !== req.session.user._id.toString()) {
      return res.status(403).send("You are not authorized to edit this post.");
    }

    const updateFields = {
      fTitle: title,
      fText: text
    };

    if (imageData?.trim()) updateFields.imageData = imageData;

    await Post.findByIdAndUpdate(req.params.id, updateFields, { new: true });
    res.redirect("/view?myPosts=true");
  } catch (error) {
    console.error("Error updating post:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Delete post - owner only
app.post("/delete/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).send("Post not found");

    // Ownership check
    if (!req.session.user || post.userId.toString() !== req.session.user._id.toString()) {
      return res.status(403).send("You are not authorized to delete this post.");
    }

    await Post.findByIdAndDelete(req.params.id);
    res.redirect("/");
  } catch (err) {
    console.error("Error deleting post:", err);
    res.status(500).send("Error deleting the post.");
  }
});

// Signup
app.get("/signup", (req, res) => {
  res.render("signup.ejs", { showSearchbar: false });
});

app.post("/signup", async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) return res.status(400).send("Username or email already exists.");

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, username, email, password: hashedPassword });
    await user.save();
    res.redirect("/login");
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).send("Something broke during signup!");
  }
});

// Login
app.get("/login", (req, res) => {
  res.render("login.ejs", { showSearchbar: false });
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [{ username }, { email: username }] });

    if (user && await bcrypt.compare(password, user.password)) {
      req.session.user = {
        _id: user._id,            // ObjectId (serialized)
        name: user.name,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt
      };
      return res.redirect("/");
    }
    console.log("Login failed: Wrong credentials");
    res.redirect("/login");
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).send("Something broke during login!");
  }
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// Profile
app.get("/profile", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.render("profile", { user: req.session.user });
});

// Single post view
app.get("/post/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).send("Post not found");
    res.render("post", { post, showSearchbar: true });
  } catch (error) {
    console.error("Error fetching post:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Contact form
app.post("/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;
    const newContact = new Contact({ name, email, message });
    await newContact.save();
    res.status(200).send("Message sent successfully!");
  } catch (error) {
    console.error("Error saving contact form data:", error);
    res.status(500).send("Internal server error.");
  }
});

// Error middleware (useful details in dev)
app.use((err, req, res, next) => {
  console.error("Error caught by middleware:", err);
  res.status(500).send(`Something broke! Details: ${err.message}`);
});
