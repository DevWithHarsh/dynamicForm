import mongoose from 'mongoose';
import cors from 'cors';

// Same connection logic as forms.js
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    };

    cached.promise = mongoose.connect(process.env.MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

const corsMiddleware = cors({
  origin: true,
  methods: ['POST'],
  allowedHeaders: ['Content-Type'],
});

function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

export default async function handler(req, res) {
  await runMiddleware(req, res, corsMiddleware);

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    await connectDB();
    
    const { csvData } = req.body;
    
    if (!csvData || !Array.isArray(csvData)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid CSV data format'
      });
    }

    // Use the same schema as forms.js
    let FormSubmission;
    try {
      FormSubmission = mongoose.model('FormSubmission');
    } catch {
      const formSubmissionSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
      FormSubmission = mongoose.model('FormSubmission', formSubmissionSchema);
    }

    const submissions = csvData.map(row => ({
      ...row,
      source: 'csv',
      csvData: row,
      submittedAt: new Date()
    }));

    const savedSubmissions = await FormSubmission.insertMany(submissions);
    
    return res.status(201).json({
      success: true,
      message: `${savedSubmissions.length} records imported successfully!`,
      data: savedSubmissions
    });

  } catch (error) {
    console.error('CSV Import Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error importing CSV data',
      error: error.message
    });
  }
}