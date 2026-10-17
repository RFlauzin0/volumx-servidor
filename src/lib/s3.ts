import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client, createPublicS3Client, getBucketConfig, isSelfHosted } from './aws-config';
import * as local from './localStorage';

let _s3Client: ReturnType<typeof createS3Client> | null = null;
function getS3Client() {
  if (!_s3Client) _s3Client = createS3Client();
  return _s3Client;
}

// Presigned URLs go to the phone, so they are signed for the public address.
let _signer: ReturnType<typeof createPublicS3Client> | null = null;
function getSigner() {
  if (!_signer) _signer = createPublicS3Client();
  return _signer;
}

export async function generatePresignedUploadUrl(
  fileName: string,
  contentType: string,
  isPublic = false,
): Promise<{ uploadUrl: string; cloud_storage_path: string }> {
  const { bucketName, folderPrefix } = getBucketConfig();
  const prefix = isPublic ? `${folderPrefix}public/uploads` : `${folderPrefix}uploads`;
  const cloud_storage_path = `${prefix}/${Date.now()}-${safeName(fileName)}`;

  if (local.isLocalStorage()) {
    return { uploadUrl: local.signedUrl('put', cloud_storage_path), cloud_storage_path };
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ContentType: contentType,
    ContentDisposition: isPublic ? 'attachment' : undefined,
  });

  const uploadUrl = await getSignedUrl(getSigner(), command, { expiresIn: 3600 });
  return { uploadUrl, cloud_storage_path };
}

/** Keeps only safe characters in an uploaded file name (it becomes a path). */
function safeName(name: string): string {
  return (name || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
}

/** Server-side write (exports), without a round trip through a signed URL. */
export async function putBuffer(fileName: string, contentType: string, body: Buffer): Promise<string> {
  const { bucketName, folderPrefix } = getBucketConfig();
  const cloud_storage_path = `${folderPrefix}uploads/${Date.now()}-${safeName(fileName)}`;
  if (local.isLocalStorage()) {
    await local.writeFile(cloud_storage_path, body, contentType);
  } else {
    await getS3Client().send(new PutObjectCommand({
      Bucket: bucketName, Key: cloud_storage_path, ContentType: contentType, Body: body,
    }));
  }
  return cloud_storage_path;
}

export async function initiateMultipartUpload(
  fileName: string,
  isPublic: boolean,
): Promise<{ uploadId: string; cloud_storage_path: string }> {
  const { bucketName, folderPrefix } = getBucketConfig();
  const prefix = isPublic ? `${folderPrefix}public/uploads` : `${folderPrefix}uploads`;
  const cloud_storage_path = `${prefix}/${Date.now()}-${fileName}`;

  const command = new CreateMultipartUploadCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ContentDisposition: isPublic ? 'attachment' : undefined,
  });

  const result = await getS3Client().send(command);
  return { uploadId: result.UploadId!, cloud_storage_path };
}

export async function getPresignedUrlForPart(
  cloud_storage_path: string,
  uploadId: string,
  partNumber: number,
): Promise<string> {
  const { bucketName } = getBucketConfig();
  const command = new UploadPartCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(getSigner(), command, { expiresIn: 3600 });
}

export async function completeMultipartUpload(
  cloud_storage_path: string,
  uploadId: string,
  parts: { ETag: string; PartNumber: number }[],
) {
  const { bucketName } = getBucketConfig();
  const command = new CompleteMultipartUploadCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  });
  await getS3Client().send(command);
}

export async function getFileUrl(cloud_storage_path: string, isPublic: boolean): Promise<string> {
  const { bucketName } = getBucketConfig();
  if (local.isLocalStorage()) {
    // Public files (avatars) get a long-lived link; private ones one hour.
    return local.signedUrl('get', cloud_storage_path, isPublic ? 60 * 60 * 24 * 365 : 3600);
  }
  if (isPublic && isSelfHosted()) {
    const base = (process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT || '').replace(/\/$/, '');
    return `${base}/${bucketName}/${cloud_storage_path}`;
  }
  if (isPublic) {
    const region = await getS3Client().config.region();
    return `https://${bucketName}.s3.${region}.amazonaws.com/${cloud_storage_path}`;
  }
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ResponseContentDisposition: 'attachment',
  });
  return getSignedUrl(getSigner(), command, { expiresIn: 3600 });
}

export async function deleteFile(cloud_storage_path: string) {
  const { bucketName } = getBucketConfig();
  if (local.isLocalStorage()) return local.removeFile(cloud_storage_path);
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
  });
  await getS3Client().send(command);
}
