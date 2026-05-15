// AWS S3 Connector — real integration via @aws-sdk/client-s3
// Supports: IAM access key auth, optional prefix filtering

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf','.docx','.doc','.xlsx','.xls','.pptx','.ppt','.csv',
  '.mp3','.m4a','.wav','.ogg','.flac',
  '.mp4','.mov','.avi','.mkv','.webm',
  '.gds','.gdsii','.oas','.v','.sv','.spi','.cir','.sp',
  '.sdc','.upf','.cdl','.lef','.def','.kicad_sch','.kicad_pcb',
  '.gbr','.ger','.dxf','.dwg',
]);

function cleanRegion(region) {
  if (!region) return 'us-east-1';
  // Handle cases where user pastes "Asia Pacific (Mumbai) ap-south-1" instead of just "ap-south-1"
  const match = region.match(/(us|eu|ap|ca|sa|me|af|il)-(north|south|east|west|central|northeast|southeast)-\d/);
  return match ? match[0] : region.trim().toLowerCase();
}

function getS3Client(config) {
  const { S3Client } = require('@aws-sdk/client-s3');
  return new S3Client({
    region: cleanRegion(config.aws_region),
    credentials: {
      accessKeyId: (config.access_key_id || '').trim(),
      secretAccessKey: (config.secret_access_key || '').trim(),
    },
  });
}

// ── Test Connection ──────────────────────────────────────────────────────────
async function testConnection(config) {
  // Trim all string config values to remove accidental whitespace
  const access_key_id = (config.access_key_id || '').trim();
  const secret_access_key = (config.secret_access_key || '').trim();
  const bucket_name = (config.bucket_name || '').trim();
  const aws_region = (config.aws_region || '').trim();
  const resolvedRegion = cleanRegion(aws_region);
  // Use trimmed values for the rest of the function
  config = { ...config, access_key_id, secret_access_key, bucket_name, aws_region: resolvedRegion };

  console.log(`[S3 Test] Starting connection test...`);
  console.log(`[S3 Test] Bucket: "${bucket_name}", Region: "${resolvedRegion}", AccessKeyId: "${access_key_id?.substring(0,8)}..."`);

  if (!access_key_id || !secret_access_key) {
    return { success: false, message: 'Access Key ID and Secret Access Key are required' };
  }
  if (!bucket_name) {
    return { success: false, message: 'S3 Bucket Name is required' };
  }

  // Step 1: Check if SDK is available
  let S3Cmds;
  try {
    S3Cmds = require('@aws-sdk/client-s3');
    console.log('[S3 Test] @aws-sdk/client-s3 loaded successfully');
  } catch (importErr) {
    console.error('[S3 Test] SDK import failed:', importErr.message);
    return { success: false, message: `@aws-sdk/client-s3 not installed: ${importErr.message}` };
  }

  // Step 2: Create client
  const { ListObjectsV2Command, HeadBucketCommand } = S3Cmds;
  let client;
  try {
    client = getS3Client(config);
    console.log(`[S3 Test] S3Client created for region: ${resolvedRegion}`);
  } catch (clientErr) {
    console.error('[S3 Test] Client creation failed:', clientErr);
    return { success: false, message: `Failed to create S3 client: ${clientErr.message}` };
  }

  // Step 3: HeadBucket to verify access
  try {
    console.log(`[S3 Test] Sending HeadBucket for "${bucket_name}"...`);
    const headResp = await client.send(new HeadBucketCommand({ Bucket: bucket_name }));
    console.log(`[S3 Test] HeadBucket success. HTTP ${headResp.$metadata?.httpStatusCode}`);
  } catch (headErr) {
    console.error('[S3 Test] HeadBucket failed:', JSON.stringify({
      name: headErr.name, code: headErr.Code, message: headErr.message,
      statusCode: headErr.$metadata?.httpStatusCode,
      requestId: headErr.$metadata?.requestId,
      fault: headErr.$fault,
    }, null, 2));

    const status = headErr.$metadata?.httpStatusCode;
    const errName = headErr.name || headErr.Code || 'Unknown';
    const errMsg = headErr.message || '';

    if (status === 301) return { success: false, message: `Bucket "${bucket_name}" exists but is in a different region. Got redirect (301). Try a different region — current: "${resolvedRegion}".` };
    if (status === 403) return { success: false, message: `Access denied (403) to bucket "${bucket_name}". Check IAM policy has s3:ListBucket permission for arn:aws:s3:::${bucket_name}` };
    if (status === 404) return { success: false, message: `Bucket "${bucket_name}" not found (404). Check the bucket name is exactly correct (case-sensitive).` };
    if (errMsg.includes('ENOTFOUND')) return { success: false, message: `DNS lookup failed. Cannot reach S3 in region "${resolvedRegion}". Check region code and network connectivity.` };
    if (errMsg.includes('ETIMEDOUT')) return { success: false, message: `Connection timed out to S3 in region "${resolvedRegion}". Check network/firewall/proxy settings.` };
    if (errName === 'InvalidAccessKeyId') return { success: false, message: `Invalid Access Key ID. Verify in AWS IAM → Users → Security credentials.` };
    if (errName === 'SignatureDoesNotMatch') return { success: false, message: `Secret Access Key is incorrect. Verify the key — it's shown only once when created.` };

    return { success: false, message: `S3 HeadBucket failed: ${errName} (HTTP ${status || '?'}) — ${errMsg}` };
  }

  // Step 4: List objects to count
  try {
    console.log(`[S3 Test] Listing objects in "${bucket_name}"...`);
    const listResp = await client.send(new ListObjectsV2Command({
      Bucket: bucket_name,
      MaxKeys: 100,
      Prefix: config.prefix || undefined,
    }));
    const objectCount = listResp.KeyCount || 0;
    const isTruncated = listResp.IsTruncated;
    console.log(`[S3 Test] Success! ${objectCount} objects found.`);

    return {
      success: true,
      message: `Connected to S3 bucket "${bucket_name}" in ${resolvedRegion} — ${objectCount}${isTruncated ? '+' : ''} objects found${config.prefix ? ` (prefix: ${config.prefix})` : ''}`,
      details: { bucket: bucket_name, region: resolvedRegion, object_count: objectCount, has_more: isTruncated },
    };
  } catch (listErr) {
    console.error('[S3 Test] ListObjects failed:', listErr.name, listErr.message);
    // HeadBucket succeeded so bucket exists — listing might need different permissions
    return { success: true, message: `Connected to bucket "${bucket_name}" but cannot list objects: ${listErr.message}. Add s3:ListBucket permission.` };
  }
}

