/* eslint-disable no-unused-vars */
/* eslint-disable no-console */

import express, { NextFunction, Send } from 'express';
import { readFileSync, writeFileSync } from 'fs';
import * as atomicWrite from 'write-file-atomic';
import * as T from '@hapi/joi';

import bodyParser = require('body-parser');
import { Response } from "express-serve-static-core";

const cors = require('cors');

// eslint-disable-next-line no-unused-vars
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Board {
  id: number;
  title: string;
  users: { id: number, username: string }[];
  lists: {
    [id: number]: {
      position: number;
      title: string;
      id: number;
      cards: {
        [id: number]: {
          id: number;
          title: string;
          description: string;
          users: number[];
          // eslint-disable-next-line camelcase
          created_at: number;
          position: number;
        }
      }
    }
  }
}

interface DeveloperEnvironmentState {
  users: {
    [id: number]: {
      id: number;
      email: string;
      password: string;
      username: string;
    };
  };
  boards: {
    [id: number]: Board
  };
}

interface AppState {
  developers: {
    [username: string]: DeveloperEnvironmentState
  }
}

class CustomError extends Error {
  statusCode: number;

  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
    this.statusCode = status;
    this.data = data;
  }
}


const stateDir = './state/state.json';

let appState: AppState;

setInterval(() => {
  if (appState) {
    atomicWrite.sync(stateDir, JSON.stringify(appState));
  }
}, 1000);


