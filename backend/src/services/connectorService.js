const fs   = require('fs');
const path = require('path');

// ── Connector Registry ────────────────────────────────────────────────────────
const connectors = {
  local_filesystem: {
    id: 'local_filesystem',
    name: 'Local Filesystem',
    category: 'File System',
    icon: '💾',
    status: 'CONFIGURED',
    description: 'Scan any folder on the local machine or a mapped network drive. Supports recursive discovery with file-type filtering.',
    config: {
      scan_path: '',
      recursive: true,
      include_hidden: false,
      file_size_limit_mb: 5000,
      scan_interval_minutes: 30,
      enabled: true,
    },
    auth_type: 'NONE',
    supported_domains: ['ELECTRONIC_CIRCUIT','PDF_DOCUMENT','OFFICE_DOCUMENT','AUDIO','VIDEO'],
    setup_steps: [
      'Enter the folder path you want to scan (e.g. C:\\Users\\swarupd\\Downloads or /home/user/designs)',
      'Choose whether to scan sub-folders recursively',
      'Set a file size limit to skip very large files during initial scan',
      'Click "Run Discovery" to scan the folder immediately',
    ],
    last_scan: null,
    files_discovered: 0,
  },

  nas_smb: {
    id: 'nas_smb',
    name: 'NAS / Network Share (SMB)',
    category: 'File System',
    icon: '🗄️',
    status: 'NOT_CONFIGURED',
    description: 'Connect to a NetApp, EMC Isilon, or Windows Server share via SMB/CIFS. Watches for changes using file system events.',
    config: {
      share_path: '\\\\your-nas-server\\share-name',
      username: '',
      password: '',
      domain: '',
      recursive: true,
      watch_for_changes: true,
      enabled: false,
    },
    auth_type: 'CREDENTIALS',
    supported_domains: ['ELECTRONIC_CIRCUIT','PDF_DOCUMENT','OFFICE_DOCUMENT'],
    setup_steps: [
      'Enter the UNC path to the network share (e.g. \\\\nas-server\\eda-designs)',
      'Provide domain credentials with read access to the share',
      'Enable "Watch for changes" to trigger real-time discovery on new files',
      'Map the share as a network drive first if needed on Windows',
    ],
    last_scan: null,
    files_discovered: 0,
  },

  sharepoint: {
    id: 'sharepoint',
    name: 'Microsoft SharePoint',
    category: 'Microsoft 365',
    icon: '📋',
    status: 'NOT_CONFIGURED',
    description: 'Discover documents, presentations, and spreadsheets from SharePoint document libraries using the Microsoft Graph API.',
    config: {
      tenant_id: '',
      client_id: '',
      client_secret: '',
      site_url: 'https://yourcompany.sharepoint.com/sites/YourSite',
      library_names: ['Documents','Design Documents'],
      recursive: true,
      enabled: false,
    },
    auth_type: 'OAUTH2',
    supported_domains: ['PDF_DOCUMENT','OFFICE_DOCUMENT'],
    setup_steps: [
      'Register an app in Azure Active Directory (portal.azure.com → App Registrations)',
      'Grant permissions: Sites.Read.All, Files.Read.All in Microsoft Graph',
      'Generate a client secret and copy the Tenant ID, Client ID, and Secret here',
      'Enter the SharePoint site URL and the document library names to scan',
    ],
    last_scan: null,
    files_discovered: 0,
  },

  teams_recordings: {
    id: 'teams_recordings',
    name: 'Microsoft Teams Recordings',
    category: 'Microsoft 365',
    icon: '🎙️',
    status: 'NOT_CONFIGURED',
    description: 'Automatically pull meeting recordings from Teams channels after every recorded call. Triggers Whisper ASR transcription pipeline.',
    config: {
      tenant_id: '',
      client_id: '',
      client_secret: '',
      team_ids: [],
      auto_transcribe: true,
      min_duration_minutes: 5,
      enabled: false,
    },
    auth_type: 'OAUTH2',
    supported_domains: ['AUDIO','VIDEO'],
    setup_steps: [
      'Use the same Azure AD app as SharePoint connector (or register a new one)',
      'Grant additional permissions: OnlineMeetings.Read.All, CallRecords.Read.All',
      'Enter Team IDs to monitor (find them in Teams → Team Settings → Get link to team)',
      'Set minimum duration to skip very short accidental recordings',
    ],
    last_scan: null,
    files_discovered: 0,
  },

  cadence_dfii: {
    id: 'cadence_dfii',
    name: 'Cadence EDA Vault (DFII)',
    category: 'EDA Tools',
    icon: '🔲',
    status: 'NOT_CONFIGURED',
    description: 'Connect to Cadence Design Framework II library manager. Enumerates all registered design libraries from the cds.lib manifest.',
    config: {
      cds_lib_path: '/path/to/your/cds.lib',
      skill_server_host: 'your-eda-server',
      skill_server_port: 5732,
      honor_lock_files: true,
      scan_cellview_types: ['schematic','layout','symbol','netlist'],
      enabled: false,
    },
    auth_type: 'UNIX_CREDENTIALS',
    supported_domains: ['ELECTRONIC_CIRCUIT'],
    setup_steps: [
      'Provide the path to the cds.lib file on the EDA server',
      'Ensure the CUDE service account has read-only access to all registered library paths',
      'Enable "Honor lock files" to avoid interfering with active design sessions',
      'A lightweight agent must run on the EDA server or a machine with NFS access',
    ],
    last_scan: null,
    files_discovered: 0,
  },

  ic_manage: {
    id: 'ic_manage',
    name: 'Synopsys IC Manage (ICM)',
    category: 'EDA Tools',
    icon: '🔲',
    status: 'NOT_CONFIGURED',
    description: 'Query IC Manage (Golden Data Platform) design version control via the gdp CLI or REST API for design data discovery.',
    config: {
      icm_server: 'your-icm-server.company.com',
      icm_port: 8080,
      api_token: '',
      projects: ['your-project-1','your-project-2'],
      include_all_versions: false,
      enabled: false,
    },
    auth_type: 'API_TOKEN',
    supported_domains: ['ELECTRONIC_CIRCUIT'],
    setup_steps: [
      'Enter the IC Manage server hostname and port',
      'Generate a read-only API token from the ICM admin console',
      'List the project names to monitor (must match ICM project identifiers exactly)',
      'Disable "Include all versions" for initial scan — only index the latest checked-in version',
    ],
    last_scan: null,
    files_discovered: 0,
  },

  aws_s3: {
    id: 'aws_s3',
    name: 'AWS S3 / Object Storage',
    category: 'Cloud Storage',
    icon: '☁️',
    status: 'NOT_CONFIGURED',
    description: 'Scan S3 buckets for CAD archives, design exports, and document repositories. Uses S3 Event Notifications for real-time discovery.',
    config: {
      aws_region: 'us-east-1',
      access_key_id: '',
      secret_access_key: '',
      bucket_names: ['your-eda-archive-bucket','your-docs-bucket'],
      prefix_filter: '',
      use_event_notifications: true,
      enabled: false,
    },
    auth_type: 'AWS_CREDENTIALS',
    supported_domains: ['ELECTRONIC_CIRCUIT','PDF_DOCUMENT','OFFICE_DOCUMENT','AUDIO','VIDEO'],
    setup_steps: [
      'Create an IAM user with s3:GetObject and s3:ListBucket permissions on target buckets',
      'Generate access key ID and secret for the IAM user',
      'Enter bucket names and optional prefix (folder path) to scan',
      'Enable S3 Event Notifications to trigger discovery on every new object upload',
    ],
    last_scan: null,
    files_discovered: 0,
  },

  azure_blob: {
    id: 'azure_blob',
    name: 'Azure Blob Storage',
    category: 'Cloud Storage',
    icon: '☁️',
    status: 'NOT_CONFIGURED',
    description: 'Scan Azure Blob Storage containers for design archives and documents using Managed Identity or connection string authentication.',
    config: {
      connection_string: '',
      account_name: 'your-storage-account',
      container_names: ['your-container-name'],
      use_managed_identity: true,
      enabled: false,
    },
    auth_type: 'AZURE_IDENTITY',
    supported_domains: ['ELECTRONIC_CIRCUIT','PDF_DOCUMENT','OFFICE_DOCUMENT','AUDIO','VIDEO'],
    setup_steps: [
      'Assign "Storage Blob Data Reader" role to the CUDE managed identity on target containers',
      'Or provide a connection string with read-only SAS token',
      'List container names to scan',
      'Use Managed Identity if CUDE is deployed on Azure — no credentials stored',
    ],
    last_scan: null,
    files_discovered: 0,
  },

  onedrive: {
    id: 'onedrive',
    name: 'Microsoft OneDrive',
    category: 'Microsoft 365',
    icon: '☁️',
    status: 'NOT_CONFIGURED',
    description: 'Discover files from OneDrive for Business or personal OneDrive accounts via the Microsoft Graph API. Supports shared drives and delta sync for incremental discovery.',
    config: {
      tenant_id: '',
      client_id: '',
      client_secret: '',
      drive_type: 'business',
      user_email: '',
      folder_paths: ['/Documents','/Shared'],
      include_shared_with_me: true,
      delta_sync: true,
      enabled: false,
    },
    auth_type: 'OAUTH2',
    supported_domains: ['PDF_DOCUMENT','OFFICE_DOCUMENT','AUDIO','VIDEO'],
    setup_steps: [
      'Register an app in Azure Active Directory (portal.azure.com → App Registrations)',
      'Grant Microsoft Graph permissions: Files.Read.All, User.Read (delegated or application)',
      'Generate a client secret and copy the Tenant ID, Client ID, and Secret here',
      'Specify the user email for personal drive access, or leave blank for service-account-level access',
      'List folder paths to scan within the drive (e.g. /Documents, /Projects)',
      'Enable "Delta sync" for incremental discovery — only new or changed files are processed after first scan',
    ],
    last_scan: null,
    files_discovered: 0,
  },

  confluence: {
    id: 'confluence',
    name: 'Atlassian Confluence',
    category: 'Collaboration',
    icon: '📚',
    status: 'NOT_CONFIGURED',
    description: 'Discover technical documents, design wikis, and attached files from Confluence spaces via the REST API.',
    config: {
      base_url: 'https://yourcompany.atlassian.net/wiki',
      api_token: '',
      user_email: 'your-email@company.com',
      space_keys: ['ENG'],
      include_attachments: true,
      enabled: false,
    },
    auth_type: 'API_TOKEN',
    supported_domains: ['PDF_DOCUMENT','OFFICE_DOCUMENT'],
    setup_steps: [
      'Generate an Atlassian API token at id.atlassian.com → Security → API tokens',
      'Enter the email address associated with the token',
      'List Confluence space keys to scan (find them in Space Settings → Space Details)',
      'Enable "Include attachments" to also discover PDFs and files attached to pages',
    ],
    last_scan: null,
    files_discovered: 0,
  },
};

