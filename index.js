import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import bodyParser from "body-parser";
import mongoose from "mongoose";
import session from "express-session";
import bcrypt from "bcrypt";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const port = 4000;
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "your-secret-key",
  resave: false,
  saveUninitialized: false
}));

// ✅ 2. CONNECT TO MONGODB
mongoose.connect("mongodb://127.0.0.1:27017/blogDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true,

}).then(() => {
  console.log("Connected to MongoDB");
}).catch((err) => {
  console.error("MongoDB connection error:", err);
});
const userSchema = new mongoose.Schema({
  name: String,
  username: { type: String, unique: true },
  email: { type: String, unique: true },
  password: String
}, { timestamps: true }); // 👈 this enables `createdAt`



const User = mongoose.model("User", userSchema);

// ✅ 3. DEFINE SCHEMA + MODEL
const postSchema = new mongoose.Schema({
  fName: String,
  fTitle: String,
  fText: String,
  tDate: String,
  imageData: String
});

const Post = mongoose.model("Post", postSchema);

// Contact Us Schema
const contactSchema = new mongoose.Schema({
  name: String,
  email: String,
  message: String,
  submittedAt: { type: Date, default: Date.now }
});

const Contact = mongoose.model("Contact", contactSchema);


// ✅ 4. MIDDLEWARES – WRITE THIS HERE
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use((req, res, next) => {
  res.locals.isAuthenticated = !!req.session.user;
  res.locals.currentUser = req.session.user;
  next();
});

let submittedData = [];
app.get("/", async (req, res) => {
  const submittedData = await Post.find({});
  res.render("index.ejs", { submittedData, showSearchbar: false, currentUser: req.session.user });
});

app.get("/view", async (req, res) => {
  let submittedData;
  let showControls = false;

  if (req.query.myPosts === "true" && req.session.user) {
    // Show only posts by the current user
    submittedData = await Post.find({ fName: req.session.user.name });
    showControls = true; // Enable edit/delete for own posts
  } else {
    // Show all posts
    submittedData = await Post.find({});
  }

  res.render("view.ejs", {
    submittedData,
    user: req.session.user,
    showSearchbar: true,
    showControls: showControls
  });

});



app.get("/search", async (req, res) => {
  const searchQuery = req.query.q;
  const submittedData = await Post.find({
    fTitle: { $regex: searchQuery, $options: "i" }
  });
  res.render("view.ejs", {
    submittedData,
    showSearchbar: true,
    showControls: false,
    user: req.session.user
  });

});

app.get("/create", (req, res) => {
  res.render("create.ejs", { showSearchbar: false });
});


app.post("/submit", async (req, res) => {
  try {
    const { name, title, text, imageData } = req.body;
    const today = new Date();

    const newPost = new Post({
      fName: name,
      fTitle: title,
      fText: text,
      tDate: today.toDateString(),
      imageData: imageData
    });

    await newPost.save();
    res.redirect("/");
  } catch (error) {
    console.error("Error submitting post:", error);
    res.status(500).send("Internal Server Error");
  }
});
app.get("/api/user-post-count", async (req, res) => {
  if (!req.session.user) {
    return res.json({ count: 0 });
  }

  try {
    const count = await Post.countDocuments({ fName: req.session.user.name });
    res.json({ count });
  } catch (err) {
    console.error("Error fetching post count:", err);
    res.status(500).json({ count: 0 });
  }
});



app.get("/edit/:id", async (req, res) => {
  const postId = req.params.id;
  const postToEdit = await Post.findById(postId);
  if (!postToEdit) {
    return res.status(404).send("Post not found");
  }
  res.render("create", { postToEdit, showSearchbar: false });
});

app.post("/edit/:id", async (req, res) => {
  const postId = req.params.id;
  const { name, title, text, imageData } = req.body;

  try {
    const updateFields = {
      fName: name,
      fTitle: title,
      fText: text,
    };

    // Only update image if new one is uploaded
    if (imageData && imageData.trim() !== "") {
      updateFields.imageData = imageData;
    }

    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      updateFields,
      { new: true }
    );

    if (!updatedPost) {
      return res.status(404).send("Post not found");
    }

    res.redirect("/view");
  } catch (error) {
    console.error("Error updating post:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/delete/:id", async (req, res) => {
  const postId = req.params.id;
  try {
    await Post.findByIdAndDelete(postId);
    res.redirect("/");
  } catch (err) {
    console.error(" Error deleting post:", err);
    res.status(500).send("Error deleting the post.");
  }
});

app.get("/signup", (req, res) => {
  res.render("signup.ejs", { showSearchbar: false });
});

app.post("/signup", async (req, res) => {
  const { name, username, email, password } = req.body;

  try {
    // Check if username or email already exists
    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });

    if (existingUser) {
      return res.status(400).send("Username or email already exists. Please choose another.");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, username, email, password: hashedPassword });
    await user.save();
    res.redirect("/login");
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).send("Something broke during signup!");
  }
});



app.get("/login", (req, res) => {
  res.render("login.ejs", { showSearchbar: false });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({
      $or: [{ username }, { email: username }]
    });

    if (user && await bcrypt.compare(password, user.password)) {
      req.session.user = {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        createdAt: new Date(user.createdAt)
      };
      return res.redirect("/");
    } else {
      console.log("Login failed: Wrong credentials");
      return res.redirect("/login");
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).send("Something broke during login!");
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.get('/profile', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  res.render('profile', { user: req.session.user });
});

app.get("/post/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).send("Post not found");
    }
    res.render("post", { post, showSearchbar: true });
  } catch (error) {
    console.error("Error fetching post:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Route to handle contact form submission
app.post("/contact", async (req, res) => {
  const { name, email, message } = req.body;

  try {
    // Create a new contact document
    const newContact = new Contact({
      name,
      email,
      message
    });

    // Save the contact data to MongoDB
    await newContact.save();
    
    // Send a success response
    res.status(200).send("Message sent successfully!");
  } catch (error) {
    console.error("Error saving contact form data:", error);
    res.status(500).send("Internal server error. Please try again.");
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