// ── Discover Files ───────────────────────────────────────────────────────────
async function discoverFiles(config) {
  const { bucket_name, prefix } = config;
  if (!bucket_name) throw new Error('Bucket name is required');

  const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const client = getS3Client(config);

  const files = [];
  let continuationToken = undefined;

  do {
    const resp = await client.send(new ListObjectsV2Command({
      Bucket: bucket_name,
      Prefix: prefix || undefined,
      MaxKeys: 1000,
      ContinuationToken: continuationToken,
    }));

    for (const obj of (resp.Contents || [])) {
      const key = obj.Key;
      const parts = key.split('/');
      const fileName = parts[parts.length - 1];
      if (!fileName) continue; // Skip "folder" entries

      const ext = '.' + (fileName.split('.').pop() || '').toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      files.push({
        name: fileName,
        s3_key: key,
        extension: ext,
        size_bytes: obj.Size || 0,
        size_mb: parseFloat(((obj.Size || 0) / 1024 / 1024).toFixed(3)),
        modified_at: obj.LastModified?.toISOString(),
        etag: obj.ETag?.replace(/"/g, '') || null,
        storage_class: obj.StorageClass,
        parent_path: parts.slice(0, -1).join('/') || '/',
        bucket: bucket_name,
      });
    }

    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken);

  return { files, bucket: bucket_name, region: config.aws_region || 'us-east-1' };
}

// ── Download File Content ────────────────────────────────────────────────────
async function downloadFileContent(config, s3Key) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const client = getS3Client(config);

  const resp = await client.send(new GetObjectCommand({
    Bucket: config.bucket_name,
    Key: s3Key,
  }));

  // Read stream to buffer
  const chunks = [];
  for await (const chunk of resp.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = { testConnection, discoverFiles, downloadFileContent };
