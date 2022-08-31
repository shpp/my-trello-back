import { CfRequest } from '../utils/types';
import { User } from './types';
import { CustomError } from './custom-error';
import jwt from '@tsndr/cloudflare-worker-jwt';
import { getState } from './state';

declare global {
  const ACCESS_TOKEN_SECRET: string;
  const REFRESH_TOKEN_SECRET: string;
}

export async function createAccessToken(payload: any): Promise<string> {
  payload['exp'] = Math.floor(Date.now() / 1000) + 60 * 60; // expires: now + 60 min
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

  // hack for hardcode token
  if (authToken === '123') {
    return {
      id: 1,
      email: 'anonymous@email.com',
      username: 'anonymous',
      password: '',
    };
  }

  let tokenIsValid = false;

  try {
    tokenIsValid = await jwt.verify(authToken, ACCESS_TOKEN_SECRET);
  } catch (e) {
    //
  }

  if (!tokenIsValid) {
    throw new CustomError('Unauthorized', 401);
  }

  return jwt.decode(authToken) as User;
}

export async function getUserFromRefreshToken(refreshToken: string): Promise<User> {
  let tokenIsValid = false;

  try {
    tokenIsValid = await jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
  } catch (e) {
    //
  }

  if (!tokenIsValid) {
    throw new CustomError('Unauthorized', 401);
  }

  return jwt.decode(refreshToken) as User;
}
