import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { queryOne } from './db.js';

export type Role = 'admin' | 'trabajador';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signSession(user: AuthUser) {
  return jwt.sign(user, jwtSecret, { expiresIn: '7d' });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie('elrancho_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.elrancho_session;
    if (!token) return res.status(401).json({ message: 'Sesion requerida.' });

    const payload = jwt.verify(token, jwtSecret) as AuthUser;
    const user = await queryOne<AuthUser & { active: boolean }>(
      'SELECT id, email, name, role, active FROM users WHERE id = $1',
      [payload.id]
    );

    if (!user || !user.active) return res.status(401).json({ message: 'Usuario inactivo o inexistente.' });

    req.user = { id: user.id, email: user.email, name: user.name, role: user.role };
    next();
  } catch {
    res.status(401).json({ message: 'Sesion invalida.' });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Sesion requerida.' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'No tienes permiso para esta accion.' });
    next();
  };
}
