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
