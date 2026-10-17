import { S3Client } from '@aws-sdk/client-s3';

/**
 * File storage, S3-compatible.
 *
 * Self-hosted (MinIO in the docker-compose): set S3_ENDPOINT (internal address
 * the API uses, e.g. http://minio:9000), S3_PUBLIC_ENDPOINT (address the phone
 * reaches, e.g. https://arquivos.seudominio.com.br), S3_ACCESS_KEY,
 * S3_SECRET_KEY and S3_BUCKET. Presigned URLs are signed against the PUBLIC
 * endpoint, because the signature covers the host the phone will call.
 *
 * Without S3_ENDPOINT it falls back to plain AWS S3 with the SDK's default
 * credential chain (never pass credentials by hand there — temporary keys
 * need the session token the SDK resolves on its own).
 */
export function getBucketConfig() {
  return {
    bucketName: process.env.S3_BUCKET ?? process.env.AWS_BUCKET_NAME ?? '',
    folderPrefix: process.env.S3_PREFIX ?? process.env.AWS_FOLDER_PREFIX ?? '',
  };
}

export function isSelfHosted(): boolean {
  return !!process.env.S3_ENDPOINT;
}

function selfHostedClient(endpoint: string) {
  return new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? '',
      secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    },
  });
}

/** Client the API uses to read/write/delete objects itself. */
export function createS3Client() {
  if (isSelfHosted()) return selfHostedClient(process.env.S3_ENDPOINT!);
  return new S3Client({});
}

/** Client used only to sign URLs handed to the phone. */
export function createPublicS3Client() {
  if (isSelfHosted()) return selfHostedClient(process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT!);
  return new S3Client({});
}
