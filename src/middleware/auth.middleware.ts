import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface AuthRequest extends Request {
  user?: IUser;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      throw new Error();
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    const user = await User.findById(decoded.id);

    if (!user) {
      throw new Error();
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).send({ error: 'Please authenticate.' });
  }
};


export const authorize = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).send({ error: 'Access denied.' });
    }
    next();
  };
};

import Role from '../models/Role';

export const requirePermission = (permission: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).send({ error: 'Please authenticate.' });
      }

      // Super admin always has access
      if (req.user.role === 'super_admin') {
        return next();
      }

      const role = await Role.findOne({ slug: req.user.role });
      
      if (!role) {
        return res.status(403).send({ error: 'Role not found.' });
      }

      // Check if permission exists and is true
      // We use 'any' here because permissions is a Map/Object in the schema
      const permissions = role.permissions as any;
      
      if (!permissions || !permissions[permission]) {
        return res.status(403).send({ error: 'Insufficient permissions.' });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).send({ error: 'Internal server error checking permissions.' });
    }
  };
};
