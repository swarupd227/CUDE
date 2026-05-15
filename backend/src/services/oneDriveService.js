// Microsoft OneDrive Integration via Microsoft Graph API
// Uses OAuth 2.0 Client Credentials flow for server-to-server access

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SUPPORTED_EXTENSIONS = new Set([
  '.pdf','.docx','.doc','.xlsx','.xls','.pptx','.ppt','.csv',
  '.mp3','.m4a','.wav','.ogg','.flac',
  '.mp4','.mov','.avi','.mkv','.webm',
  '.gds','.oas','.v','.sv','.spi','.sdc',
]);

// ── OAuth2 Token Acquisition ─────────────────────────────────────────────────
async function getAccessToken(tenantId, clientId, clientSecret) {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    scope: 'https://graph.microsoft.com/.default',
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`OAuth token failed: ${err.error_description || err.error || resp.statusText}`);
  }

  const data = await resp.json();
  if (!data.access_token) throw new Error('No access token in response');
  return data.access_token;
}

// ── Graph API Helper ─────────────────────────────────────────────────────────
async function graphCall(token, path) {
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Graph API ${resp.status}: ${err.error?.message || resp.statusText}`);
  }
  return resp.json();
}

async function graphDownload(token, url) {
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

// ── Test Connection ──────────────────────────────────────────────────────────
async function testConnection(config) {
  const { tenant_id, client_id, client_secret, user_email } = config;
  if (!tenant_id || !client_id || !client_secret) {
    return { success: false, message: 'Tenant ID, Client ID, and Client Secret are required' };
  }

  try {
    const token = await getAccessToken(tenant_id, client_id, client_secret);

    if (user_email) {
      // Try multiple endpoints — permissions may vary
      // Attempt 1: Get user's drive
      try {
        const driveInfo = await graphCall(token, `/users/${user_email}/drive`);
        return {
          success: true,
          message: `Connected to OneDrive for ${user_email} — Drive: ${driveInfo.name || driveInfo.driveType}, ${formatBytes(driveInfo.quota?.used || 0)} used of ${formatBytes(driveInfo.quota?.total || 0)}`,
          details: {
            drive_id: driveInfo.id,
            drive_type: driveInfo.driveType,
            owner: driveInfo.owner?.user?.displayName || user_email,
            quota_used: driveInfo.quota?.used,
            quota_total: driveInfo.quota?.total,
          },
        };
      } catch (driveErr) {
        // Attempt 2: Just verify user exists
        try {
          const userInfo = await graphCall(token, `/users/${user_email}`);
          return {
            success: true,
            message: `Connected to Microsoft Graph — User: ${userInfo.displayName || user_email}. Note: Files.Read.All permission may be needed to access OneDrive files. Grant admin consent in Azure Portal → API permissions.`,
            details: {
              user_id: userInfo.id,
              user_name: userInfo.displayName,
              user_principal: userInfo.userPrincipalName,
              warning: 'Files.Read.All permission needed for OneDrive access. ' + driveErr.message,
            },
          };
        } catch (userErr) {
          // Attempt 3: List users to verify basic access
          try {
            const users = await graphCall(token, '/users?$top=3&$select=displayName,userPrincipalName');
            const userList = (users.value || []).map(u => u.userPrincipalName).join(', ');
            return {
              success: true,
              message: `Connected to Microsoft Graph API. Available users: ${userList}. Check that "${user_email}" is the correct email and User.Read.All + Files.Read.All permissions are granted with admin consent.`,
              details: {
                available_users: users.value?.map(u => ({ name: u.displayName, email: u.userPrincipalName })),
                error_detail: userErr.message,
              },
            };
          } catch (listErr) {
            return {
              success: false,
              message: `Authentication succeeded but Graph API access denied. Please ensure these Application permissions are granted with Admin Consent in Azure Portal → App Registrations → API permissions:\n• User.Read.All\n• Files.Read.All\n\nError: ${driveErr.message}`,
            };
          }
        }
      }
    } else {
      // No user email — verify token works
      try {
        const org = await graphCall(token, '/organization');
        const orgName = org.value?.[0]?.displayName || 'Organization';
        return {
          success: true,
          message: `Connected to Microsoft Graph API for "${orgName}". Enter a user email to access their OneDrive.`,
          details: { organization: orgName },
        };
      } catch (orgErr) {
        // Token works but no org access — still a success
        return {
          success: true,
          message: 'OAuth token obtained successfully. Enter a user email and ensure User.Read.All + Files.Read.All permissions are granted with admin consent.',
          details: { note: orgErr.message },
        };
      }
    }
  } catch (e) {
    // Token acquisition failed
    let hint = '';
    if (e.message.includes('AADSTS700016')) hint = ' Check that the Client ID is correct.';
    else if (e.message.includes('AADSTS7000215')) hint = ' Check that the Client Secret is correct and not expired.';
    else if (e.message.includes('AADSTS90002')) hint = ' Check that the Tenant ID is correct.';
    else if (e.message.includes('invalid_client')) hint = ' Check Client ID and Client Secret.';
    return { success: false, message: `Connection failed: ${e.message}${hint}` };
  }
}

// ── List Files in a Folder ───────────────────────────────────────────────────
async function listFiles(token, userEmail, folderPath = '/') {
  const basePath = `/users/${userEmail}/drive`;
  const cleanPath = folderPath === '/' ? '' : `:${folderPath}:`;
  const endpoint = cleanPath
    ? `${basePath}/root${cleanPath}/children`
    : `${basePath}/root/children`;

  const allFiles = [];
  let nextLink = null;
  let url = endpoint + '?$top=200&$select=id,name,size,file,folder,lastModifiedDateTime,createdDateTime,parentReference,webUrl';

  do {
    const data = await graphCall(token, nextLink || url);
    for (const item of (data.value || [])) {
      if (item.folder) {
        // Recurse into subfolders
        try {
          const subFiles = await listFiles(token, userEmail, `${folderPath === '/' ? '' : folderPath}/${item.name}`);
          allFiles.push(...subFiles);
        } catch (_) {} // Skip inaccessible folders
      } else if (item.file) {
        const ext = '.' + (item.name.split('.').pop() || '').toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          allFiles.push({
            id: item.id,
            name: item.name,
            extension: ext,
            size_bytes: item.size || 0,
            size_mb: parseFloat(((item.size || 0) / 1024 / 1024).toFixed(3)),
            mime_type: item.file.mimeType,
            created_at: item.createdDateTime,
            modified_at: item.lastModifiedDateTime,
            web_url: item.webUrl,
            parent_path: item.parentReference?.path?.replace('/drive/root:', '') || '/',
            download_url: `${GRAPH_BASE}/users/${userEmail}/drive/items/${item.id}/content`,
            content_hash: item.file?.hashes?.sha256Hash || item.file?.hashes?.quickXorHash || null,
          });
        }
      }
    }
    nextLink = data['@odata.nextLink'] || null;
  } while (nextLink);

  return allFiles;
}

// ── Discover All Files Across Configured Folder Paths ────────────────────────
async function discoverFiles(config) {
  const { tenant_id, client_id, client_secret, user_email, folder_paths } = config;
  if (!tenant_id || !client_id || !client_secret || !user_email) {
    throw new Error('Missing required credentials (tenant_id, client_id, client_secret, user_email)');
  }

  const token = await getAccessToken(tenant_id, client_id, client_secret);
  const paths = Array.isArray(folder_paths) ? folder_paths : (folder_paths || '/').split(',').map(p => p.trim());

  const allFiles = [];
  for (const folderPath of paths) {
    try {
      const files = await listFiles(token, user_email, folderPath || '/');
      allFiles.push(...files);
    } catch (e) {
      console.error(`OneDrive: Failed to scan folder "${folderPath}": ${e.message}`);
    }
  }

  return { token, files: allFiles };
}

// ── Download File Content ────────────────────────────────────────────────────
async function downloadFileContent(token, downloadUrl) {
  return graphDownload(token, downloadUrl);
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ══════════════════════════════════════════════════════════════════════════════
// SHAREPOINT INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

// Parse SharePoint site URL → extract hostname and site path
function parseSiteUrl(siteUrl) {
  try {
    const url = new URL(siteUrl);
    const hostname = url.hostname; // e.g. w1ks4.sharepoint.com
    const sitePath = url.pathname;  // e.g. /sites/MySite
    return { hostname, sitePath };
  } catch {
    throw new Error(`Invalid SharePoint URL: ${siteUrl}. Expected format: https://tenant.sharepoint.com/sites/SiteName`);
  }
}

