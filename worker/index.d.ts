/** worker/index.js 的类型声明（纯 JS 实现，这里只描述对外接口） */
export interface WorkerEnv {
  SYNC_TOKEN?: string;
  TIMELINE_KV: {
    get(key: string, type?: string): Promise<unknown>;
    put(key: string, value: string): Promise<void>;
  };
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

declare const worker: {
  fetch(request: Request, env: WorkerEnv): Promise<Response>;
};

export default worker;
export function sameSecret(a: string, b: string): boolean;
export function readToken(request: Request): string;