async function main() {
  try {
    appState = JSON.parse(`${readFileSync(stateDir)}`);
  } catch (e) {
    appState = {
      developers: {},
    } as AppState;
  }

  console.log('starting...');

  function checkDeveloper(req: express.Request, res: express.Response, next: NextFunction) {
    if (appState.developers[req.params.developer_id]) {
      next();
      return;
    }
    appState.developers[req.params.developer_id] = {
      users: {},
      boards: {},
    };
    next();
  }

  function logRequest(req: express.Request, res: express.Response, next: NextFunction) {
    console.log(`[INFO]\tREQUEST\t${req.method}\t${req.path}\t${req.body ? JSON.stringify(req.body) : ''}\t${req.query ? JSON.stringify(req.query) : ''}`);
    next();
  }
  function logResponse(req: express.Request, res: express.Response, next: NextFunction) {
    const { send } = res;
    // It might be a little tricky here, because send supports a variety of arguments,
    // and you have to make sure you support all of them!
    res.send = function customSend(...args): express.Response {
      console.log(`[INFO]\tRESPONSE\t${res.statusCode}\t${req.path}\t${JSON.stringify(args[0] || '').slice(0, 50)}`);
      send.call(this, ...args);
      return res;
    };

    next();
  }

  const app = express();

  const router = express.Router({ mergeParams: true });
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
  app.use(cors());
  app.use('/:developer_id/api/v1', router);

  router.use(logRequest);
  router.use(logResponse);

  router.use(checkDeveloper);

  const getAuthUser = (req: express.Request) => {
    const token = +(req.headers.authorization?.replace('Bearer ', '') ?? 0);
    const state: DeveloperEnvironmentState = appState.developers[req.params.developer_id];
    const res = state?.users[token];
    if (token === 123) { // hello, hardcode ;)
      if (!state?.users[token]) {
        state.users[token] = {
          id: token,
          email: 'email@example.com',
          password: '123',
          username: 'username',
        };
      }

      return state.users[token];
    }
    if (!res) {
      throw new CustomError('invalid token', 400);
    }
    return res;
  };

  const accessBoard = (developerId: string, userId: number, boardId: number) => {
    const env = appState.developers[developerId];
    if (env) {
      if (!env.boards[boardId]) {
        throw new CustomError('board not found', 404);
      }
      if (!env.boards[boardId].users.filter((obj: any) => obj.id === userId)) {
        throw new CustomError('no access', 403);
      }
      return env.boards[boardId];
    }
    throw new CustomError('developer not found', 404);
  };

  const findCardsList = (board: Board, cardId: number) => {
    const cardLists = Object.values(board.lists).filter((l) => l.cards[cardId]);
    if (cardLists.length === 0) {
      throw new CustomError('card not found', 404);
    }
    return cardLists[0];
  };

  const changeCard = (req: any, resp: any, fieldname: 'description' | 'title') => {
    const { value, error } = T.object({
      list_id: T.number().integer(),
      [fieldname]: T.string(),
    }).validate(req.body);
    if (error) {
      throw new CustomError('wrong data', 400, error);
    }

    const user = getAuthUser(req);
    const board = accessBoard(req.params.developer_id, user.id, +req.params.board_id);
    const list = findCardsList(board, +req.params.card_id);
    if (!list) {
      throw new CustomError('list not found', 404);
    }
    const card = list.cards[+req.params.card_id];

    if (value[fieldname] !== undefined) {
      card[fieldname] = value[fieldname];
    }
    if (value.list_id !== undefined) {
      delete list.cards[card.id];
      board.lists[value.list_id].cards[card.id] = card;
    }

    resp.json({
      result: 'Updated',
    });
  };

  const changeTitleBoard = (req: express.Request, resp: express.Response) => {
    const { value, error } = T.object({
      title: T.string().required(),
    }).validate(req.body);
    if (error) {
      throw new CustomError('wrong data', 400, error);
    }

    const user = getAuthUser(req);
    const board = accessBoard(req.params.developer_id, user.id, +req.params.board_id);
    board.title = value.title;

    resp.json({
      result: 'Updated',
    });
  };

  const rewriteBoard = (req: express.Request, resp: express.Response) => {
    const user = getAuthUser(req);
    const board = accessBoard(req.params.developer_id, user.id, +req.params.board_id);
    const state: DeveloperEnvironmentState = appState.developers[req.params.developer_id];
    state.boards[board.id] = req.body.data;
    resp.json({
      result: 'Updated',
    });
  };

  router.route('/user').post((req: express.Request, resp: express.Response) => {
    const { value, error } = T.object({
      email: T.string().email({}),
      password: T.string(),
    }).validate(req.body);
    if (error) {
      throw new CustomError('wrong data', 400, error);
    }
    const state: DeveloperEnvironmentState = appState.developers[req.params.developer_id];
    const newUser = {
      id: Date.now(),
      email: value.email,
      password: value.password,
      username: value.email.split('@')[0],
    };
    if (Object.values(state.users).filter(
      (u) => u.username === newUser.username || u.email === newUser.email,
    ).length > 0) {
      throw new CustomError('username already exists', 400);
    }

    state.users[newUser.id] = newUser;
    resp.json({ result: 'Created', id: newUser.id });
  });

  router.route('/user').get((req: express.Request, resp: express.Response) => {
    getAuthUser(req);
    const { value, error } = T.object({
      emailOrUsername: T.string().required(),
    }).validate(req.query);
    if (error) {
      throw new CustomError('wrong data', 400, error);
    }
    const state: DeveloperEnvironmentState = appState.developers[req.params.developer_id];
    const foundUsers = Object.values(state.users).filter(
      (u) => u.username.includes(`${value.emailOrUsername}`) || u.email.includes(`${value.emailOrUsername}`),
    ).map((u) => ({ id: u.id, username: u.username }));

    resp.json(foundUsers);
  });

  router.route('/login').post((req: express.Request, resp: express.Response) => {
    const { value, error } = T.object({
      email: T.string().email({}),
      password: T.string(),
    }).validate(req.body);
    if (error) {
      throw new CustomError('wrong data', 400, error);
    }
    const state: DeveloperEnvironmentState = appState.developers[req.params.developer_id];
    const userArray = Object.values(state.users).filter(
      (u) => u.email === value.email,
    );
    if (userArray.length === 0) {
      throw new CustomError('user not found', 404);
    }

    const user = userArray[0];
    if (user.password !== value.password) {
      throw new CustomError('password wrong', 400);
    }

    resp.json({ result: 'Authorized', token: `${user.id}` });
  });

  router.route('/board').get((req: express.Request, resp: express.Response) => {
    const user = getAuthUser(req);
    if (!user) {
      throw new CustomError('invalid token', 400);
    }
    const state: DeveloperEnvironmentState = appState.developers[req.params.developer_id];
    const res = Object.values(state.boards)
      .filter((b) => b.users.filter((obj: any) => user.id === obj.id).length);

    resp.json({
      boards: res.map((x) => ({ id: x.id, title: x.title })),
    });
  });

  router.route('/board').post((req: express.Request, resp: express.Response) => {
    const { value, error } = T.object({
      title: T.string().required(),
    }).validate(req.body);
    if (error) {
      throw new CustomError('wrong data', 400, error);
    }

    const user = getAuthUser(req);
    if (!user) {
      throw new CustomError('invalid token', 400);
    }

    const state: DeveloperEnvironmentState = appState.developers[req.params.developer_id];
    if (Object.values(state.boards).filter((b) => b.title === value.title).length > 0) {
      throw new CustomError('board already exists', 400);
    }

    const board = {
      id: Date.now(),
      title: value.title,
      users: [{ id: user.id, username: user.username }],
      lists: {},
    };
    state.boards[board.id] = board;

    resp.json({
      result: 'Created',
      id: board.id,
    });
  });

  router.route('/board/:board_id').put((req: express.Request, resp: express.Response) => {
    if (req.body.title) {
      changeTitleBoard(req, resp);
    }
    if (req.body.data) {
      rewriteBoard(req, resp);
    }
  });

  router.route('/board/:board_id').delete((req: express.Request, resp: express.Response) => {
    const user = getAuthUser(req);
    const board = accessBoard(req.params.developer_id, user.id, +req.params.board_id);
    const state: DeveloperEnvironmentState = appState.developers[req.params.developer_id];
    delete state.boards[board.id];

    resp.json({
      result: 'Deleted',
    });
  });

  router.route('/board/:board_id').get((req: express.Request, resp: express.Response) => {
    const user = getAuthUser(req);
    if (!user) {
      throw new CustomError('invalid token', 400);
    }
    const state: DeveloperEnvironmentState = appState.developers[req.params.developer_id];
    const board = state.boards[+req.params.board_id];
    if (!board.users.filter((obj: any) => user.id === obj.id)) {
      throw new CustomError('forbidden', 403);
    }

    resp.json({
      users: board.users.map((obj) => ({ id: obj.id, username: obj.username })),
      lists: board.lists,
    });
  });

  router.route('/board/:board_id/list').post((req: express.Request, resp: express.Response) => {
    const { value, error } = T.object({
      title: T.string().required(),
      position: T.number().integer().required(),
    }).validate(req.body);
    if (error) {
      throw new CustomError('wrong data', 400, error);
    }

    const user = getAuthUser(req);
    const board = accessBoard(req.params.developer_id, user.id, +req.params.board_id);

    const newList = {
      id: Date.now(),
      cards: {},
      title: value.title,
      position: value.position,
    };

    board.lists[newList.id] = newList;

    resp.json({
      result: 'Created',
    });
  });

  router.route('/board/:board_id/list').put((req: express.Request, resp: express.Response) => {
    const { value, error } = T.array().items(T.object({
      id: T.number().required(),
      position: T.number().integer().required(),
    })).validate(req.body);
    if (error) {
      throw new CustomError('wrong data', 400, error);
    }

    const user = getAuthUser(req);
    const board = accessBoard(req.params.developer_id, user.id, +req.params.board_id);

    // eslint-disable-next-line no-restricted-syntax
    for (const { id, position } of value) {
      board.lists[id].position = position;
    }

    resp.json({
      result: 'Updated',
    });
  });

  router.route('/board/:board_id/list/:list_id').put((req: express.Request, resp: express.Response) => {
    const { value, error } = T.object({
      position: T.number().integer(),
      title: T.string(),
    }).validate(req.body);
    if (error) {
      throw new CustomError('wrong data', 400, error);
    }

    const user = getAuthUser(req);
    const board = accessBoard(req.params.developer_id, user.id, +req.params.board_id);
    const list = board.lists[+req.params.list_id];
    if (!list) {
      throw new CustomError('list not found', 404);
    }

    if (value.title !== undefined) {
      list.title = value.title;
    }
    if (value.position !== undefined) {
      list.position = value.position;
    }

    resp.json({
      result: 'Updated',
    });
  });

  router.route('/board/:board_id/list/:list_id').delete((req: express.Request, resp: express.Response) => {
    const user = getAuthUser(req);
    const board = accessBoard(req.params.developer_id, user.id, +req.params.board_id);
    const list = board.lists[+req.params.list_id];
    if (!list) {
      throw new CustomError('list not found', 404);
    }

    delete board.lists[+req.params.list_id];

    resp.json({
      result: 'Deleted',
    });
  });

  router.route('/board/:board_id/card').post((req: express.Request, resp: express.Response) => {
    const { value, error } = T.object({
      position: T.number().integer(),
      title: T.string(),
      list_id: T.number().required(),
    }).validate(req.body);
    if (error) {
      throw new CustomError('wrong data', 400, error);
    }

    const user = getAuthUser(req);
    const board = accessBoard(req.params.developer_id, user.id, +req.params.board_id);
    const list = board.lists[+value.list_id];
    if (!list) {
      throw new CustomError('list not found', 404);
    }

    const newCard = {
      id: Date.now(),
      title: value.title,
      description: '',
      users: [],
      created_at: Date.now(),
      position: value.position,
    };

    list.cards[newCard.id] = newCard;

    resp.json({
      result: 'Created',
      id: newCard.id,
    });
  });

  router.route('/board/:board_id/card').put((req: express.Request, resp: express.Response) => {
    const { value, error } = T.array().items(T.object({
      id: T.number().required(),
      position: T.number().integer().required(),
      list_id: T.number().integer().required(),
    })).validate(req.body);
    if (error) {
      throw new CustomError('wrong data', 400, error);
    }

    const user = getAuthUser(req);
    const board = accessBoard(req.params.developer_id, user.id, +req.params.id);

    // eslint-disable-next-line no-restricted-syntax, camelcase
    for (const { id, position, list_id } of value) {
      const oldList = findCardsList(board, id);
      const card = oldList.cards[id];
      delete oldList.cards[id];
      card.position = position;
      board.lists[list_id].cards[id] = card;
    }

    resp.json({
      result: 'Updated',
    });
  });

  router.route('/board/:board_id/card/:card_id').put((req: express.Request, resp: express.Response) => {
    if (req.body.title) {
      changeCard(req, resp, 'title');
    }
    if (req.body.description) {
      changeCard(req, resp, 'description');
    }
  });

  router.route('/board/:board_id/card/:card_id').delete((req: express.Request, resp: express.Response) => {
    const user = getAuthUser(req);
    const board = accessBoard(req.params.developer_id, user.id, +req.params.board_id);
    const list = findCardsList(board, +req.params.card_id);
    if (!list) {
      throw new CustomError('list not found', 404);
    }
    const card = list.cards[+req.params.card_id];

    delete list.cards[card.id];

    resp.json({
      result: 'Deleted',
    });
  });

  router.route('/board/:board_id/card/:card_id/users').put((req: express.Request, resp: express.Response) => {
    const { value, error } = T.object({
      add: T.array().items(T.number()),
      remove: T.array().items(T.number()),
    }).validate(req.body);
    if (error) {
      throw new CustomError('wrong data', 400, error);
    }

    const user = getAuthUser(req);
    const board = accessBoard(req.params.developer_id, user.id, +req.params.board_id);
    const list = findCardsList(board, +req.params.card_id);
    if (!list) {
      throw new CustomError('list not found', 404);
    }
    const card = list.cards[+req.params.card_id];

    // eslint-disable-next-line no-restricted-syntax
    for (const addUserId of (value.add || [])) {
      card.users = card.users.filter((id: number) => id !== addUserId).concat(addUserId);
    }
    // eslint-disable-next-line no-restricted-syntax
    for (const removeUserId of (value.remove || [])) {
      card.users = card.users.filter((id: number) => id !== removeUserId);
    }

    resp.json({
      result: 'Updated',
    });
  });


  app.use((err: CustomError, req: express.Request, res: express.Response, next: NextFunction) => {
    if (err) {
      console.log(`[ERROR]\t${err.statusCode}\t${err.message}\t${err.data ? JSON.stringify(err.data) : ''}`);
      res.status(err.statusCode).send({
        error: {
          message: err.message,
          data: err.data,
        },
      });
    }
    next();
  });

  const { env } = process;
  const port = +(env.PORT || 5000);
  app.listen(port, () => console.log(`app listening at http://localhost:${port}`));
}

main();
