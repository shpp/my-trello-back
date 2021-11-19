import { CfRequest } from '../utils/types';
import { Board, DeveloperEnvironmentState, List, RequestParams, User } from './types';
import * as T from 'joi';
import { getState, saveState } from './state';
import { createAccessToken, createRefreshToken, getAuthUser, getUserFromRefreshToken } from './auth';
import { CustomError } from './custom-error';
import { SchemaMap } from 'joi';

export async function notFound(): Promise<Response> {
  return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
}

export async function createUser(req: CfRequest): Promise<Response> {
  const params = getParamsFromRequest(req, ['developer_id']);
  const value = validate(
    {
      email: T.string().email({ tlds: { allow: false } }),
      password: T.string(),
    },
    await req.json()
  );
  const state = await getState(params.developerId);

  const newUser = {
    id: Date.now(),
    email: value.email,
    password: value.password,
    username: value.email.split('@')[0],
  };

  if (
    Object.values(state.users).filter((u) => u.username === newUser.username || u.email === newUser.email).length > 0
  ) {
    throw new CustomError('Username already exists', 400);
  }

  state.users[newUser.id] = newUser;
  await saveState(params.developerId, state);

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
  const params = getParamsFromRequest(req, ['developer_id']);
  const value = validate({ emailOrUsername: T.string().required() }, req.query);
  const state = await getState(params.developerId);

  const foundUsers = Object.values(state.users)
    .filter((u) => u.username.includes(`${value.emailOrUsername}`) || u.email.includes(`${value.emailOrUsername}`))
    .map((u) => ({ id: u.id, username: u.username }));

  return new Response(JSON.stringify(foundUsers));
}

export async function login(req: CfRequest): Promise<Response> {
  const params = getParamsFromRequest(req, ['developer_id']);
  const value = validate(
    {
      email: T.string().email({ tlds: { allow: false } }),
      password: T.string(),
    },
    await req.json()
  );

  const state = await getState(params.developerId);
  const userArray = Object.values(state.users).filter((u) => u.email === value.email);
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
  const params = getParamsFromRequest(req, ['developer_id']);
  const value = validate({ refreshToken: T.string() }, await req.json());
  const decodedUser = await getUserFromRefreshToken(value.refreshToken);
  const state = await getState(params.developerId);
  const userArray = Object.values(state.users).filter((u: User) => u.email === decodedUser.email);

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
  const params = getParamsFromRequest(req, ['developer_id']);
  const state = await getState(params.developerId);
  const res = Object.values(state.boards).filter((b) => b.users.filter((obj) => user.id === obj.id).length);

  return new Response(
    JSON.stringify({
      boards: res.map((x) => ({ id: x.id, title: x.title })),
    })
  );
}

export async function createBoard(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const params = getParamsFromRequest(req, ['developer_id']);
  const value = validate({ title: T.string().required() }, await req.json());
  const state = await getState(params.developerId);

  if (Object.values(state.boards).filter((b) => b.title === value.title).length > 0) {
    throw new CustomError('Board already exists', 400);
  }

  const board = {
    id: Date.now(),
    title: value.title,
    users: [{ id: user.id, username: user.username }],
    lists: {},
  };

  state.boards[board.id] = board;
  await saveState(params.developerId, state);

  return new Response(
    JSON.stringify({
      result: 'Created',
      id: board.id,
    })
  );
}

export async function changeBoard(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const params = getParamsFromRequest(req, ['developer_id', 'board_id']);
  const body = await req.json();
  const boardData = body.data || null;

  let title = null;
  if (body.title) {
    const value = validate({ title: T.string().required() }, body);
    title = value.title;
  }
  const state = await getState(params.developerId);
  let board = getBoardState(state, user.id, +params.boardId);

  if (boardData) {
    board = boardData;
  }

  if (title) {
    board.title = title;
  }

  state.boards[board.id] = board;
  await saveState(params.developerId, state);

  return new Response(
    JSON.stringify({
      result: 'Updated',
    })
  );
}

export async function deleteBoard(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const params = getParamsFromRequest(req, ['developer_id', 'board_id']);
  const state = await getState(params.developerId);
  const board = getBoardState(state, user.id, +params.boardId);

  delete state.boards[board.id];
  await saveState(params.developerId, state);

  return new Response(
    JSON.stringify({
      result: 'Deleted',
    })
  );
}

export async function getBoard(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const params = getParamsFromRequest(req, ['developer_id', 'board_id']);
  const state = await getState(params.developerId);
  const board = getBoardState(state, user.id, +params.boardId);

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
  const params = getParamsFromRequest(req, ['developer_id', 'board_id']);
  const value = validate(
    {
      title: T.string().required(),
      position: T.number().integer().required(),
    },
    await req.json()
  );

  const state = await getState(params.developerId);
  const board = getBoardState(state, user.id, +params.boardId);

  const newList = {
    id: Date.now(),
    cards: {},
    title: value.title,
    position: value.position,
  };

  state.boards[board.id].lists[newList.id] = newList;
  await saveState(params.developerId, state);

  return new Response(
    JSON.stringify({
      result: 'Created',
    })
  );
}

export async function changeListPosition(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const params = getParamsFromRequest(req, ['developer_id', 'board_id']);
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
  const state = await getState(params.developerId);
  const board = getBoardState(state, user.id, +params.boardId);

  // eslint-disable-next-line no-restricted-syntax
  for (const { id, position } of value) {
    board.lists[id].position = position;
  }

  state.boards[board.id] = board;
  await saveState(params.developerId, state);

  return new Response(
    JSON.stringify({
      result: 'Updated',
    })
  );
}

