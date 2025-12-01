import { Request, Response } from 'express';
import User from '../models/User';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export const login = async (req: Request, res: Response) => {
  try {
    console.log('Login attempt:', req.body);
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ error: 'Invalid login credentials' });
    }

    // For initial dev/testing, if no password set, allow login (or use a default)
    // In production, ALWAYS check password
    if (user.password) {
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid login credentials' });
        }
    }

    const token = jwt.sign({ id: user._id.toString(), role: user.role }, JWT_SECRET, {
      expiresIn: '24h',
    });

    res.send({ user, token });
  } catch (error) {
    res.status(500).send(error);
  }
};

import { auth } from '../config/firebase';

export const loginWithFirebase = async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'ID Token is required' });
    }

    // Verify Firebase ID Token
    const decodedToken = await auth.verifyIdToken(idToken);
    const { email, name, picture } = decodedToken;

    if (!email) {
      return res.status(400).json({ error: 'Email is required in token' });
    }

    // Find user by email
    let user = await User.findOne({ email });

    if (user) {
      // User exists (e.g. imported from Excel), update their details
      let updated = false;
      
      if (user.isFirstLogin) {
        user.isFirstLogin = false;
        updated = true;
      }
      
      if (picture && user.avatar !== picture) {
        user.avatar = picture;
        updated = true;
      }

      if (updated) {
        await user.save();
      }
    } else {
      // User doesn't exist, create new one (Auto-registration)
      const names = name ? name.split(' ') : ['Unknown', 'User'];
      const firstName = names[0];
      const lastName = names.length > 1 ? names.slice(1).join(' ') : 'User';

      user = await User.create({
        email,
        firstName,
        lastName,
        role: 'guest', // Default to guest until assigned
        department: 'Unassigned',
        division: 'Unassigned',
        grade: 'Unassigned',
        avatar: picture,
        accessLevel: 1,
        isFirstLogin: true
      });
    }

    // Generate internal JWT
    const token = jwt.sign({ id: user._id.toString(), role: user.role }, JWT_SECRET, {
      expiresIn: '24h',
    });

    res.send({ user, token });

  } catch (error) {
    console.error('Firebase Login Error:', error);
    res.status(401).json({ error: 'Invalid authentication token' });
  }
};

export const getMe = async (req: any, res: Response) => {
    res.send(req.user);
};

// Debug login endpoint for development only
export const debugLogin = async (req: Request, res: Response) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Debug login not available in production' });
    }

    const { role } = req.body;
    const targetRole = role || 'super_admin';
    const email = targetRole === 'employee' ? 'employee@company.com' : 'admin@company.com';

    // Find or create a test user
    let user = await User.findOne({ email });
    
    if (!user) {
      if (targetRole === 'employee') {
        user = await User.create({
          email: 'employee@company.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'employee',
          department: 'Engineering',
          division: 'Technology',
          grade: 'Senior',
          accessLevel: 1,
          isFirstLogin: false
        });
      } else {
        user = await User.create({
          email: 'admin@company.com',
          firstName: 'System',
          lastName: 'Administrator',
          role: 'super_admin',
          department: 'IT',
          division: 'Corporate',
          grade: 'Executive',
          accessLevel: 10,
          isFirstLogin: false
        });
      }
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id.toString(), role: user.role }, JWT_SECRET, {
      expiresIn: '24h',
    });

    res.send({ user, token });
  } catch (error) {
    console.error('Debug login error:', error);
    res.status(500).json({ error: 'Debug login failed' });
  }
};