// ── File Extension → Domain Mapping ───────────────────────────────────────────
const EXT_MAP = {
  // Electronic Circuit
  '.gds':'.gds', '.gdsii':'.gdsii', '.oas':'.oas', '.oa':'.oa',
  '.v':'.v', '.sv':'.sv', '.spi':'.spi', '.cir':'.cir', '.sp':'.sp',
  '.sdc':'.sdc', '.upf':'.upf', '.cdl':'.cdl',
  '.lef':'.lef', '.def':'.def', '.gds2':'.gds2',
  '.kicad_sch':'.kicad_sch', '.kicad_pcb':'.kicad_pcb',
  '.gbr':'.gbr', '.ger':'.ger', '.dxf':'.dxf', '.dwg':'.dwg',
  // PDF
  '.pdf':'.pdf',
  // Office
  '.docx':'.docx', '.doc':'.doc', '.xlsx':'.xlsx', '.xls':'.xls',
  '.pptx':'.pptx', '.ppt':'.ppt', '.csv':'.csv',
  // Audio
  '.mp3':'.mp3', '.m4a':'.m4a', '.wav':'.wav', '.ogg':'.ogg', '.flac':'.flac', '.wma':'.wma',
  // Video
  '.mp4':'.mp4', '.mov':'.mov', '.avi':'.avi', '.mkv':'.mkv', '.webm':'.webm', '.wmv':'.wmv',
};

