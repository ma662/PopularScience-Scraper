var express = require("express");
var exphbs = require("express-handlebars");
var mongoose = require("mongoose");

var axios = require("axios");
var cheerio = require("cheerio");

var db = require("./models");

var PORT = process.env.PORT || 8080;

var app = express();

// app config
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

// handlebars initialization
app.engine("handlebars", exphbs({ defaultLayout: "main" }));
app.set("view engine", "handlebars");

// let mdb = process.env.MONGODB_URI;

var MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/article_db";
mongoose.connect(MONGODB_URI);

// mongoose.connect("", { useNewUrlParser: true });
// mongoose.connect( mdb, { useNewUrlParser: true} );

app.get("/", function(req, res) {
  res.render("index");
});

app.get("/scrape", function(req, res) {
  console.log("Attempting server /scrape");
  // First, we grab the body of the html with axios
  axios.get("https://www.space.com/science-astronomy").then(function(response) {
    // Then, we load that into cheerio and save it to $ for a shorthand selector
    var $ = cheerio.load(response.data);

    // prepare 
    var results = [];
    $(".listingResult").each(function() {
      let result = {};

      result.title = $(this).find(".article-name").text();
      result.title = result.title.replace(/\n/gm,"");
      result.title = result.title.replace(/\\/g, "/");

      result.summary = $(this).find(".synopsis").text();
      result.summary = result.summary.replace(/\n/gm,"");
      result.summary = result.summary.replace(/\\/g, "/");

      result.link = $(this).children("a").attr("href");

      results.push(result);
    });
    console.log(results);
    
    // empty result object
    var er = { title: '', summary: '', link: undefined };

    for (var i=0; i<results.length; i++) {
      console.log("===========");
      console.log(results[i]);
      // if find this empty result, delete from array. It's empty because it's an ad div
      if (results[i].title === er.title 
        && results[i].summary === er.summary 
        && results[i].link === er.link) {
        console.log("Empty obj found");
        results.splice(i, 1);
      }
    };

    console.log("Logging new result", results);    

    // for loop to inject results into db
    for (var i=0; i<results.length; i++) {
      let result = results[i];

      db.Article.find( { title: result.title }, function(err, ret) {
        if (err) { throw (err); }

        console.log("Response from db: ", ret);

        // if db returns something, do not add
        if (ret.length !== 0) {
          console.log("========", "Duplicate article detected. Not adding.", "========",);
        }
        // else, add to database
        else {
          db.Article.create(result)
            .then(function(dbArticle) {
              // View the added result in the console
              console.log("========", "added article: ", dbArticle, "========",);
            })
            .catch(function(err) {
              // If an error occurred, log it
              console.log(err);
            });
        }
      });
    }
    // Send a message to the client
    res.send("Scrape Complete");
  });
});


// Route for getting all Articles from the db
app.get("/articles", function(req, res) {
  // Grab every document in the Articles collection
  db.Article.find({})
    .then(function(dbArticle) {
      console.log("dbArticle looks like this: ", dbArticle);
      // If we were able to successfully find Articles, send them back to the client
      res.json(dbArticle);
    })
    .catch(function(err) {
      // If an error occurred, send it to the client
      res.json(err);
    });
});

// Route for grabbing a specific Article by id, populate it with it's note
app.get("/articles/:id", function(req, res) {
  // Using the id passed in the id parameter, prepare a query that finds the matching one in our db...
  db.Article.findOne({ _id: req.params.id })
    // ..and populate all of the notes associated with it
    .populate("note")
    .then(function(dbArticle) {
      // If we were able to successfully find an Article with the given id, send it back to the client
      res.json(dbArticle);
    })
    .catch(function(err) {
      // If an error occurred, send it to the client
      res.json(err);
    });
});

// Route for saving/updating an Article's associated Note
app.post("/articles/:id", function(req, res) {
  // Create a new note and pass the req.body to the entry
  db.Note.create(req.body)
    .then(function(dbNote) {
      // If a Note was created successfully, find one Article with an `_id` equal to `req.params.id`. Update the Article to be associated with the new Note
      // { new: true } tells the query that we want it to return the updated User -- it returns the original by default
      // Since our mongoose query returns a promise, we can chain another `.then` which receives the result of the query
      return db.Article.findOneAndUpdate({ _id: req.params.id }, { note: dbNote._id }, { new: true });
    })
    .then(function(dbArticle) {
      // If we were able to successfully update an Article, send it back to the client
      res.json(dbArticle);
    })
    .catch(function(err) {
      // If an error occurred, send it to the client
      res.json(err);
    });
});

app.listen(PORT, function() {
  console.log("Server listening on: http://localhost:" + PORT );
});