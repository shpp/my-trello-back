import { CfRequest, User } from './types';
import { CustomError } from './custom-error';
import jwt from '@tsndr/cloudflare-worker-jwt';

declare global {
  const ACCESS_TOKEN_SECRET: string;
  const REFRESH_TOKEN_SECRET: string;
}

export async function createAccessToken(payload: any): Promise<string> {
  payload['exp'] = Math.floor(Date.now() / 1000) + 5 * 60; // expires: now + 5 min
  return jwt.sign(payload, ACCESS_TOKEN_SECRET);
}

export async function createRefreshToken(payload: any): Promise<string> {
  payload['exp'] = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // expires: now + 1 day
  return jwt.sign(payload, REFRESH_TOKEN_SECRET);
}

export async function getAuthUser(req: CfRequest): Promise<User> {
  const authHeader = req.headers.get('authorization');
  const authToken = authHeader && authHeader.split(' ')[1];

  if (!authToken) {
    throw new CustomError('Unauthorized', 401);
  }

  const tokenIsValid = await jwt.verify(authToken, ACCESS_TOKEN_SECRET);

  if (!tokenIsValid) {
    throw new CustomError('Unauthorized', 401);
  }

  return jwt.decode(authToken) as User;
}

export async function getUserFromRefreshToken(refreshToken: string): Promise<User> {
  const tokenIsValid = await jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

  if (!tokenIsValid) {
    throw new CustomError('Invalid token', 401);
  }

  return jwt.decode(refreshToken) as User;
}
