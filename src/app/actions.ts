import { CfRequest } from '../utils/types';
import { AppState, Board, List, User } from './types';
import * as T from 'joi';
import { getState, saveState } from './state';
import { createAccessToken, createRefreshToken, getAuthUser, getUserFromRefreshToken } from './auth';
import { CustomError } from './custom-error';
import { SchemaMap } from 'joi';

export async function notFound(): Promise<Response> {
  return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
}

export async function createUser(req: CfRequest): Promise<Response> {
  const value = validate(
    {
      email: T.string().email({ tlds: { allow: false } }),
      password: T.string(),
    },
    await req.json()
  );

  const developerId = getParamFromRequest(req, 'developer_id');
  const state: AppState = await getState(developerId);

  const newUser = {
    id: Date.now(),
    email: value.email,
    password: value.password,
    username: value.email.split('@')[0],
  };

  if (
    Object.values(state.developers[developerId].users).filter(
      (u) => u.username === newUser.username || u.email === newUser.email
    ).length > 0
  ) {
    throw new CustomError('Username already exists', 400);
  }

  state.developers[developerId].users[newUser.id] = newUser;
  await saveState(state);

  const accessToken = await createAccessToken(newUser);
  const refreshToken = await createRefreshToken(newUser);

  return new Response(
    JSON.stringify({
      result: 'Created',
      id: newUser.id,
      accessToken,
      refreshToken,
    })
  );
}

export async function getUsers(req: CfRequest): Promise<Response> {
  await getAuthUser(req);
  const developerId = getParamFromRequest(req, 'developer_id');
  const value = validate({ emailOrUsername: T.string().required() }, req.query);
  const state: AppState = await getState(developerId);

  const foundUsers = Object.values(state.developers[developerId].users)
    .filter((u) => u.username.includes(`${value.emailOrUsername}`) || u.email.includes(`${value.emailOrUsername}`))
    .map((u) => ({ id: u.id, username: u.username }));

  return new Response(JSON.stringify(foundUsers));
}

export async function login(req: CfRequest): Promise<Response> {
  const value = validate(
    {
      email: T.string().email({ tlds: { allow: false } }),
      password: T.string(),
    },
    await req.json()
  );

  const developerId = getParamFromRequest(req, 'developer_id');
  const state: AppState = await getState(developerId);
  const userArray = Object.values(state.developers[developerId].users).filter((u) => u.email === value.email);
  if (userArray.length === 0) {
    throw new CustomError('User not found', 404);
  }

  const user = userArray[0];
  if (user.password !== value.password) {
    throw new CustomError('Wrong password', 400);
  }
  const accessToken = await createAccessToken(user);
  const refreshToken = await createRefreshToken(user);

  return new Response(
    JSON.stringify({
      result: 'Authorized',
      id: user.id,
      accessToken,
      refreshToken,
    })
  );
}

export async function refresh(req: CfRequest): Promise<Response> {
  const value = validate({ refreshToken: T.string() }, await req.json());
  const decodedUser = await getUserFromRefreshToken(value.refreshToken);
  const developerId = getParamFromRequest(req, 'developer_id');
  const state: AppState = await getState(developerId);
  const userArray = Object.values(state.developers[developerId].users).filter(
    (u: User) => u.email === decodedUser.email
  );

  if (userArray.length === 0) {
    throw new CustomError('User not found', 404);
  }

  const user = userArray[0];
  const accessToken = await createAccessToken(user);
  const refreshToken = await createRefreshToken(user);

  return new Response(
    JSON.stringify({
      result: 'Authorized',
      id: user.id,
      accessToken,
      refreshToken,
    })
  );
}

export async function getBoards(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const developerId = getParamFromRequest(req, 'developer_id');
  const state: AppState = await getState(developerId);
  const res = Object.values(state.developers[developerId].boards).filter(
    (b) => b.users.filter((obj) => user.id === obj.id).length
  );

  return new Response(
    JSON.stringify({
      boards: res.map((x) => ({ id: x.id, title: x.title })),
    })
  );
}

export async function createBoard(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const value = validate({ title: T.string().required() }, await req.json());
  const developerId = getParamFromRequest(req, 'developer_id');
  const state: AppState = await getState(developerId);

  if (Object.values(state.developers[developerId].boards).filter((b) => b.title === value.title).length > 0) {
    throw new CustomError('Board already exists', 400);
  }

  const board = {
    id: Date.now(),
    title: value.title,
    users: [{ id: user.id, username: user.username }],
    lists: {},
  };

  state.developers[developerId].boards[board.id] = board;
  await saveState(state);

  return new Response(
    JSON.stringify({
      result: 'Created',
      id: board.id,
    })
  );
}

export async function changeBoard(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const body = await req.json();
  const boardData = body.data || null;
  let title = null;

  if (body.title) {
    const value = validate({ title: T.string().required() }, body);
    title = value.title;
  }

  const developerId = getParamFromRequest(req, 'developer_id');
  const boardId = getParamFromRequest(req, 'board_id');
  const state = await getState(developerId);
  let board = getBoardState(state, developerId, user.id, +boardId);

  if (boardData) {
    board = boardData;
  }

  if (title) {
    board.title = title;
  }

  state.developers[developerId].boards[board.id] = board;
  await saveState(state);

  return new Response(
    JSON.stringify({
      result: 'Updated',
    })
  );
}

