import { Request, Response } from "express";
import User from "../../models/user.model";
import { SupabaseAuthService } from "../services/auth";

export class AuthController {
  /**
   * Check if email is registered
   * GET /api/v1/auth/check-email?email=user@example.com
   */
  static async checkEmail(req: Request, res: Response) {
    try {
      const { email } = req.query;

      if (!email || typeof email !== "string") {
        return res.status(400).json({
          error: "Email is required"
        });
      }

      const exists = await SupabaseAuthService.checkUserExists(email);

      return res.json({
        action: exists ? "signin" : "signup",
        exists
      });
    } catch (error) {
      console.error("Error in checkEmail:", error);
      return res.status(500).json({
        error: "Failed to check email"
      });
    }
  }

  /**
   * Request OTP
   * POST /api/v1/auth/request-otp
   */
  static async requestOTP(req: Request, res: Response) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          error: "Email is required"
        });
      }

      await SupabaseAuthService.sendOTP(email);

      return res.json({
        message: "OTP sent to email",
        success: true
      });
    } catch (error) {
      console.error("Error in requestOTP:", error);
      return res.status(500).json({
        error: "Failed to send OTP"
      });
    }
  }

  /**
   * Verify OTP
   * POST /api/v1/auth/verify-otp
   */
  static async verifyOTP(req: Request, res: Response) {
    try {
      const { email, token } = req.body;

      if (!email || !token) {
        return res.status(400).json({
          error: "Email and token are required"
        });
      }

      const result = await SupabaseAuthService.verifyOTP(email, token);

      // Sync user to local database (upsert)
      await User.upsert({
        email: email,
        id: result.user_id
      });

      return res.json({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        success: true,
        user_id: result.user_id
      });
    } catch (error) {
      console.error("Error in verifyOTP:", error);
      return res.status(400).json({
        error: "Invalid OTP or OTP expired"
      });
    }
  }

  /**
   * Refresh token
   * POST /api/v1/auth/refresh
   */
  static async refreshToken(req: Request, res: Response) {
    try {
      const { refresh_token } = req.body;

      if (!refresh_token) {
        return res.status(400).json({
          error: "Refresh token is required"
        });
      }

      const result = await SupabaseAuthService.refreshToken(refresh_token);

      return res.json({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        success: true
      });
    } catch (error) {
      console.error("Error in refreshToken:", error);
      return res.status(401).json({
        error: "Invalid refresh token"
      });
    }
  }

  /**
   * Verify token
   * POST /api/v1/auth/verify
   */
  static async verifyToken(req: Request, res: Response) {
    try {
      const { access_token } = req.body;

      if (!access_token) {
        return res.status(400).json({
          error: "Access token is required"
        });
      }

      const result = await SupabaseAuthService.verifyToken(access_token);

      if (!result.valid) {
        return res.status(401).json({
          error: "Invalid token",
          valid: false
        });
      }

      return res.json({
        user_id: result.user_id,
        valid: true
      });
    } catch (error) {
      console.error("Error in verifyToken:", error);
      return res.status(401).json({
        error: "Token verification failed",
        valid: false
      });
    }
  }
}
