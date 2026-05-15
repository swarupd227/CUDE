// Azure Blob Storage Connector — real integration via @azure/storage-blob SDK
// Supports: connection string auth, account key auth, SAS token auth

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf','.docx','.doc','.xlsx','.xls','.pptx','.ppt','.csv',
  '.mp3','.m4a','.wav','.ogg','.flac',
  '.mp4','.mov','.avi','.mkv','.webm',
  '.gds','.oas','.v','.sv','.spi','.sdc',
]);

// Build connection string from config fields
function buildConnectionString(config) {
  // If full connection string provided, use it directly
  if (config.connection_string && config.connection_string.startsWith('DefaultEndpointsProtocol')) {
    return config.connection_string;
  }
  // Build from account name + key
  if (config.account_name && config.account_key) {
    return `DefaultEndpointsProtocol=https;AccountName=${config.account_name};AccountKey=${config.account_key};EndpointSuffix=core.windows.net`;
  }
  throw new Error('Provide either a Connection String or Account Name + Account Key');
}

// ── Test Connection ──────────────────────────────────────────────────────────
async function testConnection(config) {
  const { account_name, account_key, connection_string, container_name } = config;
  if (!connection_string && (!account_name || !account_key)) {
    return { success: false, message: 'Provide either Connection String OR Account Name + Account Key' };
  }

  try {
    const { BlobServiceClient } = require('@azure/storage-blob');
    const connStr = buildConnectionString(config);
    const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);

    // List containers to verify connection
    const containers = [];
    for await (const container of blobServiceClient.listContainers()) {
      containers.push({ name: container.name, lastModified: container.properties?.lastModified });
    }

    if (container_name) {
      // Verify specific container exists and count blobs
      const containerClient = blobServiceClient.getContainerClient(container_name);
      const exists = await containerClient.exists();
      if (!exists) {
        return {
          success: false,
          message: `Container "${container_name}" not found. Available containers: ${containers.map(c => c.name).join(', ')}`,
          details: { available_containers: containers.map(c => c.name) },
        };
      }

      let blobCount = 0;
      for await (const _ of containerClient.listBlobsFlat({ maxPageSize: 100 })) {
        blobCount++;
        if (blobCount >= 100) break; // Count up to 100 for speed
      }

      return {
        success: true,
        message: `Connected to Azure Blob Storage "${account_name || 'via connection string'}" — Container "${container_name}" found with ${blobCount}${blobCount >= 100 ? '+' : ''} blobs`,
        details: {
          account: account_name || connStr.match(/AccountName=([^;]+)/)?.[1],
          container: container_name,
          blob_count: blobCount,
          all_containers: containers.map(c => c.name),
        },
      };
    }

    return {
      success: true,
      message: `Connected to Azure Blob Storage — ${containers.length} container(s) found: ${containers.map(c => c.name).join(', ')}`,
      details: {
        account: account_name || connStr.match(/AccountName=([^;]+)/)?.[1],
        containers: containers.map(c => c.name),
      },
    };
  } catch (e) {
    let hint = '';
    if (e.message.includes('AuthenticationFailed')) hint = ' Check that the Account Key or Connection String is correct.';
    if (e.message.includes('ENOTFOUND')) hint = ' Check that the Account Name is correct.';
    if (e.statusCode === 403) hint = ' Access denied — check account key permissions.';
    return { success: false, message: `Azure Blob connection failed: ${e.message}${hint}` };
  }
}

// ── Discover Files ───────────────────────────────────────────────────────────
async function discoverFiles(config) {
  const { container_name, prefix } = config;
  if (!container_name) throw new Error('Container name is required');

  const { BlobServiceClient } = require('@azure/storage-blob');
  const connStr = buildConnectionString(config);
  const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
  const containerClient = blobServiceClient.getContainerClient(container_name);

  const files = [];
  const listOptions = prefix ? { prefix: prefix.replace(/^\//, '') } : {};

  for await (const blob of containerClient.listBlobsFlat(listOptions)) {
    const ext = '.' + (blob.name.split('.').pop() || '').toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

    // Get just the filename (last part of the path)
    const parts = blob.name.split('/');
    const fileName = parts[parts.length - 1];
    const folderPath = parts.slice(0, -1).join('/') || '/';

    files.push({
      name: fileName,
      blob_name: blob.name, // Full blob path including folders
      extension: ext,
      size_bytes: blob.properties?.contentLength || 0,
      size_mb: parseFloat(((blob.properties?.contentLength || 0) / 1024 / 1024).toFixed(3)),
      content_type: blob.properties?.contentType,
      created_at: blob.properties?.createdOn?.toISOString(),
      modified_at: blob.properties?.lastModified?.toISOString(),
      content_hash: blob.properties?.contentMD5 ? Buffer.from(blob.properties.contentMD5).toString('hex') : null,
      parent_path: folderPath,
      container: container_name,
    });
  }

  return { files, account: connStr.match(/AccountName=([^;]+)/)?.[1] || 'azure' };
}

// ── Download File Content ────────────────────────────────────────────────────
async function downloadFileContent(config, blobName) {
  const { BlobServiceClient } = require('@azure/storage-blob');
  const connStr = buildConnectionString(config);
  const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
  const containerClient = blobServiceClient.getContainerClient(config.container_name);
  const blobClient = containerClient.getBlobClient(blobName);

  const downloadResponse = await blobClient.download(0);

  // Read stream to buffer
  const chunks = [];
  for await (const chunk of downloadResponse.readableStreamBody) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = { testConnection, discoverFiles, downloadFileContent, buildConnectionString };
