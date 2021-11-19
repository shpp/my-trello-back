import { DeveloperEnvironmentState } from './types';

declare global {
  const REDIS_TOKEN: string;
}

export async function getState(developerId: string): Promise<DeveloperEnvironmentState> {
  const response = await fetch('https://eu1-helped-chamois-33483.upstash.io/get/' + developerId, {
    method: 'GET',
    headers: {
      authorization: 'Bearer ' + REDIS_TOKEN,
    },
  });

  const data = await response.json();

  if (!data.result) {
    return {
      users: {},
      boards: {},
    };
  }

  return JSON.parse(data.result);
}

export async function saveState(developerId: string, state: DeveloperEnvironmentState): Promise<void> {
  await fetch('https://eu1-helped-chamois-33483.upstash.io/set/' + developerId, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + REDIS_TOKEN,
      'content-type': 'application/json',
    },
    body: JSON.stringify(state),
  });
}
