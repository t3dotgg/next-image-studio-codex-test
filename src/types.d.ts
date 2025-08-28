declare module "@fal-ai/serverless-client" {
  export function config(options: { credentials?: string }): void;

  interface ImageData {
    url: string;
  }

  interface RunResult {
    images?: Array<string | ImageData>;
    image?: string | ImageData;
    seed?: number;
  }

  export function run(
    model: string,
    params: { input: Record<string, unknown> }
  ): Promise<RunResult>;
}

declare module "uploadthing/server" {
  interface UploadInfo {
    url?: string;
    ufsUrl?: string;
  }

  type UploadResult =
    | UploadInfo[]
    | { data?: UploadInfo[] | UploadInfo };

  export class UTApi {
    uploadFiles(files: (Blob | File)[]): Promise<UploadResult>;
  }
}

declare module "@libsql/client" {
  export interface ResultSet {
    rows: Record<string, unknown>[];
  }

  export interface Client {
    execute(query: string | { sql: string; args?: unknown[] }): Promise<ResultSet>;
  }

  export function createClient(config: { url: string; authToken: string }): Client;
}