const DOMAIN_BY_EXT = {
  '.gds':'ELECTRONIC_CIRCUIT', '.gdsii':'ELECTRONIC_CIRCUIT', '.oas':'ELECTRONIC_CIRCUIT',
  '.oa':'ELECTRONIC_CIRCUIT', '.v':'ELECTRONIC_CIRCUIT', '.sv':'ELECTRONIC_CIRCUIT',
  '.spi':'ELECTRONIC_CIRCUIT', '.cir':'ELECTRONIC_CIRCUIT', '.sp':'ELECTRONIC_CIRCUIT',
  '.sdc':'ELECTRONIC_CIRCUIT', '.upf':'ELECTRONIC_CIRCUIT', '.cdl':'ELECTRONIC_CIRCUIT',
  '.lef':'ELECTRONIC_CIRCUIT', '.def':'ELECTRONIC_CIRCUIT', '.gds2':'ELECTRONIC_CIRCUIT',
  '.kicad_sch':'ELECTRONIC_CIRCUIT', '.kicad_pcb':'ELECTRONIC_CIRCUIT',
  '.gbr':'ELECTRONIC_CIRCUIT', '.ger':'ELECTRONIC_CIRCUIT',
  '.dxf':'ELECTRONIC_CIRCUIT', '.dwg':'ELECTRONIC_CIRCUIT',
  '.pdf':'PDF_DOCUMENT',
  '.docx':'OFFICE_DOCUMENT', '.doc':'OFFICE_DOCUMENT',
  '.xlsx':'OFFICE_DOCUMENT', '.xls':'OFFICE_DOCUMENT',
  '.pptx':'OFFICE_DOCUMENT', '.ppt':'OFFICE_DOCUMENT',
  '.csv':'OFFICE_DOCUMENT',
  '.mp3':'AUDIO', '.m4a':'AUDIO', '.wav':'AUDIO', '.ogg':'AUDIO', '.flac':'AUDIO', '.wma':'AUDIO',
  '.mp4':'VIDEO', '.mov':'VIDEO', '.avi':'VIDEO', '.mkv':'VIDEO', '.webm':'VIDEO', '.wmv':'VIDEO',
};