export async function deleteBoard(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const developerId = getParamFromRequest(req, 'developer_id');
  const boardId = getParamFromRequest(req, 'board_id');
  const state = await getState(developerId);
  const board = getBoardState(state, developerId, user.id, +boardId);

  delete state.developers[developerId].boards[board.id];
  await saveState(state);

  return new Response(
    JSON.stringify({
      result: 'Deleted',
    })
  );
}

export async function getBoard(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const developerId = getParamFromRequest(req, 'developer_id');
  const boardId = getParamFromRequest(req, 'board_id');
  const state = await getState(developerId);
  const board = getBoardState(state, developerId, user.id, +boardId);

  return new Response(
    JSON.stringify({
      title: board.title,
      users: board.users.map((obj) => ({ id: obj.id, username: obj.username })),
      lists: board.lists,
    })
  );
}

export async function createList(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const value = validate(
    {
      title: T.string().required(),
      position: T.number().integer().required(),
    },
    await req.json()
  );

  const developerId = getParamFromRequest(req, 'developer_id');
  const boardId = getParamFromRequest(req, 'board_id');
  const state = await getState(developerId);
  const board = getBoardState(state, developerId, user.id, +boardId);

  const newList = {
    id: Date.now(),
    cards: {},
    title: value.title,
    position: value.position,
  };

  state.developers[developerId].boards[board.id].lists[newList.id] = newList;
  await saveState(state);

  return new Response(
    JSON.stringify({
      result: 'Created',
    })
  );
}

export async function changeListPosition(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const { value, error } = T.array()
    .items(
      T.object({
        id: T.number().required(),
        position: T.number().integer().required(),
      })
    )
    .validate(await req.json());

  if (error) {
    throw new CustomError('Wrong data', 400);
  }

  const developerId = getParamFromRequest(req, 'developer_id');
  const boardId = getParamFromRequest(req, 'board_id');
  const state = await getState(developerId);
  const board = getBoardState(state, developerId, user.id, +boardId);

  // eslint-disable-next-line no-restricted-syntax
  for (const { id, position } of value) {
    board.lists[id].position = position;
  }

  state.developers[developerId].boards[board.id] = board;
  await saveState(state);

  return new Response(
    JSON.stringify({
      result: 'Updated',
    })
  );
}

export async function changeList(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const value = validate(
    {
      position: T.number().integer(),
      title: T.string(),
    },
    await req.json()
  );

  const developerId = getParamFromRequest(req, 'developer_id');
  const boardId = getParamFromRequest(req, 'board_id');
  const listId = getParamFromRequest(req, 'list_id');
  const state = await getState(developerId);
  const board = getBoardState(state, developerId, user.id, +boardId);
  const list = board.lists[+listId];

  if (!list) {
    throw new CustomError('List not found', 404);
  }

  if (value.title) {
    list.title = value.title;
  }
  if (value.position !== undefined) {
    list.position = value.position;
  }

  state.developers[developerId].boards[board.id].lists[list.id] = list;
  await saveState(state);

  return new Response(
    JSON.stringify({
      result: 'Updated',
    })
  );
}

export async function deleteList(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const developerId = getParamFromRequest(req, 'developer_id');
  const boardId = getParamFromRequest(req, 'board_id');
  const listId = getParamFromRequest(req, 'list_id');
  const state = await getState(developerId);
  const board = getBoardState(state, developerId, user.id, +boardId);
  const list = board.lists[+listId];

  if (!list) {
    throw new CustomError('List not found', 404);
  }

  delete state.developers[developerId].boards[board.id].lists[list.id];
  await saveState(state);

  return new Response(
    JSON.stringify({
      result: 'Deleted',
    })
  );
}

export async function createCard(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const value = validate(
    {
      position: T.number().integer(),
      title: T.string(),
      list_id: T.number().required(),
    },
    await req.json()
  );

  const developerId = getParamFromRequest(req, 'developer_id');
  const boardId = getParamFromRequest(req, 'board_id');
  const listId = getParamFromRequest(req, 'list_id');
  const state = await getState(developerId);
  const board = getBoardState(state, developerId, user.id, +boardId);
  const list = board.lists[+listId];

  if (!list) {
    throw new CustomError('List not found', 404);
  }

  const newCard = {
    id: Date.now(),
    title: value.title,
    description: '',
    users: [],
    created_at: Date.now(),
    position: value.position,
  };

  state.developers[developerId].boards[board.id].lists[list.id].cards[newCard.id] = newCard;
  await saveState(state);

  return new Response(
    JSON.stringify({
      result: 'Created',
      id: newCard.id,
    })
  );
}

