const Course = require("../models/course");
const Order = require("../models/order");
const asyncHandler = require("../middleware/asyncHandler");
const path = require('path');
const fs = require('fs');
const { isCloudinaryConfigured, uploadToCloudinary } = require("../config/cloudinary");
const { saveUploadLocally } = require("../config/localUpload");
let ffmpeg;
try {
  ffmpeg = require('fluent-ffmpeg');
} catch (e) {
  ffmpeg = null;
}

async function transcodeIfNeeded(file) {
  if (file && file.buffer) return file;
  if (!file || !file.path || !file.filename) return file;
  const ext = path.extname(file.filename).toLowerCase();
  if (ext === '.mp4' || !ffmpeg) return file;

  const input = file.path;
  const outName = path.basename(file.filename, ext) + '.mp4';
  const output = path.join(path.dirname(input), outName);

  return new Promise((resolve) => {
    try {
      ffmpeg(input)
        .outputOptions(['-c:v libx264', '-c:a aac', '-movflags +faststart'])
        .on('end', () => {
          try { fs.unlinkSync(input); } catch (err) { /* ignore */ }
          file.filename = outName;
          file.path = output;
          resolve(file);
        })
        .on('error', (err) => {
          console.error('Transcode error for', input, err && err.message ? err.message : err);
          resolve(file);
        })
        .save(output);
    } catch (err) {
      console.error('ffmpeg spawn error', err && err.message ? err.message : err);
      resolve(file);
    }
  });
}

const uploadCourseImage = async (file) => {
  if (!file) return "";
  if (!isCloudinaryConfigured()) {
    return saveUploadLocally(file, "course");
  }
  const result = await uploadToCloudinary(file, {
    folder: "artivio/courses/images",
    resource_type: "image"
  });
  return result.secure_url;
};

const uploadCourseVideo = async (file) => {
  if (!file) return "";
  if (!isCloudinaryConfigured()) {
    return saveUploadLocally(file, "course-video");
  }
  const result = await uploadToCloudinary(file, {
    folder: "artivio/courses/videos",
    resource_type: "video"
  });
  return result.secure_url;
};

const canAccessUnapprovedCourse = (req, course) => {
  if (!req.user) return false;
  return (
    req.user.role === "admin" ||
    course.artisan.toString() === req.user.id
  );
};

const canSeePart = (req, course, part) => {
  if (!part) return false;
  if (canAccessUnapprovedCourse(req, course)) return true;
  return part.moderationStatus === "accepted";
};

const sanitizeCoursePartsForViewer = (req, courseDoc) => {
  const course = courseDoc.toObject ? courseDoc.toObject() : courseDoc;
  if (!Array.isArray(course.parts)) {
    course.parts = [];
    return course;
  }

  if (canAccessUnapprovedCourse(req, course)) {
    return course;
  }

  course.parts = course.parts.filter(part => part.moderationStatus === "accepted");
  return course;
};

const normalizePartInput = (part = {}) => ({
  _id: part._id || part.id || undefined,
  partNumber: Number(part.partNumber),
  title: (part.title || "").trim(),
  description: part.description || "",
  duration: Number(part.duration || 0),
  image: part.image || "",
  video: part.video || ""
});

const getNextPartNumber = (parts = []) => {
  const maxPartNumber = parts.reduce((max, part) => {
    const current = Number(part.partNumber || 0);
    return current > max ? current : max;
  }, 0);
  return maxPartNumber + 1;
};

const parsePartsFromBody = (req) => {
  if (req.body.parts && typeof req.body.parts === 'string') {
    try {
      req.body.parts = JSON.parse(req.body.parts);
    } catch (err) {
      // Leave as-is
    }
  }
};

const mapUploadedPartVideos = async (req, existingCourse = null) => {
  if (!Array.isArray(req.body.parts)) return;

  const partVideos = req.files && req.files.partVideo ? req.files.partVideo : [];
  const existingPartsById = new Map();

  if (existingCourse && Array.isArray(existingCourse.parts)) {
    existingCourse.parts.forEach((part) => {
      if (part && part._id) existingPartsById.set(part._id.toString(), part);
    });
  }

  if (partVideos.length) {
    for (let i = 0; i < partVideos.length; i++) {
      await transcodeIfNeeded(partVideos[i]);
    }
  }

  req.body.parts = await Promise.all(req.body.parts.map(async (p, idx) => {
    const normalized = normalizePartInput(p);
    const existingPart = normalized._id ? existingPartsById.get(String(normalized._id)) : null;

    return {
      ...normalized,
      partNumber: Number(p.partNumber) || idx + 1,
      moderationStatus: "pending",
      moderationNote: "",
      moderatedBy: null,
      moderatedAt: null,
      submittedAt: new Date(),
      video: (partVideos[idx] && await uploadCourseVideo(partVideos[idx])) || p.video || existingPart?.video || ''
    };
  }));
};

