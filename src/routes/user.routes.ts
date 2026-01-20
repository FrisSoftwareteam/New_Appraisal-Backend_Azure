import express from "express";
import * as userController from "../controllers/user.controller";
import { authenticate, requirePermission } from "../middleware/auth.middleware";
import multer from "multer";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Only admins can manage users
router.post(
  "/",
  authenticate,
  requirePermission("manageUsers"),
  userController.createUser
);

router.post(
  "/bulk-update",
  authenticate,
  requirePermission("manageUsers"),
  upload.single("file"),
  userController.bulkUpdateUsers
);

router.get("/", authenticate, userController.getUsers); // Maybe restrict listing too?
router.get("/by-email/:email", authenticate, userController.getUserByEmail);
router.get("/:id", authenticate, userController.getUserById);
router.patch(
  "/:id",
  authenticate,
  requirePermission("manageUsers"),
  userController.updateUser
);
router.delete(
  "/:id",
  authenticate,
  requirePermission("manageUsers"),
  userController.deleteUser
);

export default router;