export async function changeCard(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const value = validate(
    {
      list_id: T.number().integer(),
      title: T.string() || undefined,
      description: T.string() || undefined,
    },
    await req.json()
  );

  const developerId = getParamFromRequest(req, 'developer_id');
  const boardId = getParamFromRequest(req, 'board_id');
  const listId = getParamFromRequest(req, 'list_id');
  const cardId = getParamFromRequest(req, 'card_id');
  const state = await getState(developerId);
  const board = getBoardState(state, developerId, user.id, +boardId);
  const list = board.lists[+listId];

  if (!list) {
    throw new CustomError('List not found', 404);
  }

  const card = list.cards[+cardId];

  if (!card) {
    throw new CustomError('Card not found', 404);
  }

  if (value.title) {
    card.title = value.title;
  }
  if (value.description) {
    card.description = value.description;
  }
  if (value.list_id) {
    delete state.developers[developerId].boards[board.id].lists[list.id].cards[card.id];
    list.id = value.list_id;
  }

  state.developers[developerId].boards[board.id].lists[list.id].cards[card.id] = card;
  await saveState(state);

  return new Response(
    JSON.stringify({
      result: 'Updated',
    })
  );
}

export async function changeCardPosition(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const { value, error } = T.array()
    .items(
      T.object({
        id: T.number().required(),
        position: T.number().integer().required(),
        list_id: T.number().integer().required(),
      })
    )
    .validate(await req.json());

  if (error) {
    throw new CustomError('Wrong data', 404);
  }

  const developerId = getParamFromRequest(req, 'developer_id');
  const boardId = getParamFromRequest(req, 'board_id');
  const state = await getState(developerId);
  const board = getBoardState(state, developerId, user.id, +boardId);

  // eslint-disable-next-line no-restricted-syntax, camelcase
  for (const { id, position, list_id } of value) {
    const oldList = findCardsList(board, id);
    const card = oldList.cards[id];
    delete oldList.cards[id];
    card.position = position;
    board.lists[list_id].cards[id] = card;
  }

  state.developers[developerId].boards[board.id] = board;
  await saveState(state);

  return new Response(
    JSON.stringify({
      result: 'Updated',
    })
  );
}

export async function deleteCard(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const developerId = getParamFromRequest(req, 'developer_id');
  const boardId = getParamFromRequest(req, 'board_id');
  const listId = getParamFromRequest(req, 'list_id');
  const cardId = getParamFromRequest(req, 'card_id');
  const state = await getState(developerId);
  const board = getBoardState(state, developerId, user.id, +boardId);
  const list = board.lists[+listId];

  if (!list) {
    throw new CustomError('List not found', 404);
  }

  const card = list.cards[+cardId];

  if (!card) {
    throw new CustomError('Card not found', 404);
  }

  delete list.cards[card.id];

  state.developers[developerId].boards[board.id].lists[list.id] = list;
  await saveState(state);

  return new Response(
    JSON.stringify({
      result: 'Deleted',
    })
  );
}

export async function changeUsersForCard(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const value = validate(
    {
      add: T.array().items(T.number()),
      remove: T.array().items(T.number()),
    },
    await req.json()
  );

  const developerId = getParamFromRequest(req, 'developer_id');
  const boardId = getParamFromRequest(req, 'board_id');
  const listId = getParamFromRequest(req, 'list_id');
  const cardId = getParamFromRequest(req, 'card_id');
  const state = await getState(developerId);
  const board = getBoardState(state, developerId, user.id, +boardId);
  const list = board.lists[+listId];

  if (!list) {
    throw new CustomError('List not found', 404);
  }

  const card = list.cards[+cardId];

  if (!card) {
    throw new CustomError('Card not found', 404);
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const addUserId of value.add || []) {
    card.users = card.users.filter((id: number) => id !== addUserId).concat(addUserId);
  }
  // eslint-disable-next-line no-restricted-syntax
  for (const removeUserId of value.remove || []) {
    card.users = card.users.filter((id: number) => id !== removeUserId);
  }

  state.developers[developerId].boards[board.id].lists[list.id].cards[card.id] = card;
  await saveState(state);

  return new Response(
    JSON.stringify({
      result: 'Updated',
    })
  );
}

function validate(schema: SchemaMap, data: any): any {
  const { value, error } = T.object(schema).validate(data);

  if (error) {
    throw new CustomError('Wrong data', 400);
  }

  return value;
}

function findCardsList(board: Board, cardId: number): List {
  const cardLists = Object.values(board.lists).filter((l) => l.cards[cardId]);
  if (cardLists.length === 0) {
    throw new CustomError('Card not found', 404);
  }
  return cardLists[0];
}

function getBoardState(appState: AppState, developerId: string | number, userId: number, boardId: number): Board {
  const board = appState.developers[developerId].boards[boardId];

  if (!board.users.filter((u) => u.id === userId)) {
    throw new CustomError('Forbidden', 403);
  }

  return board;
}

function getParamFromRequest(req: CfRequest, paramName: string): string {
  const param = req.params ? req.params[paramName] : null;

  if (!param) {
    throw new CustomError(`Parameter ${paramName} is missing`, 400);
  }

  return param;
}
