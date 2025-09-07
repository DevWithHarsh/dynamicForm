// server/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dynamicforms', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// MongoDB Schema
const formSubmissionSchema = new mongoose.Schema({
  // Personal Information
  name: String,
  email: String,
  userType: String,
  
  // Student fields
  school: String,
  grade: String,
  major: String,
  
  // Professional fields
  company: String,
  position: String,
  experience: String,
  skills: String,
  
  // Business fields
  businessName: String,
  industry: String,
  employees: String,
  revenue: String,
  
  // Additional fields
  interests: String,
  newsletter: Boolean,
  
  // Metadata
  submittedAt: {
    type: Date,
    default: Date.now
  },
  source: {
    type: String,
    enum: ['form', 'csv'],
    default: 'form'
  },
  
  // For CSV data - store original CSV row
  csvData: mongoose.Schema.Types.Mixed
}, {
  timestamps: true,
  strict: false // Allow dynamic fields from CSV
});

const FormSubmission = mongoose.model('FormSubmission', formSubmissionSchema);

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    message: 'Server is running!', 
    mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    timestamp: new Date().toISOString()
  });
});

// Get all form submissions
app.get('/api/forms', async (req, res) => {
  try {
    const { page = 1, limit = 10, source, userType } = req.query;
    
    // Build filter object
    const filter = {};
    if (source) filter.source = source;
    if (userType) filter.userType = userType;
    
    const submissions = await FormSubmission
      .find(filter)
      .sort({ submittedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();
    
    const total = await FormSubmission.countDocuments(filter);
    
    res.json({
      success: true,
      data: submissions,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching forms:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching form submissions',
      error: error.message 
    });
  }
});

// Get single form submission
app.get('/api/forms/:id', async (req, res) => {
  try {
    const submission = await FormSubmission.findById(req.params.id);
    
    if (!submission) {
      return res.status(404).json({ 
        success: false, 
        message: 'Form submission not found' 
      });
    }
    
    res.json({
      success: true,
      data: submission
    });
  } catch (error) {
    console.error('Error fetching form:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching form submission',
      error: error.message 
    });
  }
});

// Create new form submission
app.post('/api/forms', async (req, res) => {
  try {
    const formData = new FormSubmission({
      ...req.body,
      source: 'form'
    });
    
    const savedForm = await formData.save();
    
    res.status(201).json({
      success: true,
      message: 'Form submitted successfully!',
      data: savedForm
    });
  } catch (error) {
    console.error('Error saving form:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error saving form submission',
      error: error.message 
    });
  }
});

// Bulk create from CSV
app.post('/api/forms/csv', async (req, res) => {
  try {
    const { csvData } = req.body;
    
    if (!csvData || !Array.isArray(csvData)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid CSV data format'
      });
    }
    
    const submissions = csvData.map(row => ({
      ...row,
      source: 'csv',
      csvData: row
    }));
    
    const savedSubmissions = await FormSubmission.insertMany(submissions);
    
    res.status(201).json({
      success: true,
      message: `${savedSubmissions.length} records imported successfully!`,
      data: savedSubmissions
    });
  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error importing CSV data',
      error: error.message 
    });
  }
});

// Update form submission
app.put('/api/forms/:id', async (req, res) => {
  try {
    const updatedForm = await FormSubmission.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!updatedForm) {
      return res.status(404).json({ 
        success: false, 
        message: 'Form submission not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Form updated successfully!',
      data: updatedForm
    });
  } catch (error) {
    console.error('Error updating form:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating form submission',
      error: error.message 
    });
  }
});

// Delete form submission
app.delete('/api/forms/:id', async (req, res) => {
  try {
    const deletedForm = await FormSubmission.findByIdAndDelete(req.params.id);
    
    if (!deletedForm) {
      return res.status(404).json({ 
        success: false, 
        message: 'Form submission not found' 
      });
    }
    
    res.json({
      success: true,
      message: 'Form submission deleted successfully!',
      data: deletedForm
    });
  } catch (error) {
    console.error('Error deleting form:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting form submission',
      error: error.message 
    });
  }
});

// Get analytics/statistics
app.get('/api/analytics', async (req, res) => {
  try {
    const totalSubmissions = await FormSubmission.countDocuments();
    const formSubmissions = await FormSubmission.countDocuments({ source: 'form' });
    const csvSubmissions = await FormSubmission.countDocuments({ source: 'csv' });
    
    const userTypeStats = await FormSubmission.aggregate([
      { $match: { userType: { $exists: true, $ne: null } } },
      { $group: { _id: '$userType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const recentSubmissions = await FormSubmission
      .find()
      .sort({ submittedAt: -1 })
      .limit(5)
      .select('name email userType submittedAt source');
    
    res.json({
      success: true,
      data: {
        totalSubmissions,
        submissionsBySource: {
          form: formSubmissions,
          csv: csvSubmissions
        },
        userTypeDistribution: userTypeStats,
        recentSubmissions
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching analytics',
      error: error.message 
    });
  }
});

// Search submissions
app.get('/api/forms/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const searchRegex = new RegExp(query, 'i');
    
    const submissions = await FormSubmission.find({
      $or: [
        { name: searchRegex },
        { email: searchRegex },
        { company: searchRegex },
        { businessName: searchRegex },
        { school: searchRegex }
      ]
    }).sort({ submittedAt: -1 });
    
    res.json({
      success: true,
      data: submissions,
      count: submissions.length
    });
  } catch (error) {
    console.error('Error searching forms:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error searching form submissions',
      error: error.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 API Health Check: http://localhost:${PORT}/api/health`);
  console.log(`📋 API Docs: http://localhost:${PORT}/api/forms`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed');
  process.exit(0);
});

module.exports = app;