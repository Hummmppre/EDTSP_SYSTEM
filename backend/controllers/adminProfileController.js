const User = require("../models/User");
const bcrypt = require("bcryptjs");

function publicProfile(user) {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
  };
}

async function getAdminProfile(req, res) {
  try {
    const user = await User.findOne({
      _id: req.user.id,
      role: "admin",
    }).select("firstName lastName email role");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Admin account not found.",
      });
    }

    return res.json({ success: true, profile: publicProfile(user) });
  } catch (error) {
    console.error("Load admin profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load your profile.",
    });
  }
}

async function updateAdminProfile(req, res) {
  try {
    const firstName = String(req.body.firstName || "").trim();
    const lastName = String(req.body.lastName || "").trim();

    if (!firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: "Enter both your first and last name.",
      });
    }

    const user = await User.findOne({
      _id: req.user.id,
      role: "admin",
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Admin account not found.",
      });
    }

    user.firstName = firstName;
    user.lastName = lastName;
    await user.save();

    return res.json({
      success: true,
      message: "Profile updated.",
      profile: publicProfile(user),
    });
  } catch (error) {
    console.error("Update admin profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update your profile.",
    });
  }
}

async function changeAdminPassword(req, res) {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Complete all password fields.",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters.",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "The new passwords do not match.",
      });
    }

    const user = await User.findOne({
      _id: req.user.id,
      role: "admin",
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Admin account not found.",
      });
    }

    if (
      !user.password ||
      !(await bcrypt.compare(currentPassword, user.password))
    ) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    return res.json({
      success: true,
      message: "Password updated.",
    });
  } catch (error) {
    console.error("Change admin password error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update your password.",
    });
  }
}

module.exports = {
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
};
