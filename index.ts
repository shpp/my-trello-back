/* eslint-disable no-unused-vars */
/* eslint-disable no-console */

import express from 'express';
import { readFileSync, writeFileSync } from 'fs';
import * as atomicWrite from 'write-file-atomic';
import * as T from '@hapi/joi';

import bodyParser = require('body-parser');

const cors = require('cors');

// eslint-disable-next-line no-unused-vars
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Board {
    id: number;
    title: string;
    users: {id: number, username: string}[];
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

interface State {
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

let state: State;

setInterval(() => {
  if (state) {
    atomicWrite.sync('state.json', JSON.stringify(state));
  }
}, 1000);

async function main() {
  try {
    state = JSON.parse(`${readFileSync('state.json')}`);
  } catch (e) {
    state = {
      users: {},
      boards: {},
    };
  }

  console.log('starting...');

  const app = express();

  const router = express.Router();
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
  app.use(cors());
  app.use('/v1', router); // all the api under /v1/

  router.route('/user').post((req: express.Request, resp: express.Response) => {
    const { value, error } = T.object({
      email: T.string().email({}),
      password: T.string(),
    }).validate(req.body);
    if (error) {
      throw error;
    }
    const newUser = {
      id: Date.now(),
      email: value.email,
      password: value.password,
      username: value.email.split('@')[0],
    };
    if (Object.values(state.users).filter(
      (u) => u.username === newUser.username || u.email === newUser.email,
    ).length > 0) {
      throw new Error('username already exists');
    }

    state.users[newUser.id] = newUser;
    resp.json({ result: 'Created', id: newUser.id });
  });

  router.route('/login').post((req: express.Request, resp: express.Response) => {
    const { value, error } = T.object({
      email: T.string().email({}),
      password: T.string(),
    }).validate(req.body);
    if (error) {
      throw error;
    }
    const userArray = Object.values(state.users).filter(
      (u) => u.email === value.email,
    );
    if (userArray.length === 0) {
      throw new Error('user not exists');
    }

    const user = userArray[0];
    if (user.password !== value.password) {
      throw new Error('password wrong');
    }

    resp.json({ result: 'Authorized', token: `${user.id}` });
  });

  const getAuthUser = (req: express.Request) => {
    const res = state.users[
      +(req.headers.authorization?.replace('Bearer ', '') ?? 0)];
    if (!res) {
      throw new Error('invalid token');
    }
    return res;
  };

  const accessBoard = (userId: number, boardId: number) => {
    if (!state.boards[boardId]) {
      throw new Error('board not exists');
    }
    if (!state.boards[boardId].users.filter((obj:any) => obj.id === userId)) {
      throw new Error('no access');
    }
    return state.boards[boardId];
  };

  router.route('/user').get((req: express.Request, resp: express.Response) => {
    getAuthUser(req);
    const { value, error } = T.object({
      emailOrUsername: T.string().required(),
    }).validate(req.query);
    if (error) {
      throw error;
    }

    const foundUsers = Object.values(state.users).filter(
      (u) => u.username.includes(`${value.emailOrUsername}`) || u.email.includes(`${value.emailOrUsername}`),
    ).map((u) => ({ id: u.id, username: u.username }));

    resp.json(foundUsers);
  });

  router.route('/board').get((req: express.Request, resp: express.Response) => {
    const user = getAuthUser(req);
    if (!user) {
      throw new Error('invalid token');
    }

    // eslint-disable-next-line max-len
    const res = Object.values(state.boards).filter((b) => b.users.filter((obj:any) => user.id === obj.id).length);

    resp.json({
      boards: res.map((x) => ({ id: x.id, title: x.title })),
    });
  });

  router.route('/board').post((req: express.Request, resp: express.Response) => {
    const { value, error } = T.object({
      title: T.string().required(),
    }).validate(req.body);
    if (error) {
      throw error;
    }

    const user = getAuthUser(req);
    if (!user) {
      throw new Error('invalid token');
    }

    if (Object.values(state.boards).filter((b) => b.title === value.title).length > 0) {
      throw new Error('already exists');
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

  const changeTitleBoard = (req: express.Request, resp: express.Response) => {
    const { value, error } = T.object({
      title: T.string().required(),
    }).validate(req.body);
    if (error) {
      throw error;
    }

    const user = getAuthUser(req);
    const board = accessBoard(user.id, +req.params.id);
    board.title = value.title;

    resp.json({
      result: 'Updated',
    });
  };

  const rewriteBoard = (req: express.Request, resp: express.Response) => {
    const user = getAuthUser(req);
    const board = accessBoard(user.id, +req.params.id);
    state.boards[board.id] = req.body.data;
    resp.json({
      result: 'Updated',
    });
  };

  router.route('/board/:id').put((req: express.Request, resp: express.Response) => {
    if (req.body.title) {
      changeTitleBoard(req, resp);
    }
    if (req.body.data) {
      rewriteBoard(req, resp);
    }
  });

  router.route('/board/:id').delete((req: express.Request, resp: express.Response) => {
    const user = getAuthUser(req);
    const board = accessBoard(user.id, +req.params.id);
    delete state.boards[board.id];

    resp.json({
      result: 'Deleted',
    });
  });

  router.route('/board/:id').get((req: express.Request, resp: express.Response) => {
    const user = getAuthUser(req);
    if (!user) {
      throw new Error('invalid token');
    }

    const board = state.boards[+req.params.id];
    if (!board.users.filter((obj:any) => user.id === obj.id)) {
      throw new Error('forbidden');
    }

    resp.json({
      users: board.users.map((obj) => ({ id: obj.id, username: obj.username })),
      lists: board.lists,
    });
  });

  router.route('/board/:id/list').post((req: express.Request, resp: express.Response) => {
    const { value, error } = T.object({
      title: T.string().required(),
      position: T.number().integer().required(),
    }).validate(req.body);
    if (error) {
      throw error;
    }

    const user = getAuthUser(req);
    const board = accessBoard(user.id, +req.params.id);

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

  router.route('/board/:id/list').put((req: express.Request, resp: express.Response) => {
    const { value, error } = T.array().items(T.object({
      id: T.number().required(),
      position: T.number().integer().required(),
    })).validate(req.body);
    if (error) {
      throw error;
    }

    const user = getAuthUser(req);
    const board = accessBoard(user.id, +req.params.id);

    // eslint-disable-next-line no-restricted-syntax
    for (const { id, position } of value) {
      board.lists[id].position = position;
    }

    resp.json({
      result: 'Updated',
    });
  });

  router.route('/board/:boardid/list/:listid').put((req: express.Request, resp: express.Response) => {
    const { value, error } = T.object({
      position: T.number().integer(),
      title: T.string(),
    }).validate(req.body);
    if (error) {
      throw error;
    }

    const user = getAuthUser(req);
    const board = accessBoard(user.id, +req.params.boardid);
    const list = board.lists[+req.params.listid];
    if (!list) {
      throw new Error('list not found');
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
  router.route('/board/:boardid/list/:listid').delete((req: express.Request, resp: express.Response) => {
    const user = getAuthUser(req);
    const board = accessBoard(user.id, +req.params.boardid);
    const list = board.lists[+req.params.listid];
    if (!list) {
      throw new Error('list not found');
    }

    delete board.lists[+req.params.listid];

    resp.json({
      result: 'Deleted',
    });
  });
  router.route('/board/:boardid/card').post((req: express.Request, resp: express.Response) => {
    const { value, error } = T.object({
      position: T.number().integer(),
      title: T.string(),
      list_id: T.number().required(),
    }).validate(req.body);
    if (error) {
      throw error;
    }

    const user = getAuthUser(req);
    const board = accessBoard(user.id, +req.params.boardid);
    const list = board.lists[+value.list_id];
    if (!list) {
      throw new Error('list not found');
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

  const findCardsList = (board: Board, cardId: number) => {
    const cardLists = Object.values(board.lists).filter((l) => l.cards[cardId]);
    if (cardLists.length === 0) {
      throw new Error('card not found');
    }
    return cardLists[0];
  };

  router.route('/board/:id/card').put((req: express.Request, resp: express.Response) => {
    const { value, error } = T.array().items(T.object({
      id: T.number().required(),
      position: T.number().integer().required(),
      list_id: T.number().integer().required(),
    })).validate(req.body);
    if (error) {
      throw error;
    }

    const user = getAuthUser(req);
    const board = accessBoard(user.id, +req.params.id);

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

  const changeTitleCard = (req: any, resp: any) => {
    const { value, error } = T.object({
      list_id: T.number().integer(),
      title: T.string(),
    }).validate(req.body);
    if (error) {
      throw error;
    }

    const user = getAuthUser(req);
    const board = accessBoard(user.id, +req.params.boardid);
    const list = findCardsList(board, +req.params.cardid);
    if (!list) {
      throw new Error('list not found');
    }
    const card = list.cards[+req.params.cardid];

    if (value.title !== undefined) {
      card.title = value.title;
    }
    if (value.list_id !== undefined) {
      delete list.cards[card.id];
      board.lists[value.list_id].cards[card.id] = card;
    }

    resp.json({
      result: 'Updated',
    });
  };

  const changeDescriptionCard = (req: any, resp: any) => {
    const { value, error } = T.object({
      list_id: T.number().integer(),
      description: T.string(),
    }).validate(req.body);
    if (error) {
      throw error;
    }

    const user = getAuthUser(req);
    const board = accessBoard(user.id, +req.params.boardid);
    const list = findCardsList(board, +req.params.cardid);
    if (!list) {
      throw new Error('list not found');
    }
    const card = list.cards[+req.params.cardid];

    if (value.description !== undefined) {
      card.description = value.description;
    }
    if (value.list_id !== undefined) {
      delete list.cards[card.id];
      board.lists[value.list_id].cards[card.id] = card;
    }

    resp.json({
      result: 'Updated',
    });
  };

  router.route('/board/:boardid/card/:cardid').put((req: express.Request, resp: express.Response) => {
    if (req.body.title) {
      changeTitleCard(req, resp);
    }
    if (req.body.description) {
      changeDescriptionCard(req, resp);
    }
  });

  router.route('/board/:boardid/card/:cardid').delete((req: express.Request, resp: express.Response) => {
    const user = getAuthUser(req);
    const board = accessBoard(user.id, +req.params.boardid);
    const list = findCardsList(board, +req.params.cardid);
    if (!list) {
      throw new Error('list not found');
    }
    const card = list.cards[+req.params.cardid];

    delete list.cards[card.id];

    resp.json({
      result: 'Deleted',
    });
  });

  router.route('/board/:boardid/card/:cardid/users').put((req: express.Request, resp: express.Response) => {
    const { value, error } = T.object({
      add: T.array().items(T.number()),
      remove: T.array().items(T.number()),
    }).validate(req.body);
    if (error) {
      throw error;
    }

    const user = getAuthUser(req);
    const board = accessBoard(user.id, +req.params.boardid);
    const list = findCardsList(board, +req.params.cardid);
    if (!list) {
      throw new Error('list not found');
    }
    const card = list.cards[+req.params.cardid];

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

  const { env } = process;
  const port = +(env.PORT || 5000);
  app.listen(port, () => console.log(`app listening at http://localhost:${port}`));
}

main();
