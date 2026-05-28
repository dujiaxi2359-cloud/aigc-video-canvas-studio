declare module "ali-oss" {
  type OssClientOptions = {
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    region?: string;
    endpoint?: string;
    secure?: boolean;
    timeout?: string | number;
  };

  type PutOptions = {
    headers?: Record<string, string>;
  };

  type SignatureUrlOptions = {
    expires?: number;
    method?: string;
  };

  export default class OSS {
    constructor(options: OssClientOptions);
    put(name: string, file: string | Buffer, options?: PutOptions): Promise<unknown>;
    delete(name: string): Promise<unknown>;
    signatureUrl(name: string, options?: SignatureUrlOptions): string;
  }
}
