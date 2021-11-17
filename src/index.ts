import './utils/source-map-hack-auto';
import { Router } from './utils/my-router';
import { setupRouting } from './utils/setup-routing';
import {
  changeBoard,
  changeCard,
  changeCardPosition,
  changeList,
  changeListPosition,
  changeUsersForCard,
  createBoard,
  createCard,
  createList,
  createUser,
  deleteBoard,
  deleteCard,
  deleteList,
  getBoard,
  getBoards,
  getUsers,
  login,
  notFound,
  refresh,
} from './utils/actions';

setupRouting(async (router: Router) => {
  const prefix = '/:developer_id/api/v1';

  router.post(`${prefix}/user`, createUser);
  router.get(`${prefix}/user`, getUsers);
  router.post(`${prefix}/login`, login);
  router.post(`${prefix}/refresh`, refresh);
  //
  router.get(`${prefix}/board`, getBoards);
  router.get(`${prefix}/board/:board_id`, getBoard);
  router.post(`${prefix}/board`, createBoard);
  router.put(`${prefix}/board/:board_id`, changeBoard);
  router.delete(`${prefix}/board/:board_id`, deleteBoard);

  router.post(`${prefix}/board/:board_id/list`, createList);
  router.put(`${prefix}/board/:board_id/list`, changeListPosition);
  router.put(`${prefix}/board/:board_id/list/list_id`, changeList);
  router.delete(`${prefix}/board/:board_id/list/list_id`, deleteList);

  router.post(`${prefix}/board/:board_id/card`, createCard);
  router.put(`${prefix}/board/:board_id/card`, changeCardPosition);
  router.put(`${prefix}/board/:board_id/card/card_id`, changeCard);
  router.delete(`${prefix}/board/:board_id/card/card_id`, deleteCard);
  router.put(`${prefix}/board/:board_id/card/card_id/users`, changeUsersForCard);

  router.all('*', notFound);
});