// Get SharePoint site ID from site URL
async function getSiteId(token, siteUrl) {
  const { hostname, sitePath } = parseSiteUrl(siteUrl);
  // Graph API: GET /sites/{hostname}:{sitePath}
  const site = await graphCall(token, `/sites/${hostname}:${sitePath}`);
  return { siteId: site.id, siteName: site.displayName, webUrl: site.webUrl };
}

// List document libraries (drives) in a SharePoint site
async function listDocumentLibraries(token, siteId) {
  const data = await graphCall(token, `/sites/${siteId}/drives`);
  return (data.value || []).map(d => ({
    id: d.id,
    name: d.name,
    description: d.description,
    webUrl: d.webUrl,
    driveType: d.driveType,
    quota: d.quota,
  }));
}

// List files in a SharePoint document library (recursive)
async function listSharePointFiles(token, driveId, folderPath = '/', depth = 0) {
  if (depth > 5) return []; // Prevent infinite recursion
  const cleanPath = folderPath === '/' ? '' : `:${folderPath}:`;
  const endpoint = cleanPath
    ? `/drives/${driveId}/root${cleanPath}/children`
    : `/drives/${driveId}/root/children`;

  const allFiles = [];
  let nextLink = null;
  let url = endpoint + '?$top=200&$select=id,name,size,file,folder,lastModifiedDateTime,createdDateTime,parentReference,webUrl';

  do {
    const data = await graphCall(token, nextLink || url);
    for (const item of (data.value || [])) {
      if (item.folder) {
        try {
          const subPath = folderPath === '/' ? `/${item.name}` : `${folderPath}/${item.name}`;
          const subFiles = await listSharePointFiles(token, driveId, subPath, depth + 1);
          allFiles.push(...subFiles);
        } catch (_) {}
      } else if (item.file) {
        const ext = '.' + (item.name.split('.').pop() || '').toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          allFiles.push({
            id: item.id,
            name: item.name,
            extension: ext,
            size_bytes: item.size || 0,
            size_mb: parseFloat(((item.size || 0) / 1024 / 1024).toFixed(3)),
            mime_type: item.file.mimeType,
            created_at: item.createdDateTime,
            modified_at: item.lastModifiedDateTime,
            web_url: item.webUrl,
            parent_path: item.parentReference?.path?.replace(/.*root:/, '') || '/',
            download_url: `${GRAPH_BASE}/drives/${driveId}/items/${item.id}/content`,
            content_hash: item.file?.hashes?.sha256Hash || item.file?.hashes?.quickXorHash || null,
            drive_id: driveId,
          });
        }
      }
    }
    nextLink = data['@odata.nextLink'] || null;
  } while (nextLink);

  return allFiles;
}

