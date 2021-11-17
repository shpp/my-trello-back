import { AppState } from './types';

declare global {
  const REDIS_TOKEN: string;
}

export async function getState(developerId: string | number): Promise<AppState> {
  const response = await fetch('https://eu1-helped-chamois-33483.upstash.io/get/trello', {
    method: 'GET',
    headers: {
      authorization: 'Bearer ' + REDIS_TOKEN,
    },
  });

  const data = await response.json();
  const state = JSON.parse(data.result);

  if (!state.developers[developerId]) {
    state.developers[developerId] = {
      users: {},
      boards: {},
    };
  }

  return state;
}

export async function saveState(state: AppState): Promise<void> {
  await fetch('https://eu1-helped-chamois-33483.upstash.io/set/trello', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + REDIS_TOKEN,
      'content-type': 'application/json',
    },
    body: JSON.stringify(state),
  });
}
