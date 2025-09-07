import mongoose from 'mongoose';
import cors from 'cors';

// Enable CORS
const corsMiddleware = cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type'],
});

// MongoDB connection
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

// Schema
const formSubmissionSchema = new mongoose.Schema({
  name: String,
  email: String,
  userType: String,
  school: String,
  grade: String,
  major: String,
  company: String,
  position: String,
  experience: String,
  skills: String,
  businessName: String,
  industry: String,
  employees: String,
  revenue: String,
  interests: String,
  newsletter: Boolean,
  submittedAt: {
    type: Date,
    default: Date.now
  },
  source: {
    type: String,
    enum: ['form', 'csv'],
    default: 'form'
  },
  csvData: mongoose.Schema.Types.Mixed
}, {
  timestamps: true,
  strict: false
});

let FormSubmission;
try {
  FormSubmission = mongoose.model('FormSubmission');
} catch {
  FormSubmission = mongoose.model('FormSubmission', formSubmissionSchema);
}

// Helper function to run middleware
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
  // Run CORS middleware
  await runMiddleware(req, res, corsMiddleware);

  try {
    await connectDB();

    const { method, query, body } = req;

    switch (method) {
      case 'GET':
        // Get all forms or single form
        if (query.id) {
          const form = await FormSubmission.findById(query.id);
          if (!form) {
            return res.status(404).json({ success: false, message: 'Form not found' });
          }
          return res.json({ success: true, data: form });
        } else {
          const { page = 1, limit = 50, source, userType } = query;
          const filter = {};
          if (source) filter.source = source;
          if (userType) filter.userType = userType;

          const forms = await FormSubmission
            .find(filter)
            .sort({ submittedAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

          const total = await FormSubmission.countDocuments(filter);

          return res.json({
            success: true,
            data: forms,
            pagination: {
              current: parseInt(page),
              pages: Math.ceil(total / limit),
              total
            }
          });
        }

      case 'POST':
        // Create form submission or CSV import
        if (body.csvData) {
          // CSV import
          const submissions = body.csvData.map(row => ({
            ...row,
            source: 'csv',
            csvData: row
          }));

          const savedSubmissions = await FormSubmission.insertMany(submissions);
          return res.status(201).json({
            success: true,
            message: `${savedSubmissions.length} records imported successfully!`,
            data: savedSubmissions
          });
        } else {
          // Single form submission
          const formData = new FormSubmission({
            ...body,
            source: 'form'
          });

          const savedForm = await formData.save();
          return res.status(201).json({
            success: true,
            message: 'Form submitted successfully!',
            data: savedForm
          });
        }

      case 'PUT':
        // Update form
        if (!query.id) {
          return res.status(400).json({ success: false, message: 'Form ID required' });
        }

        const updatedForm = await FormSubmission.findByIdAndUpdate(
          query.id,
          body,
          { new: true, runValidators: true }
        );

        if (!updatedForm) {
          return res.status(404).json({ success: false, message: 'Form not found' });
        }

        return res.json({
          success: true,
          message: 'Form updated successfully!',
          data: updatedForm
        });

      case 'DELETE':
        // Delete form
        if (!query.id) {
          return res.status(400).json({ success: false, message: 'Form ID required' });
        }

        const deletedForm = await FormSubmission.findByIdAndDelete(query.id);

        if (!deletedForm) {
          return res.status(404).json({ success: false, message: 'Form not found' });
        }

        return res.json({
          success: true,
          message: 'Form deleted successfully!',
          data: deletedForm
        });

      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        return res.status(405).json({ success: false, message: `Method ${method} not allowed` });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
}