// Test SharePoint connection
async function testSharePointConnection(config) {
  const { tenant_id, client_id, client_secret, site_url } = config;
  if (!tenant_id || !client_id || !client_secret) {
    return { success: false, message: 'Tenant ID, Client ID, and Client Secret are required' };
  }
  if (!site_url) {
    return { success: false, message: 'SharePoint Site URL is required (e.g. https://tenant.sharepoint.com/sites/SiteName)' };
  }

  try {
    const token = await getAccessToken(tenant_id, client_id, client_secret);

    // Get site info
    try {
      const siteInfo = await getSiteId(token, site_url);
      const libraries = await listDocumentLibraries(token, siteInfo.siteId);
      const libraryNames = libraries.map(l => l.name).join(', ');

      return {
        success: true,
        message: `Connected to SharePoint site "${siteInfo.siteName}" — ${libraries.length} document library(ies): ${libraryNames}`,
        details: {
          site_id: siteInfo.siteId,
          site_name: siteInfo.siteName,
          web_url: siteInfo.webUrl,
          libraries: libraries.map(l => ({ id: l.id, name: l.name, type: l.driveType })),
        },
      };
    } catch (siteErr) {
      // Try listing all sites to help user find the right URL
      try {
        const sites = await graphCall(token, '/sites?search=*&$top=10&$select=displayName,webUrl');
        const siteList = (sites.value || []).map(s => `${s.displayName} (${s.webUrl})`).join('\n• ');
        return {
          success: false,
          message: `Could not access "${site_url}". Error: ${siteErr.message}\n\nAvailable sites:\n• ${siteList}\n\nEnsure Sites.Read.All (Application) permission is granted with admin consent.`,
          details: { available_sites: sites.value?.map(s => ({ name: s.displayName, url: s.webUrl })) },
        };
      } catch {
        return {
          success: false,
          message: `SharePoint access failed: ${siteErr.message}. Ensure Sites.Read.All (Application) permission is granted with admin consent.`,
        };
      }
    }
  } catch (e) {
    let hint = '';
    if (e.message.includes('AADSTS700016')) hint = ' Check that the Client ID is correct.';
    else if (e.message.includes('AADSTS7000215')) hint = ' Check that the Client Secret is correct.';
    return { success: false, message: `Authentication failed: ${e.message}${hint}` };
  }
}

// Discover all files across all document libraries in a SharePoint site
async function discoverSharePointFiles(config) {
  const { tenant_id, client_id, client_secret, site_url, library_names } = config;
  if (!tenant_id || !client_id || !client_secret || !site_url) {
    throw new Error('Missing required credentials (tenant_id, client_id, client_secret, site_url)');
  }

  const token = await getAccessToken(tenant_id, client_id, client_secret);
  const siteInfo = await getSiteId(token, site_url);
  const libraries = await listDocumentLibraries(token, siteInfo.siteId);

  // Filter libraries if specific names provided
  const targetLibraries = library_names && library_names.length > 0
    ? libraries.filter(l => library_names.some(n => l.name.toLowerCase().includes(n.toLowerCase())))
    : libraries;

  const allFiles = [];
  for (const lib of targetLibraries) {
    try {
      const files = await listSharePointFiles(token, lib.id, '/');
      allFiles.push(...files);
    } catch (e) {
      console.error(`SharePoint: Failed to scan library "${lib.name}": ${e.message}`);
    }
  }

  return { token, files: allFiles, siteInfo };
}

module.exports = { getAccessToken, testConnection, discoverFiles, downloadFileContent, listFiles, testSharePointConnection, discoverSharePointFiles, getSiteId, listDocumentLibraries };