const FORMAT_BY_EXT = {
  '.gds':'GDSII', '.gdsii':'GDSII', '.oas':'OASIS', '.oa':'OPENACCESS',
  '.v':'VERILOG', '.sv':'SYSTEMVERILOG', '.spi':'SPICE', '.cir':'SPICE', '.sp':'SPICE',
  '.sdc':'SDC', '.upf':'UPF', '.cdl':'CDL', '.lef':'LEF_DEF', '.def':'LEF_DEF',
  '.kicad_sch':'KICAD', '.kicad_pcb':'KICAD', '.gbr':'GERBER', '.ger':'GERBER',
  '.dxf':'DXF', '.dwg':'DWG',
  '.pdf':'PDF',
  '.docx':'WORD', '.doc':'WORD', '.xlsx':'EXCEL', '.xls':'EXCEL',
  '.pptx':'POWERPOINT', '.ppt':'POWERPOINT', '.csv':'EXCEL',
  '.mp3':'AUDIO_RECORDING', '.m4a':'AUDIO_RECORDING', '.wav':'AUDIO_RECORDING',
  '.ogg':'AUDIO_RECORDING', '.flac':'AUDIO_RECORDING', '.wma':'AUDIO_RECORDING',
  '.mp4':'VIDEO_RECORDING', '.mov':'VIDEO_RECORDING', '.avi':'VIDEO_RECORDING',
  '.mkv':'VIDEO_RECORDING', '.webm':'VIDEO_RECORDING', '.wmv':'VIDEO_RECORDING',
};

// ── Recursive folder scanner ──────────────────────────────────────────────────
function scanDirectory(dirPath, recursive = true, maxDepth = 8, currentDepth = 0) {
  const results = [];
  if (currentDepth > maxDepth) return results;

  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (e) {
    return results; // Permission denied or path not found
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // Skip hidden
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory() && recursive) {
      results.push(...scanDirectory(fullPath, recursive, maxDepth, currentDepth + 1));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!DOMAIN_BY_EXT[ext]) continue; // Skip unsupported

      let stats;
      try { stats = fs.statSync(fullPath); } catch (e) { continue; }

      results.push({
        file_name: entry.name,
        full_path: fullPath,
        relative_path: fullPath,
        extension: ext,
        format: FORMAT_BY_EXT[ext] || 'UNKNOWN',
        content_domain: DOMAIN_BY_EXT[ext] || 'UNKNOWN',
        file_size_mb: parseFloat((stats.size / 1024 / 1024).toFixed(3)),
        modified_at: stats.mtime.toISOString(),
        created_at: stats.birthtime?.toISOString() || stats.mtime.toISOString(),
      });
    }
  }
  return results;
}

// Mark all existing connectors as built-in
Object.values(connectors).forEach(c => { c.built_in = true; });

function registerConnector(def) {
  const id = def.id || def.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (connectors[id]) throw new Error(`Connector "${id}" already exists`);
  const configObj = {};
  (def.config_fields || []).forEach(f => { configObj[f.key] = f.default_value ?? ''; });
  configObj.enabled = false;
  connectors[id] = {
    id,
    name: def.name,
    category: def.category || 'Custom',
    icon: def.icon || '🔌',
    status: 'NOT_CONFIGURED',
    description: def.description || '',
    config: configObj,
    auth_type: def.auth_type || 'NONE',
    supported_domains: def.supported_domains || [],
    setup_steps: def.setup_steps || ['Configure the connection settings below', 'Test the connection', 'Enable the connector to start discovery'],
    last_scan: null,
    files_discovered: 0,
    built_in: false,
  };
  return connectors[id];
}

function removeConnector(id) {
  if (!connectors[id]) throw new Error('Connector not found');
  if (connectors[id].built_in) throw new Error('Cannot delete a built-in connector');
  const removed = connectors[id];
  delete connectors[id];
  return removed;
}

module.exports = { connectors, scanDirectory, DOMAIN_BY_EXT, FORMAT_BY_EXT, registerConnector, removeConnector };