// GET all courses
exports.getCourses = asyncHandler(async (req, res) => {
  let filter = {};

  if (req.user && req.user.role === "admin") {
    filter = {};
  } else if (req.user && (req.user.role === "artisan" || req.user.role === "seller")) {
    filter = {
      $or: [
        { moderationStatus: "accepted" },
        { artisan: req.user.id }
      ]
    };
  } else {
    filter = { moderationStatus: "accepted" };
  }

  const courses = await Course.find(filter).populate("artisan", "name email");
  const data = courses.map((course) => sanitizeCoursePartsForViewer(req, course));

  res.status(200).json({
    success: true,
    count: data.length,
    data
  });
});

// GET single course
exports.getCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id).populate("artisan", "name email");

  if (!course) {
    return res.status(404).json({
      success: false,
      error: "Course not found"
    });
  }

  if (course.moderationStatus !== "accepted" && !canAccessUnapprovedCourse(req, course)) {
    return res.status(403).json({
      success: false,
      error: "This course is not publicly available"
    });
  }

  const data = sanitizeCoursePartsForViewer(req, course);

  res.status(200).json({
    success: true,
    data
  });
});

// CREATE course
exports.createCourse = asyncHandler(async (req, res) => {
  req.body.artisan = req.user.id;
  req.body.moderationStatus = "pending";

  if (req.files) {
    if (req.files.image) {
      req.body.image = await uploadCourseImage(req.files.image[0]);
    }
  }

  parsePartsFromBody(req);
  await mapUploadedPartVideos(req);

  if (Array.isArray(req.body.parts) && req.body.parts.length) {
    req.body.parts = req.body.parts.map((part, index) => ({
      ...part,
      partNumber: Number(part.partNumber) || index + 1
    }));
  }

  const course = await Course.create(req.body);

  res.status(201).json({
    success: true,
    data: course
  });
});

// UPDATE course
exports.updateCourse = asyncHandler(async (req, res) => {
  let course = await Course.findById(req.params.id);

  if (!course) {
    return res.status(404).json({
      success: false,
      error: "Course not found"
    });
  }

  if (course.artisan.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: "Not authorized to update this course"
    });
  }

  if (req.files) {
    if (req.files.image) {
      req.body.image = await uploadCourseImage(req.files.image[0]);
    }
  }

  parsePartsFromBody(req);
  await mapUploadedPartVideos(req, course);

  if (req.user.role !== "admin") {
    req.body.moderationStatus = "pending";
    req.body.moderationNote = "";
    req.body.moderatedBy = null;
    req.body.moderatedAt = null;
  }

  course = await Course.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: course
  });
});

// DELETE course
exports.deleteCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    return res.status(404).json({
      success: false,
      error: "Course not found"
    });
  }

  if (course.artisan.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: "Not authorized to delete this course"
    });
  }

  await course.deleteOne();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// GET pending courses (admin)
exports.getPendingCourses = asyncHandler(async (req, res) => {
  const courses = await Course.find({ moderationStatus: "pending" })
    .populate("artisan", "name email");

  res.status(200).json({
    success: true,
    count: courses.length,
    data: courses
  });
});

// PATCH moderation status (admin)
exports.updateCourseModeration = asyncHandler(async (req, res) => {
  const { status, note } = req.body;

  if (!["accepted", "declined"].includes(status)) {
    return res.status(400).json({
      success: false,
      error: "Status must be either 'accepted' or 'declined'"
    });
  }

  const course = await Course.findById(req.params.id);
  if (!course) {
    return res.status(404).json({
      success: false,
      error: "Course not found"
    });
  }

  course.moderationStatus = status;
  course.moderationNote = note || "";
  course.moderatedBy = req.user.id;
  course.moderatedAt = new Date();
  await course.save();

  res.status(200).json({
    success: true,
    data: course
  });
});

