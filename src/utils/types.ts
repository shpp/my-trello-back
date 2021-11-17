export type CfRequest = globalThis.Request & Request & ActuallyRequest;
type Obj = {
  [propName: string]: string;
};

interface ActuallyRequest {
  method?: string;
  url: string;
  params?: Obj;
  query?: Obj;
}

export interface AppState {
  developers: {
    [username: string]: DeveloperEnvironmentState;
  };
}

export interface DeveloperEnvironmentState {
  users: {
    [id: number]: User;
  };
  boards: {
    [id: number]: Board;
  };
}

export interface Board {
  id: number;
  title: string;
  users: {
    id: number;
    username: string;
  }[];
  lists: {
    [id: number]: List;
  };
}

export interface User {
  id: number;
  email: string;
  password: string;
  username: string;
}

export interface List {
  position: number;
  title: string;
  id: number;
  cards: {
    [id: number]: Card;
  };
}

export interface Card {
  id: number;
  title: string;
  description: string;
  users: number[];
  created_at: number;
  position: number;
}
