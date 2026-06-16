import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User, IUser } from '../entities/User.entity';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';
const JWT_EXPIRY = '24h';

export interface TokenPayload {
  username: string;
  role: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export async function validateCredentials(username: string, password: string): Promise<TokenPayload | null> {
  const user = await User.findOne({ username });
  if (!user) return null;

  const isValid = await verifyPassword(password, user.password);
  if (!isValid) return null;

  return { username: user.username, role: user.role };
}

export async function createUser(username: string, password: string, role: string = 'admin'): Promise<IUser> {
  const hashedPassword = await hashPassword(password);
  const user = new User({ username, password: hashedPassword, role });
  return user.save();
}

export async function userExists(username: string): Promise<boolean> {
  const count = await User.countDocuments({ username });
  return count > 0;
}
