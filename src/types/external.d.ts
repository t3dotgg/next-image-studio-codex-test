declare module "@fal-ai/serverless-client" {
  export function config(opts: { credentials?: string }): void;
  export function run<T>(model: string, params: unknown): Promise<T>;
}

declare module "uploadthing/server" {
  export class UTApi {
    uploadFiles(files: File[]): Promise<
      Array<{ url?: string; ufsUrl?: string }> | { data?: Array<{ url?: string; ufsUrl?: string }> }
    >;
  }
}

declare module "@libsql/client" {
  export interface ExecuteResult {
    rows: Array<Record<string, unknown>>;
  }
  export interface Client {
    execute(
      params: string | { sql: string; args?: unknown[] | Record<string, unknown> }
    ): Promise<ExecuteResult>;
  }
  export function createClient(config: { url: string; authToken?: string }): Client;
}
