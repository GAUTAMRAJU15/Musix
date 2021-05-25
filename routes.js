const shortId = require("shortid");
const IPFS_CLIENT = require("ipfs-http-client");

// set up a remote node connection
const ipfs = IPFS_CLIENT.create({
  host: "ipfs.infura.io",
  port: 5001,
  protocol: "https",
});

const ErrorResponse = (errorData) => {
  const { res, status, statusCode, reason } = errorData;
  res.status(statusCode).json({ status, reason });
};

const routes = (app, db, lms, accounts) => {
  const userCollection = db.collection("music-users");
  const musicCollection = db.collection("music-store");

  // register user
  app.post("/register", (req, res) => {
    const email = req.body.email;
    const uniqueId = shortId.generate();
    if (email) {
      userCollection.findOne({ email }, (err, result) => {
        if (err) throw err;
        if (result) {
          ErrorResponse({
            res,
            status: "failed",
            statusCode: 400,
            reason: "Already Registered!",
          });
        } else {
          userCollection.insertOne({ email });
          res.status(200).json({ status: "registered", id: uniqueId });
        }
      });
    } else {
      ErrorResponse({
        res,
        status: "failed",
        statusCode: 400,
        reason: "Wrong input!",
      });
    }
  });

  // login user
  app.post("/login", (req, res) => {
    const email = req.body.email;
    if (email) {
      userCollection.findOne({ email }, (err, result) => {
        if (result) {
          res.status(200).json({ status: "logged in", id: res.id });
        } else {
          ErrorResponse({
            res,
            status: "failed",
            statusCode: 400,
            reason: "Not recognised!",
          });
        }
      });
    } else {
      ErrorResponse({
        res,
        status: "failed",
        statusCode: 400,
        reason: "Wrong input!",
      });
    }
  });

  // upload details
  app.put("/upload", async (req, res) => {
    const ID = shortId.generate() + shortId.generate() + shortId.generate();
    let steamError = false;
    const musicInfo = { title: "", name: "" };
    let body = [];

    if (req.busboy) {
      req.busboy.on("file", async function (fieldname, file, filename) {
        if (fieldname && filename) {
          // readable stream
          file.on("data", function (data) {
            body.push(data);
          });

          file.on("end", async function () {
            body = Buffer.concat(body);
            // successfully added
            let ipfsHash = await ipfs.add(body);
            const response = await lms.sendIpfs(ID, ipfsHash.path, {
              from: accounts[0],
            });

            musicCollection.insertOne({
              ID,
              cid: ipfsHash.path,
              title: musicInfo.title,
              name: musicInfo.name,
            });
            res.status(200).json({ status: "success", cid: ipfsHash.path, ID });
          });
        } else {
          req.busboy.destroy();
          steamError = true;
          ErrorResponse({
            res,
            status: "failed",
            statusCode: 400,
            reason: "Sorry something happened!",
          });
        }
      });
      req.busboy.on("field", function (key, value) {
        if (key) {
          musicInfo[key] = value;
        } else {
          req.busboy.destroy();
          steamError = true;
          ErrorResponse({
            res,
            status: "failed",
            statusCode: 400,
            reason: "Sorry something happened!",
          });
        }
      });
      req.pipe(req.busboy);
    }
  });

  // fetch all the music corresponding to a user
  app.get("/access/:email", async (req, res) => {
    const { email } = req.params;
    if (email) {
      userCollection.findOne({ email }, async (err, response) => {
        if (response) {
          const data = await musicCollection.find().toArray();
          res.status(200).json({ status: "success", data });
        }
      });
    } else {
      ErrorResponse({
        res,
        status: "failed",
        statusCode: 400,
        reason: "Please add correct Inputs!",
      });
    }
  });

  // fetch a specific music collection
  app.get("/access/:email/:id", async (req, res) => {
    const { id, email } = req.params;
    if (id && email) {
      userCollection.findOne({ email }, async (err, response) => {
        if (response) {
          const hashValue = await lms.getHash.call(id);
          const data = await ipfs.get(hashValue);
          const content = [];
          for await (const file of data) {
            if (!file.content) continue;
            for await (const chunk of file.content) {
              // bingo got the chunk!
              content.push(chunk);
            }
          }
          // console.log(content);
        } else {
          ErrorResponse({
            res,
            status: "failed",
            statusCode: 400,
            reason: "Wrong input!",
          });
        }
      });
    } else {
      ErrorResponse({
        res,
        status: "failed",
        statusCode: 400,
        reason: "Wrong input!",
      });
    }
  });
};

module.exports = { routes };
