// =========================
// QUEUE SYSTEM (OPTION B)
// =========================

const queue = [];
let isProcessing = false;

// delay for Samvidha between calls (IMPORTANT)
const SAMVIDHA_DELAY = 300; // 800ms recommended (safe)

// Helper: sleep/pause
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Add job to queue
function addToQueue(task) {
  queue.push(task);
  processQueue();
}

// Process queue (one at a time)
async function processQueue() {
  if (isProcessing) return;
  if (queue.length === 0) return;

  isProcessing = true;
  const task = queue.shift();

  try {
    await task(); // run job
  } catch (err) {
    console.error("Queue task error:", err);
  }

  await wait(SAMVIDHA_DELAY);
  isProcessing = false;

  // Continue next job
  processQueue();
}

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { initBrowser, login, fetchAcademic, fetchBiometric, fetchLatestAttendance,fetchLatestAttendanceHTML,parseAttendanceRegister} = require("./fetchAttendance");
const fs = require('fs');
const { fetchTimetable } = require("./fetchAttendance");

const app = express();

// Enable CORS
app.use(cors({
  origin: '*',
  //   [
  //   "https://attendancedashboar.vercel.app",
  //   "http://localhost:3000",
  // ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.options("*", cors());

// Body parsers
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Logging
const LOG_FILE = './cron-job.log';
function initLogFile() {
  fs.writeFileSync(LOG_FILE, `=== CRON Run: ${new Date().toISOString()} ===\n`);
}
function logEvent(event, details = {}) {
  const entry = { time: new Date().toISOString(), event, ...details };
  const line = JSON.stringify(entry);
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}


// --------------------------------------------------------------
// 🔥 1. FETCH SINGLE USER LIVE (MAIN API USED BY FRONTEND)
// --------------------------------------------------------------
app.post("/get-attendance", async (req, res) => {
  const { username, password } = req.body || {};

  res.setHeader("Content-Type", "application/json");

  if (!username || !password) {
    res.write(JSON.stringify({ step: "error", data: { error: "Missing username/password" } }) + "\n");
    return res.end();
  }

  // Put the job in queue
  addToQueue(async () => {
      let cookies;
      try {
        cookies = await login(null, username, password);
      } catch {
        res.write(JSON.stringify({ step: "error", data: { error: "Invalid Credentials" } }) + "\n");
        return res.end();
      }
      
      const academic = await fetchAcademic(cookies);
      const biometric = await fetchBiometric(cookies);
      const invalidData =
        !academic || !Array.isArray(academic) || academic.length === 0 ||
        !biometric || typeof biometric !== "object";
      
      if (invalidData) {
        res.write(
          JSON.stringify({
            step: "error",
            data: { error: "No attendance data found" }
          }) + "\n"
        );
        return res.end(); 
      }
     
      // STEP 4: Respond to frontend
      res.write(JSON.stringify({ step: "academic", data: academic }) + "\n");
      res.write(JSON.stringify({ step: "biometric", data: biometric }) + "\n");
      // res.write(JSON.stringify({ step: "latest", data: latest }) + "\n");
      res.end();
    } catch (err) {
      res.write(JSON.stringify({ step: "error", data: { error: err.message } }) + "\n");
      res.end();
    }
  });
});
app.post("/get-latest", async (req, res) => {
  const { username, password } = req.body || {};

  res.setHeader("Content-Type", "application/json");

  if (!username || !password) {
    return res.json({ success: false, error: "Missing credentials" });
  }

  try {
    // Login
    const cookies = await login(null, username, password);

    // Fetch latest attendance
    const latest = await fetchLatestAttendance(cookies);

    return res.json({ success: true, latest });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

app.post("/get-attendance-register", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ success: false });
  }

  addToQueue(async () => {
    try {
      const cookies = await login(null, username, password);
      const html = await fetchLatestAttendanceHTML(cookies);
      const register = parseAttendanceRegister(html);

      res.json({ success: true, records: register });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
});

app.post("/get-timetable", async (req, res) => {
  const { username, password, ay } = req.body;

  if (!username || !password || !ay) {
    return res.status(400).json({ success: false, error: "Missing parameters" });
  }

  addToQueue(async () => {
    try {
      const cookies = await login(null, username, password);
      const data = await fetchTimetable(cookies, ay);

      res.json({
        success: true,
        academicYear: ay,
        section: data.section,
        weeklyTimetable: data.weeklyTimetable,
        subjects: data.subjects
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
});



// --------------------------------------------------------------
// START SERVER
// --------------------------------------------------------------
app.listen(process.env.PORT || 3000, () => {
  console.log("Server running…");
});
