import type { Request, Response, NextFunction } from "express";

// Simplified Firebase auth for development
// In production, you would use firebase-admin to verify tokens

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    name?: string;
    picture?: string;
  };
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : null;

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    // Development mode - extract user info from token payload
    // In production, you should verify the token with Firebase Admin SDK
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      req.user = {
        uid: payload.user_id || payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture
      };
      return next();
    } catch (error) {
      return res.status(401).json({ error: "Invalid token format" });
    }
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(401).json({ error: "Invalid token" });
  }
};