// POST add a new part to existing course
exports.addCoursePart = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    return res.status(404).json({
      success: false,
      error: "Course not found"
    });
  }

  if (course.artisan.toString() !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      error: "Not authorized to add parts to this course"
    });
  }

  const incoming = normalizePartInput(req.body);
  if (!incoming.title) {
    return res.status(400).json({
      success: false,
      error: "Part title is required"
    });
  }

  const requestedPartNumber = Number(req.body.partNumber);
  const nextPartNumber = getNextPartNumber(course.parts || []);
  const partNumber = requestedPartNumber || nextPartNumber;

  const numberExists = (course.parts || []).some((part) => Number(part.partNumber) === partNumber);
  if (numberExists) {
    return res.status(400).json({
      success: false,
      error: `Part number ${partNumber} already exists`
    });
  }

  let partVideoFilename = incoming.video;
  if (req.files && req.files.partVideo && req.files.partVideo[0]) {
    const transcoded = await transcodeIfNeeded(req.files.partVideo[0]);
    partVideoFilename = await uploadCourseVideo(transcoded);
  }

  const newPart = {
    ...incoming,
    partNumber,
    video: partVideoFilename,
    moderationStatus: req.user.role === "admin" ? "accepted" : "pending",
    moderationNote: "",
    moderatedBy: req.user.role === "admin" ? req.user.id : null,
    moderatedAt: req.user.role === "admin" ? new Date() : null,
    submittedAt: new Date()
  };

  course.parts.push(newPart);
  await course.save();

  res.status(201).json({
    success: true,
    data: sanitizeCoursePartsForViewer(req, course)
  });
});

// GET pending parts for moderation (admin)
exports.getPendingCourseParts = asyncHandler(async (req, res) => {
  const courses = await Course.find({ "parts.moderationStatus": "pending" }).populate("artisan", "name email");

  const pendingParts = [];
  courses.forEach((course) => {
    (course.parts || []).forEach((part) => {
      if (part.moderationStatus === "pending") {
        pendingParts.push({
          courseId: course._id,
          courseTitle: course.title,
          artisan: course.artisan,
          part
        });
      }
    });
  });

  res.status(200).json({
    success: true,
    count: pendingParts.length,
    data: pendingParts
  });
});

// PATCH moderation for a single course part (admin)
exports.updateCoursePartModeration = asyncHandler(async (req, res) => {
  const { status, note } = req.body;

  if (!["accepted", "declined"].includes(status)) {
    return res.status(400).json({
      success: false,
      error: "Status must be either 'accepted' or 'declined'"
    });
  }

  const course = await Course.findById(req.params.id);
  if (!course) {
    return res.status(404).json({
      success: false,
      error: "Course not found"
    });
  }

  const part = course.parts.id(req.params.partId);
  if (!part) {
    return res.status(404).json({
      success: false,
      error: "Course part not found"
    });
  }

  part.moderationStatus = status;
  part.moderationNote = note || "";
  part.moderatedBy = req.user.id;
  part.moderatedAt = new Date();

  await course.save();

  res.status(200).json({
    success: true,
    data: sanitizeCoursePartsForViewer(req, course)
  });
});

// ENROLL in course – requires paid order
exports.enrollCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    return res.status(404).json({
      success: false,
      error: "Course not found"
    });
  }

  // Check if course is accepted
  if (course.moderationStatus !== 'accepted') {
    return res.status(403).json({
      success: false,
      error: "This course is not yet available for enrollment. Please wait for admin approval."
    });
  }

  // Check if already enrolled
  if (course.students && course.students.some(student => student.toString() === req.user.id)) {
    return res.status(200).json({
      success: true,
      data: course,
      message: "Already enrolled in this course"
    });
  }

  // Check if user has purchased the course
  const paidOrder = await Order.findOne({
    user: req.user._id,
    paymentStatus: 'paid',
    'items': {
      $elemMatch: {
        itemType: 'Course',
        item: course._id
      }
    }
  });

  if (!paidOrder) {
    return res.status(403).json({
      success: false,
      error: "You have not purchased this course. Please complete payment first."
    });
  }

  // Add student to course
  if (!course.students) course.students = [];
  course.students.push(req.user._id);
  await course.save();

  res.status(200).json({
    success: true,
    data: course,
    message: "Successfully enrolled in the course!"
  });
});

// CHECK if user has purchased the course
exports.checkPurchased = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    return res.status(404).json({
      success: false,
      error: "Course not found"
    });
  }

  // Check if user is in students array
  if (course.students && course.students.includes(req.user.id)) {
    return res.status(200).json({
      success: true,
      purchased: true,
      message: "Already enrolled"
    });
  }

  // Check orders
  const order = await Order.findOne({
    user: req.user._id,
    'items': {
      $elemMatch: {
        itemType: 'Course',
        item: course._id
      }
    },
    paymentStatus: 'paid'
  });

  res.status(200).json({
    success: true,
    purchased: !!order,
    message: !!order ? "Course purchased. You can enroll now." : "Course not purchased yet."
  });
}); 
