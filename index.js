import express from 'express';
import cors from 'cors';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
    "http://localhost:5173",
    "https://micro-task-website.web.app",
    "https://micro-task-website.firebaseapp.com"
];

// (Middleware)
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));


app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// DB SETUP
let db;

async function getDB() {
    try {
        if (!db) {
            await client.connect();
            db = client.db("taskynexDB");
            console.log("MongoDB Database Connected Successfully using MongoDB Driver!");
        }
        return db;
    } catch (err) {
        console.error("MongoDB Connection Failed:", err.message);
        throw err;
    }
}


getDB().catch(console.dir);

// ================= HEALTH =================
app.get("/health", async (req, res) => {
    res.json({ status: "ok", time: new Date() });
});

// ================= USER REGISTER & AUTH =================
app.post("/auth/register", async (req, res) => {
    try {
        const db = await getDB();
        const { name, email, photoUrl } = req.body;

        let role = req.body.role || "worker";
        let coins = role === "buyer" ? 500 : 200;

        if (email === "joynula919@gmail.com") {
            role = "admin";
            coins = 0;
        }

        const existing = await db.collection("users").findOne({ email });
        if (existing) return res.send({ success: true, user: existing });

        const user = { name, email, photoUrl, role, coins, createdAt: new Date() };
        await db.collection("users").insertOne(user);

        res.send({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= USERS API =================
app.get("/users/:email", async (req, res) => {
    try {
        const db = await getDB();
        const user = await db.collection("users").findOne({ email: req.params.email });
        res.json(user || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/users/:email/role", async (req, res) => {
    try {
        const db = await getDB();
        const { role } = req.body;
        const result = await db.collection("users").updateOne(
            { email: req.params.email },
            { $set: { role } }
        );
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/admin/users", async (req, res) => {
    try {
        const db = await getDB();
        const users = await db.collection("users").find().toArray();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch("/admin/users/:id/role", async (req, res) => {
    try {
        const db = await getDB();
        const { role } = req.body;
        const result = await db.collection("users").updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { role } }
        );
        res.send({ success: true, modifiedCount: result.modifiedCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/admin/users/:id", async (req, res) => {
    try {
        const db = await getDB();
        const result = await db.collection("users").deleteOne({ _id: new ObjectId(req.params.id) });
        res.send({ success: true, deletedCount: result.deletedCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= ROLE REQUESTS =================
app.post("/role-request", async (req, res) => {
    try {
        const db = await getDB();
        const { email, name } = req.body;

        const user = await db.collection("users").findOne({ email });
        if (!user) return res.status(404).json({ error: "User not found" });
        if (user.role === "buyer") return res.send({ success: false, message: "Already a buyer" });

        const existingRequest = await db.collection("roleRequests").findOne({ email, status: "pending" });
        if (existingRequest) return res.send({ success: false, message: "Request already pending" });

        const request = {
            email,
            name,
            currentRole: "worker",
            requestedRole: "buyer",
            status: "pending",
            createdAt: new Date(),
        };

        const result = await db.collection("roleRequests").insertOne(request);
        res.send({ success: true, message: "Request sent successfully", insertedId: result.insertedId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch("/approve-role/:id", async (req, res) => {
    try {
        const db = await getDB();
        const id = req.params.id;

        const request = await db.collection("roleRequests").findOne({ _id: new ObjectId(id) });
        if (!request) return res.status(404).json({ error: "Request not found" });

        await db.collection("users").updateOne({ email: request.email }, { $set: { role: "buyer" } });
        await db.collection("roleRequests").updateOne({ _id: new ObjectId(id) }, { $set: { status: "approved" } });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= TASKS API =================
app.get("/tasks", async (req, res) => {
    try {
        const db = await getDB();
        const query = { required_workers: { $gt: 0 } };

        const tasks = await db.collection("tasks")
            .find(query)
            .sort({ createdAt: -1 })
            .toArray();

        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.get("/tasks/buyer/:email", async (req, res) => {
    try {
        const db = await getDB();
        const tasks = await db.collection("tasks").find({ buyer_email: req.params.email }).sort({ createdAt: -1 }).toArray();
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/tasks", async (req, res) => {
    try {
        const db = await getDB();
        const task = { ...req.body, createdAt: new Date() };

        const buyer = await db.collection("users").findOne({ email: task.buyer_email });
        const cost = Number(task.required_workers) * Number(task.payable_amount);

        if (!buyer || Number(buyer.coins || 0) < cost) {
            return res.status(400).json({ error: "Insufficient coins" });
        }

        await db.collection("users").updateOne({ email: task.buyer_email }, { $inc: { coins: -cost } });
        const result = await db.collection("tasks").insertOne(task);

        res.json({ success: true, taskId: result.insertedId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/tasks/:id", async (req, res) => {
    try {
        const db = await getDB();
        const task = await db.collection("tasks").findOne({ _id: new ObjectId(req.params.id) });
        if (!task) return res.status(404).json({ error: "Task not found" });
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/tasks/:id", async (req, res) => {
    try {
        const db = await getDB();
        const updatedTask = {
            title: req.body.title,
            detail: req.body.detail,
            required_workers: Number(req.body.required_workers),
            payable_amount: Number(req.body.payable_amount),
            completion_date: req.body.completion_date,
            submission_info: req.body.submission_info,
            task_image_url: req.body.task_image_url,
        };

        const result = await db.collection("tasks").updateOne({ _id: new ObjectId(req.params.id) }, { $set: updatedTask });
        res.json({ success: true, modifiedCount: result.modifiedCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete("/tasks/:id", async (req, res) => {
    try {
        const db = await getDB();
        const id = req.params.id;
        const task = await db.collection("tasks").findOne({ _id: new ObjectId(id) });
        if (!task) return res.status(404).json({ error: "Task not found" });

        const refund = Number(task.required_workers) * Number(task.payable_amount);
        await db.collection("users").updateOne({ email: task.buyer_email }, { $inc: { coins: refund } });
        const result = await db.collection("tasks").deleteOne({ _id: new ObjectId(id) });

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= SUBMISSIONS =================
app.post("/submissions", async (req, res) => {
    try {
        const db = await getDB();
        const submission = req.body;
        submission.current_date = new Date();
        submission.status = "pending";

        const result = await db.collection("submissions").insertOne(submission);
        res.send(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/submissions/buyer/:email", async (req, res) => {
    try {
        const db = await getDB();
        const submissions = await db.collection("submissions").find({ buyer_email: req.params.email, status: "pending" }).toArray();
        res.json(submissions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/submissions/worker/:email", async (req, res) => {
    try {
        const db = await getDB();
        const submissions = await db.collection("submissions").find({ worker_email: req.params.email }).toArray();
        res.json(submissions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch("/submissions/approve/:id", async (req, res) => {
    try {
        const db = await getDB();
        const id = req.params.id;

        const submission = await db.collection("submissions").findOne({ _id: new ObjectId(id) });
        if (!submission) return res.status(404).json({ error: "Not found" });

        await db.collection("users").updateOne({ email: submission.worker_email }, { $inc: { coins: Number(submission.payable_amount) } });
        await db.collection("submissions").updateOne({ _id: new ObjectId(id) }, { $set: { status: "approved" } });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch("/submissions/reject/:id", async (req, res) => {
    try {
        const db = await getDB();
        const id = req.params.id;

        const submission = await db.collection("submissions").findOne({ _id: new ObjectId(id) });
        if (!submission) return res.status(404).json({ error: "Not found" });

        await db.collection("submissions").updateOne({ _id: new ObjectId(id) }, { $set: { status: "rejected" } });
        await db.collection("tasks").updateOne({ _id: new ObjectId(submission.task_id) }, { $inc: { required_workers: 1 } });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= PAYMENTS & STATS =================
app.post("/payments/dummy", async (req, res) => {
    try {
        const db = await getDB();
        const { email, name, coins, amount } = req.body;

        const payment = {
            email,
            name,
            coins: Number(coins),
            amount: Number(amount),
            paymentMethod: "Dummy Payment",
            transactionId: "DUMMY-" + Date.now() + "-" + Math.floor(Math.random() * 10000),
            status: "Success",
            createdAt: new Date(),
        };

        await db.collection("payments").insertOne(payment);
        await db.collection("users").updateOne({ email }, { $inc: { coins: Number(coins) } });

        res.send({ success: true, message: "Coins Added Successfully", payment });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/payments/:email", async (req, res) => {
    try {
        const db = await getDB();
        const payments = await db.collection("payments").find({ email: req.params.email }).sort({ createdAt: -1 }).toArray();
        res.send(payments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/buyer/stats/:email", async (req, res) => {
    try {
        const db = await getDB();
        const tasks = await db.collection("tasks").find({ buyer_email: req.params.email }).toArray();

        const totalTasks = tasks.length;
        const pendingWorkers = tasks.reduce((sum, task) => sum + Number(task.required_workers || 0), 0);
        const totalPayment = tasks.reduce((sum, task) => sum + (Number(task.required_workers) * Number(task.payable_amount)), 0);

        res.json({ totalTasks, pendingWorkers, totalPayment });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= WITHDRAWALS =================
app.post("/withdrawals", async (req, res) => {
    try {
        const db = await getDB();
        const { worker_email, worker_name, withdrawal_coin, withdrawal_amount, payment_system, account_number } = req.body;

        if (Number(withdrawal_coin) < 200) {
            return res.status(400).send({ success: false, message: "Minimum 200 coins required" });
        }

        const withdrawal = {
            worker_email,
            worker_name,
            withdrawal_coin: Number(withdrawal_coin),
            withdrawal_amount: Number(withdrawal_amount),
            payment_system,
            account_number,
            withdraw_date: new Date(),
            status: "pending",
        };

        const result = await db.collection("withdrawals").insertOne(withdrawal);
        res.send({ success: true, message: "Withdrawal request created", insertedId: result.insertedId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/withdrawals/worker/:email", async (req, res) => {
    try {
        const db = await getDB();
        const withdrawals = await db.collection("withdrawals").find({ worker_email: req.params.email }).toArray();
        res.json(withdrawals);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================= VITE (DEV ONLY) & STATIC PROD ===============

app.get('/', (req, res) => {
    res.send('Taskynex Server is Running...');
});


if (process.env.NODE_ENV !== "production") {
    app.listen(PORT, () => {
        console.log(`Server is running on port: ${PORT}`);
    });
}

export default app;