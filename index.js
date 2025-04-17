import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

import bodyParser from "body-parser";
import mongoose from "mongoose";


const port = 4000;
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));

let submittedData = [];
// ✅ 2. CONNECT TO MONGODB
mongoose.connect("mongodb://127.0.0.1:27017/blogDB", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }).then(() => {
    console.log("Connected to MongoDB");
  }).catch((err) => {
    console.error("MongoDB connection error:", err);
  });
  
  // ✅ 3. DEFINE SCHEMA + MODEL
  const postSchema = new mongoose.Schema({
    fName: String,
    fTitle: String,
    fText: String,
    tDate: String,
  });
  
  const Post = mongoose.model("Post", postSchema);
  
  // ✅ 4. MIDDLEWARES – WRITE THIS HERE
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, "public")));
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  
app.get("/", async (req, res) => {
    const submittedData = await Post.find({});
    res.render("index.ejs", { submittedData });
  });
  
app.get("/create", (req, res) => {
    res.render("create.ejs");
});
app.get("/view", async (req, res) => {
    const submittedData = await Post.find({});
    res.render("view.ejs", { submittedData });
  });
  

  app.get("/search", async (req, res) => {
    const searchQuery = req.query.q; // Extract the search query from the URL (q parameter)
    
    // Search for posts where the title matches the search query (case-insensitive)
    const submittedData = await Post.find({
        fTitle: { $regex: searchQuery, $options: "i" } // "i" makes it case-insensitive
    });
    
    res.render("index.ejs", { submittedData });
});

app.post("/submit", async (req, res) => {
    try {
      const { name, title, text } = req.body;
      const today = new Date();
  
      const newPost = new Post({
        fName: name,
        fTitle: title,
        fText: text,
        tDate: today.toDateString()
      });
  
      await newPost.save();
      res.redirect("/");
    } catch (error) {
      console.error("Error submitting post:", error);
      res.status(500).send("Internal Server Error");
    }
  });
  
  
  app.get("/edit/:id", async (req, res) => {
    const postId = req.params.id;
    const postToEdit = await Post.findById(postId);
    if (!postToEdit) {
        return res.status(404).send("Post not found");
    }
    res.render("create", { postToEdit });
});

app.post("/edit/:id", async (req, res) => {
    const postId = req.params.id;
    const { name, title, text } = req.body;
    try {
        const updatedPost = await Post.findByIdAndUpdate(
            postId,
            { fName: name, fTitle: title, fText: text },
            { new: true }
        );
        if (!updatedPost) {
            return res.status(404).send("Post not found");
        }
        res.redirect("/");
    } catch (error) {
        console.error("❌ Error updating post:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.post("/delete/:id", async (req, res) => {
    const postId = req.params.id;
    try {
        await Post.findByIdAndDelete(postId);
        res.redirect("/");
    } catch (err) {
        console.error("❌ Error deleting post:", err);
        res.status(500).send("Error deleting the post.");
    }
});

// Add error-handling middleware here — BELOW all your routes
app.use((err, req, res, next) => {
  console.error("Error caught by middleware:", err.stack);
  res.status(500).send("Something broke!");
});


app.listen(port, () => {
    console.log(`App Listening at port:- ${port}`);
});