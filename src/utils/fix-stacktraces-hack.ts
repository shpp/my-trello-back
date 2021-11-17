/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

export function rethrowErrors(object: any, method: any) {
  return async (...params: any[]) => {
    try {
      return await method.bind(object)(...params);
    } catch (e) {
      throw new Error('' + e);
    }
  };
}
