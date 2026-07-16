import { Request, Response } from "express";
import logger from "../../config/logger";
import User from "../../models/user.model";
import { RefreshTokenError, SupabaseAuthService } from "../services/auth";
import { getOrCreateCustomerEntityForProfile } from "../services/customer-entity.service";

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
      logger.error("Error in checkEmail:", error);
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
      const { email, locale } = req.body;

      if (!email) {
        return res.status(400).json({
          error: "Email is required"
        });
      }

      if (locale !== undefined && typeof locale !== "string") {
        return res.status(400).json({
          error: "Locale must be a string"
        });
      }

      await SupabaseAuthService.sendOTP(email, locale);

      return res.json({
        message: "OTP sent to email",
        success: true
      });
    } catch (error) {
      logger.error("Error in requestOTP:", error);
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

      // Eagerly create the owning customer entity. Kept out of the OTP error mapping:
      // the Supabase session is already minted, so a failure here must not surface as
      // "Invalid OTP" — entity-scoped reads lazily create it as a fallback anyway.
      try {
        await getOrCreateCustomerEntityForProfile(result.user_id);
      } catch (entityError) {
        logger.error("Failed to create customer entity for new profile:", entityError);
      }

      return res.json({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        success: true,
        user_id: result.user_id
      });
    } catch (error) {
      logger.error("Error in verifyOTP:", error);
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
      // Only a confirmed-invalid refresh token yields a 401 (which the frontend treats as a
      // definitive logout). Transient failures — and anything unexpected — return 503 so the
      // frontend keeps the session and retries instead of forcing re-login.
      if (error instanceof RefreshTokenError && !error.transient) {
        return res.status(401).json({
          error: "Invalid refresh token"
        });
      }

      logger.error("Error in refreshToken:", error);
      return res.status(503).json({
        error: "Auth service temporarily unavailable"
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
      logger.error("Error in verifyToken:", error);
      return res.status(401).json({
        error: "Token verification failed",
        valid: false
      });
    }
  }
}
