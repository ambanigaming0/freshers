const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname))); // serve index.html, verify.html etc.

const config = require("./conf.json")

const ADMIN_PASSWORD = String(config.PASS).trim();

const BASE_URL = String(config.URL).trim();

// ---------- MongoDB ----------
mongoose
  .connect(
    "mongodb+srv://ambani:ambani@spider.5umv2xz.mongodb.net/?appName=spider"
  )
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log("DB Error:", err));

// Pass Schema
const passSchema = new mongoose.Schema({
  name: String,
  id: Number, // numeric ID: 1,2,3...
  food: String,
  qrPath: String,
  date: { type: Date, default: Date.now },
});
const Pass = mongoose.model("Pass", passSchema);

// Counter Schema (auto increment)
const counterSchema = new mongoose.Schema({
  name: String,
  value: Number,
});
const Counter = mongoose.model("Counter", counterSchema);

async function generateSequentialNumber() {
  let counter = await Counter.findOne({ name: "pass_id" });

  if (!counter) {
    counter = new Counter({ name: "pass_id", value: 1 });
    await counter.save();
    return 1;
  }

  counter.value += 1;
  await counter.save();
  return counter.value;
}

// QR folder
const qrDir = path.join(__dirname, "qrsaves");
if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir);

// ---------- Middleware ----------
function checkAdmin(req, res, next) {
  const token = req.query.token || req.headers["x-admin-pass"];
  if (token !== ADMIN_PASSWORD)
    return res.status(403).json({ success: false, message: "Admin only" });
  next();
}

// ---------- Routes ----------

// 1) Save pass + generate QR (index.html se call hota hai)
app.post("/save-pass", async (req, res) => {
  try {
    const { name, food } = req.body;

    if (!name) return res.json({ success: false, message: "Name required" });

    const id = await generateSequentialNumber(); // numeric

    // URL jo QR me encode hoga:
    const verifyUrl = `${BASE_URL}/verify.html?id=${id}`;

    // High-quality QR PNG generate
    const qrFile = path.join(qrDir, `${id}.png`);
    await QRCode.toFile(qrFile, verifyUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      scale: 10,
    });

    const newPass = new Pass({
      name,
      id,
      food,
      qrPath: `/admin-qrs/${id}.png`,
    });

    await newPass.save();

    res.json({ success: true, id, verifyUrl });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: err.message });
  }
});

// 2) Verify API – verify.html yahi se details lega
app.get("/verify-pass/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ success: false, message: "Invalid ID" });
    }

    const pass = await Pass.findOne({ id });
    if (!pass) {
      return res.json({ success: false, message: "Pass not found" });
    }

    res.json({ success: true, pass });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: err.message });
  }
});

// 3) (Optional) Admin list ke liye
app.get("/get-passes", checkAdmin, async (req, res) => {
  const data = await Pass.find().sort({ date: -1 });
  res.json(data);
});

// 4) Secure QR image folder (admin only)
app.use("/admin-qrs", (req, res, next) => {
  const token = req.query.token || req.headers["x-admin-pass"];
  if (token !== ADMIN_PASSWORD) return res.status(403).send("Forbidden");
  next();
});
app.use("/admin-qrs", express.static(path.join(__dirname, "qrsaves")));
app.use("/admin-qrs", (req,res,next)=>{
  res.header("Access-Control-Allow-Origin", "*");
  next();
});


// 5) Update USer
app.patch("/update-food/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { food } = req.body;

    const pass = await Pass.findOne({ id });
    if (!pass) return res.json({ success: false, message: "Pass not found" });

    pass.food = food;
    await pass.save();

    res.json({ success: true, message: "Updated", food });

  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});
app.delete("/delete-pass/:_id", async (req, res) => {
  try {
    const _id = req.params._id;

    const result = await Pass.deleteOne({ _id });

    if (result.deletedCount === 0) {
      return res.json({ success: false, message: "Pass not found" });
    }

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});
app.put("/update-pass/:_id", async (req, res) => {
  try {
    const _id = req.params._id;
    const { name, food } = req.body;

    const updated = await Pass.findByIdAndUpdate(
      _id,
      { name, food },
      { new: true }
    );

    if (!updated) {
      return res.json({ success: false, message: "Pass not found" });
    }

    res.json({ success: true, pass: updated });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

app.patch("/save-pass-edit/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name } = req.body;
  await Pass.updateOne({ id }, { name });
  res.json({ success:true });
});
app.get("/export-excel", async (req, res) => {
    try {
        const admin = req.headers["x-admin-pass"];
        if (!admin || admin !== ADMIN_PASSWORD) {
            return res.status(403).send("Unauthorized");
        }

        const passes = await Pass.find().sort({ id: 1 });

        let csv = "Name,Pass ID,Food,Date\n";

        passes.forEach(p => {
            csv += `${p.name},${p.id},${p.food},${new Date(p.date).toLocaleString()}\n`;
        });

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=passes.csv");
        res.send(csv);

    } catch (err) {
        res.status(500).send("Error: " + err.message);
    }
});

app.get("/config", (req, res) => {
  res.json({ pass: ADMIN_PASSWORD });
});

// ---------- Start ----------
app.listen(6860, () =>
  console.log("Server running on http://localhost:6860")
);
