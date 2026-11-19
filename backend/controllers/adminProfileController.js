const User = require("../models/User");
const bcrypt = require("bcryptjs");
const {
  validateAvatar,
  storeAvatar,
  deleteAvatarFile,
  streamAvatar,
} = require("../lib/avatarUpload");

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

async function getAdminAvatar(req, res) {
  try {
    const user = await User.findOne({
      _id: req.user.id,
      role: "admin",
    }).select("avatar");

    if (!user || !user.avatar || !user.avatar.fileId) {
      return res.status(404).json({
        success: false,
        message: "No profile picture is set.",
      });
    }

    return await streamAvatar(res, user.avatar);
  } catch (error) {
    console.error("Load admin avatar error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load your profile picture.",
    });
  }
}

async function uploadAdminAvatar(req, res) {
  let storedFileId = null;

  try {
    const validation = validateAvatar(req.file);

    if (validation.error) {
      return res.status(400).json({
        success: false,
        message: validation.error,
      });
    }

    const accepted = validation.file;

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

    const previousFileId = user.avatar && user.avatar.fileId;

    storedFileId = await storeAvatar({
      buffer: accepted.buffer,
      contentType: accepted.contentType,
      userId: req.user.id,
      kind: "admin-avatar",
    });

    user.avatar = {
      fileId: storedFileId,
      contentType: accepted.contentType,
      size: accepted.size,
      updatedAt: new Date(),
    };

    await user.save();

    // The new picture is safely recorded before the old blob is dropped.
    if (previousFileId && String(previousFileId) !== String(storedFileId)) {
      await deleteAvatarFile(previousFileId);
    }

    return res.json({
      success: true,
      message: "Profile picture updated.",
      avatar: user.avatar,
    });
  } catch (error) {
    if (storedFileId) {
      await deleteAvatarFile(storedFileId);
    }

    console.error("Upload admin avatar error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to save your profile picture. Please try again.",
    });
  }
}

module.exports = {
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
  getAdminAvatar,
  uploadAdminAvatar,
};