export async function changeList(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const params = getParamsFromRequest(req, ['developer_id', 'board_id', 'list_id']);
  const value = validate(
    {
      position: T.number().integer(),
      title: T.string(),
    },
    await req.json()
  );
  const state = await getState(params.developerId);
  const board = getBoardState(state, user.id, +params.boardId);
  const list = board.lists[+params.listId];

  if (!list) {
    throw new CustomError('List not found', 404);
  }

  if (value.title) {
    list.title = value.title;
  }
  if (value.position !== undefined) {
    list.position = value.position;
  }

  state.boards[board.id].lists[list.id] = list;
  await saveState(params.developerId, state);

  return new Response(
    JSON.stringify({
      result: 'Updated',
    })
  );
}

export async function deleteList(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const params = getParamsFromRequest(req, ['developer_id', 'board_id', 'list_id']);
  const state = await getState(params.developerId);
  const board = getBoardState(state, user.id, +params.boardId);
  const list = board.lists[+params.listId];

  if (!list) {
    throw new CustomError('List not found', 404);
  }

  delete state.boards[board.id].lists[list.id];
  await saveState(params.developerId, state);

  return new Response(
    JSON.stringify({
      result: 'Deleted',
    })
  );
}

export async function createCard(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const params = getParamsFromRequest(req, ['developer_id', 'board_id', 'list_id']);
  const value = validate(
    {
      position: T.number().integer(),
      title: T.string(),
      list_id: T.number().required(),
    },
    await req.json()
  );

  const state = await getState(params.developerId);
  const board = getBoardState(state, user.id, +params.boardId);
  const list = board.lists[+params.listId];

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

  state.boards[board.id].lists[list.id].cards[newCard.id] = newCard;
  await saveState(params.developerId, state);

  return new Response(
    JSON.stringify({
      result: 'Created',
      id: newCard.id,
    })
  );
}

export async function changeCard(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const params = getParamsFromRequest(req, ['developer_id', 'board_id', 'list_id', 'card_id']);
  const value = validate(
    {
      list_id: T.number().integer(),
      title: T.string() || undefined,
      description: T.string() || undefined,
    },
    await req.json()
  );

  const state = await getState(params.developerId);
  const board = getBoardState(state, user.id, +params.boardId);
  const list = board.lists[+params.listId];

  if (!list) {
    throw new CustomError('List not found', 404);
  }

  const card = list.cards[+params.cardId];

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
    delete state.boards[board.id].lists[list.id].cards[card.id];
    list.id = value.list_id;
  }

  state.boards[board.id].lists[list.id].cards[card.id] = card;
  await saveState(params.developerId, state);

  return new Response(
    JSON.stringify({
      result: 'Updated',
    })
  );
}

export async function changeCardPosition(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const params = getParamsFromRequest(req, ['developer_id', 'board_id']);
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

  const state = await getState(params.developerId);
  const board = getBoardState(state, user.id, +params.boardId);

  // eslint-disable-next-line no-restricted-syntax, camelcase
  for (const { id, position, list_id } of value) {
    const oldList = findCardsList(board, id);
    const card = oldList.cards[id];
    delete oldList.cards[id];
    card.position = position;
    board.lists[list_id].cards[id] = card;
  }

  state.boards[board.id] = board;
  await saveState(params.developerId, state);

  return new Response(
    JSON.stringify({
      result: 'Updated',
    })
  );
}

export async function deleteCard(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const params = getParamsFromRequest(req, ['developer_id', 'board_id', 'list_id', 'card_id']);
  const state = await getState(params.developerId);
  const board = getBoardState(state, user.id, +params.boardId);
  const list = board.lists[+params.listId];

  if (!list) {
    throw new CustomError('List not found', 404);
  }

  const card = list.cards[+params.cardId];

  if (!card) {
    throw new CustomError('Card not found', 404);
  }

  delete list.cards[card.id];

  state.boards[board.id].lists[list.id] = list;
  await saveState(params.developerId, state);

  return new Response(
    JSON.stringify({
      result: 'Deleted',
    })
  );
}

export async function changeUsersForCard(req: CfRequest): Promise<Response> {
  const user = await getAuthUser(req);
  const params = getParamsFromRequest(req, ['developer_id', 'board_id', 'list_id', 'card_id']);
  const value = validate(
    {
      add: T.array().items(T.number()),
      remove: T.array().items(T.number()),
    },
    await req.json()
  );

  const state = await getState(params.developerId);
  const board = getBoardState(state, user.id, +params.boardId);
  const list = board.lists[+params.listId];

  if (!list) {
    throw new CustomError('List not found', 404);
  }

  const card = list.cards[+params.cardId];

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

  state.boards[board.id].lists[list.id].cards[card.id] = card;
  await saveState(params.developerId, state);

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

function getBoardState(state: DeveloperEnvironmentState, userId: number, boardId: number): Board {
  const board = state.boards[boardId];

  if (!board.users.filter((u) => u.id === userId)) {
    throw new CustomError('Forbidden', 403);
  }

  return board;
}

function getParamsFromRequest(req: CfRequest, paramsName: string[]): RequestParams {
  const params: RequestParams = {};
  const nameConvertor: { [name: string]: string } = {
    developer_id: 'developerId',
    board_id: 'boardId',
    list_id: 'listId',
    card_id: 'cardId',
  };

  paramsName.forEach((name) => {
    const param = req.params ? req.params[name] : null;

    if (!param) {
      throw new CustomError(`Parameter ${name} is missing`, 400);
    }

    params[nameConvertor[name]] = param;
  });

  return params;
}
