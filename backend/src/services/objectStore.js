// MinIO / S3-compatible object store service
// Stores uploaded files and extracted artifacts
// Falls back gracefully if MinIO is not available

let s3Client = null;
let available = false;

function getClient() {
  if (s3Client) return s3Client;
  try {
    const { S3Client } = require('@aws-sdk/client-s3');
    s3Client = new S3Client({
      endpoint: `http://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || 9000}`,
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY || 'cude-admin',
        secretAccessKey: process.env.MINIO_SECRET_KEY || 'cude-secret-key-change-me',
      },
      forcePathStyle: true, // Required for MinIO
    });
    return s3Client;
  } catch (e) {
    console.log('⚠️  @aws-sdk/client-s3 not installed — object store disabled');
    return null;
  }
}

async function ensureBucket(bucketName) {
  const client = getClient();
  if (!client) return false;
  try {
    const { CreateBucketCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    }
    return true;
  } catch (e) {
    return false;
  }
}

async function init() {
  const client = getClient();
  if (!client) { available = false; return false; }
  try {
    const ok1 = await ensureBucket('cude-uploads');
    const ok2 = await ensureBucket('cude-parsed');
    available = ok1 && ok2;
    return available;
  } catch {
    available = false;
    return false;
  }
}

async function upload(bucket, key, buffer, contentType = 'application/octet-stream') {
  if (!available) return null;
  try {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await getClient().send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: buffer, ContentType: contentType,
    }));
    return `${bucket}/${key}`;
  } catch (e) {
    console.error('MinIO upload error:', e.message);
    return null;
  }
}

async function download(bucket, key) {
  if (!available) return null;
  try {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const resp = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks = [];
    for await (const chunk of resp.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch (e) {
    return null;
  }
}

function isAvailable() { return available; }

module.exports = { init, upload, download, isAvailable, ensureBucket };
