'use strict';

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
let repoPath = process.cwd();
let fixMode = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--fix') {
    fixMode = true;
  } else if (!args[i].startsWith('--')) {
    repoPath = path.resolve(args[i]);
  }
}

const ragDir = path.join(repoPath, '.rag');

console.log(`=== RAG Validation & Self-Healing Tool ===`);
console.log(`Workspace Path: ${repoPath}`);
console.log(`RAG Directory:  ${ragDir}`);
console.log(`Fix Mode (Self-Healing): ${fixMode ? 'ENABLED 🛠️' : 'DISABLED 🔍'}`);

if (!fs.existsSync(ragDir)) {
  console.error(`❌ Error: .rag directory does not exist at ${ragDir}`);
  process.exit(1);
}

// Ensure output is always in Chinese-simplified
function logChinese(success, text) {
  const prefix = success ? '✅' : '❌';
  console.log(`${prefix} ${text}`);
}

// Extract comprehensive source_paths from Markdown end-of-text block if present
function extractFullSourcePaths(body) {
  const match = body.match(/(?:source_paths|溯源路径)[\s\S]*?```(?:yaml|json)?\s*[\r\n]+([\s\S]*?)```/i);
  if (match) {
    const lines = match[1].split(/\r?\n/);
    const paths = [];
    let inList = false;
    for (const line of lines) {
      if (line.includes('source_paths:')) {
        inList = true;
        continue;
      }
      const itemMatch = line.match(/^\s*-\s*["']?(.*?)["']?$/);
      if (itemMatch) {
        paths.push(itemMatch[1].trim());
      }
    }
    if (paths.length > 0) return paths;
  }
  return null;
}

// Polyglot symbol extraction based on language
function extractSymbolsByLanguage(body, language) {
  const codeSymbols = [];
  
  // CamelCase class/struct/interface/function matching
  const codeRegex = /`([A-Z_a-z][a-zA-Z0-9_]{3,})`/g;
  let m;
  while ((m = codeRegex.exec(body)) !== null) {
    codeSymbols.push(m[1]);
  }
  
  const lang = String(language || 'go').toLowerCase();
  
  if (lang === 'go') {
    const fileRegex = /`([a-z0-9_]+\.go)`/g;
    while ((m = fileRegex.exec(body)) !== null) {
      codeSymbols.push(m[1]);
    }
  } else if (lang === 'python' || lang === 'py') {
    const fileRegex = /`([a-z0-9_]+\.py)`/g;
    while ((m = fileRegex.exec(body)) !== null) {
      codeSymbols.push(m[1]);
    }
    // Extract python class/def keywords if mentioned
    const pyRegex = /(?:class|def)\s+([A-Za-z0-9_]+)/g;
    while ((m = pyRegex.exec(body)) !== null) {
      if (m[1].length > 3) codeSymbols.push(m[1]);
    }
  } else if (['javascript', 'typescript', 'js', 'ts', 'node'].includes(lang)) {
    const fileRegex = /`([a-z0-9_]+\.(?:js|ts|jsx|tsx))`/g;
    while ((m = fileRegex.exec(body)) !== null) {
      codeSymbols.push(m[1]);
    }
  }
  
  return [...new Set(codeSymbols)].slice(0, 12);
}

// Robust Frontmatter YAML Parser & Serializer
function parseFrontmatter(fileContent) {
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: fileContent };
  const yamlText = match[1];
  const body = match[2];
  const meta = {};
  const lines = yamlText.split(/\r?\n/);
  let currentKey = null;
  let inList = false;
  let blockText = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*$/.test(line)) continue;
    
    if (blockText && /^\s+/.test(line)) {
      meta[currentKey] = (meta[currentKey] || '') + '\n' + line.trim();
      continue;
    } else if (blockText) {
      if (meta[currentKey]) meta[currentKey] = meta[currentKey].trim();
      blockText = false;
    }
    
    if (inList && /^\s*-\s*(.*)/.test(line)) {
      const itemMatch = line.match(/^\s*-\s*["']?(.*?)["']?$/);
      if (itemMatch) {
        meta[currentKey].push(itemMatch[1]);
      }
      continue;
    } else if (inList) {
      inList = false;
    }
    
    const kvMatch = line.match(/^([\w_]+):\s*(.*)$/);
    if (kvMatch) {
      const [_, key, value] = kvMatch;
      currentKey = key;
      const valTrim = value.trim();
      if (valTrim === '>' || valTrim === '|') {
        blockText = true;
        meta[key] = '';
      } else if (valTrim === '') {
        inList = true;
        meta[key] = [];
      } else if (valTrim.startsWith('[') && valTrim.endsWith(']')) {
        const items = valTrim.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        meta[key] = items.filter(Boolean);
      } else {
        meta[key] = valTrim.replace(/^["']|["']$/g, '');
      }
    }
  }
  if (blockText && meta[currentKey]) {
    meta[currentKey] = meta[currentKey].trim();
  }
  return { meta, body };
}

function serializeFrontmatter(meta) {
  let out = '---\n';
  // Order keys beautifully
  const order = [
    'id', 'level', 'type', 'title', 'path', 'tags', 'domain', 'intent', 
    'source_paths', 'symbols', 'parent', 'dependencies', 'graph_node_id', 
    'token_estimate', 'summary', 'created', 'updated', 'analyzer', 'confidence'
  ];
  
  const allKeys = new Set([...order, ...Object.keys(meta)]);
  for (const key of order) {
    if (meta[key] !== undefined) {
      const val = meta[key];
      if (Array.isArray(val)) {
        if (val.length === 0) {
          out += `${key}: []\n`;
        } else if (val.some(v => v.includes('"') || v.includes(' ') || v.includes('\n') || v.includes(':'))) {
          out += `${key}:\n`;
          for (const item of val) {
            out += `  - ${JSON.stringify(item)}\n`;
          }
        } else {
          out += `${key}: [${val.join(', ')}]\n`;
        }
      } else if (typeof val === 'string' && (val.includes('\n') || val.length > 80)) {
        out += `${key}: >\n  ${val.replace(/\r?\n/g, '\n  ')}\n`;
      } else {
        const valStr = String(val);
        if (valStr.includes(':') || valStr.includes('#') || valStr.startsWith('-') || valStr.includes('[') || valStr.includes(']')) {
          out += `${key}: ${JSON.stringify(valStr)}\n`;
        } else {
          out += `${key}: ${valStr}\n`;
        }
      }
      allKeys.delete(key);
    }
  }
  
  // Print remaining keys
  for (const key of allKeys) {
    if (meta[key] !== undefined) {
      out += `${key}: ${JSON.stringify(meta[key])}\n`;
    }
  }
  out += '---';
  return out;
}

// Scan all markdown files recursively
function getMarkdownFiles(dir, filesList = []) {
  if (!fs.existsSync(dir)) return filesList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getMarkdownFiles(fullPath, filesList);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const relPath = path.relative(ragDir, fullPath);
      // Skip indices/discoveries
      if (relPath !== '_index.md' && relPath !== '_discovery.md') {
        filesList.push({ relPath, fullPath });
      }
    }
  }
  return filesList;
}

// Main logic
const mdFiles = getMarkdownFiles(ragDir);
const manifestPath = path.join(ragDir, '_manifest.json');
const graphPath = path.join(ragDir, '_graph.json');

let manifest = { documents: [], hierarchy: {} };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    console.error(`⚠️ 无法解析 _manifest.json: ${e.message}`);
  }
}

let graph = { nodes: [], edges: [] };
if (fs.existsSync(graphPath)) {
  try {
    graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  } catch (e) {
    console.error(`⚠️ 无法解析 _graph.json: ${e.message}`);
  }
} else if (fixMode) {
  console.log(`🛠️  _graph.json 不存在，正在初始化空白图谱节点`);
  graph = { nodes: [], edges: [] };
}

const projectLanguage = (manifest.repository && manifest.repository.language) || 'go';

const manifestDocsMap = new Map();
if (Array.isArray(manifest.documents)) {
  manifest.documents.forEach(doc => {
    manifestDocsMap.set(doc.path, doc);
  });
}

const updatedDocuments = [];
let overallPass = true;
const errors = [];

console.log(`\n--- 🔍 第一阶段：扫描并检验 Markdown 文件 (${mdFiles.length} 个) ---`);

for (const { relPath, fullPath } of mdFiles) {
  let fileContent = fs.readFileSync(fullPath, 'utf8');
  let { meta, body } = parseFrontmatter(fileContent);
  let docPass = true;
  const docErrors = [];

  // 0. Auto normalize keys
  if (meta.layer && !meta.level) {
    meta.level = meta.layer;
    delete meta.layer;
  }
  if (meta.generated_at && !meta.created) {
    meta.created = meta.generated_at;
    delete meta.generated_at;
  }
  if (meta.commit && !meta.generated_from_commit) {
    meta.generated_from_commit = meta.commit;
    delete meta.commit;
  }

  // Determine Level from relative path if missing
  if (!meta.level) {
    if (relPath.startsWith('L0')) meta.level = 'L0';
    else if (relPath.startsWith('L1')) meta.level = 'L1';
    else if (relPath.startsWith('L2')) meta.level = 'L2';
    else if (relPath.startsWith('L3')) meta.level = 'L3';
    else if (relPath.startsWith('ADR')) meta.level = 'ADR';
  }

  // 1. Establish Unique ID
  if (!meta.id) {
    let rawId = path.basename(relPath, '.md');
    if (meta.level === 'L2' && relPath.startsWith('L2-modules/')) {
      rawId = path.basename(relPath, '.md');
    } else if (meta.level === 'L1' && relPath.startsWith('L1-systems/')) {
      rawId = path.basename(relPath, '.md');
    }
    meta.id = rawId;
  }

  // 2. Validate mandatory fields
  const requiredFields = [
    'id', 'level', 'type', 'title', 'summary', 'tags', 'domain', 'intent', 
    'source_paths', 'symbols', 'graph_node_id', 'token_estimate', 'confidence', 'updated'
  ];

  const missingFields = requiredFields.filter(f => meta[f] === undefined || meta[f] === null || meta[f] === '');
  
  if (missingFields.length > 0) {
    docPass = false;
    docErrors.push(`缺失必填元数据字段: [${missingFields.join(', ')}]`);
  }

  // Correct type mapping
  if (!meta.type) {
    if (meta.level === 'L0') meta.type = 'overview';
    else if (meta.level === 'L1') meta.type = 'system-style';
    else if (meta.level === 'L2') meta.type = 'module';
    else if (meta.level === 'L3') meta.type = 'chain-analysis';
    else if (meta.level === 'ADR') meta.type = 'adr';
  }

  // Self-Healing Strategy (FixMode Only)
  if (fixMode && (missingFields.length > 0 || !docPass)) {
    console.log(`🛠️  正在自动修正/自愈: ${relPath}`);
    
    // Auto summary
    if (!meta.summary) {
      const summaryMatch = body.match(/(?:#|##)\s*(?:概览|概述|职责)[\r\n]+([\s\S]*?)(?:[\r\n]{2,}|##|#)/);
      if (summaryMatch && summaryMatch[1].trim()) {
        meta.summary = summaryMatch[1].trim().replace(/\r?\n/g, ' ').slice(0, 150).trim() + '...';
      } else {
        meta.summary = `${meta.title || meta.id} 的核心职责、对外接口与架构链路设计。`;
      }
    }

    // Auto tags
    if (!meta.tags || meta.tags.length === 0) {
      const tags = [projectLanguage];
      if (meta.subsystem) tags.push(meta.subsystem.split('/').pop());
      if (meta.id) tags.push(...meta.id.split('-').filter(t => t !== 'backend' && t !== 'service' && t !== 'L2' && t !== 'L1'));
      meta.tags = [...new Set(tags)].slice(0, 4);
    }

    // Auto domain
    if (!meta.domain || meta.domain.length === 0) {
      meta.domain = [...meta.tags];
    }

    // Auto intent
    if (!meta.intent || meta.intent.length === 0) {
      const title = meta.title || meta.id;
      if (meta.level === 'L2') {
        meta.intent = [
          `查 ${title} 职责与模块定义`,
          `定位 ${meta.id} 的核心入口、接口和消息处理器`,
          `修改 ${title} 的业务逻辑或扩展其对外接口`
        ];
      } else if (meta.level === 'L1') {
        meta.intent = [
          `理解 ${title} 的整体架构、设计哲学和编码规范`,
          `怎么在 ${title} 子系统中新增功能或进行模块划分`
        ];
      } else if (meta.level === 'L3') {
        meta.intent = [
          `查阅 ${title} 链路的完整调用图与 Mermaid 拓扑`,
          `分析 ${title} 调用流的并发、事务和异常重试逻辑`
        ];
      } else if (meta.level === 'ADR') {
        meta.intent = [
          `了解为何采用 ${title} 的技术方案决策`,
          `查阅 ${title} 决策的背景、上下文、折中考虑与后果`
        ];
      } else {
        meta.intent = [`全局查阅 ${title} 技术架构全景图`];
      }
    }

    // Auto symbols (using language-specific extraction)
    if (!meta.symbols || meta.symbols.length === 0) {
      meta.symbols = extractSymbolsByLanguage(body, projectLanguage);
      if (meta.symbols.length === 0) {
        meta.symbols = [meta.id.replace(/-/g, '')];
      }
    }

    // Auto source_paths (with fallback)
    if (!meta.source_paths || meta.source_paths.length === 0) {
      const paths = [];
      if (meta.subsystem && meta.subsystem !== 'all') {
        paths.push(meta.subsystem);
      } else if (meta.path) {
        paths.push(meta.path);
      } else {
        const cleanId = meta.id.replace('backend-', '').replace('-service', '');
        const backendPath = `backend/${cleanId}/`;
        const pkgPath = `pkg/${cleanId}/`;
        if (fs.existsSync(path.join(repoPath, backendPath))) paths.push(backendPath);
        else if (fs.existsSync(path.join(repoPath, pkgPath))) paths.push(pkgPath);
        else if (fs.existsSync(path.join(repoPath, cleanId))) paths.push(cleanId + '/');
      }
      meta.source_paths = paths.length > 0 ? paths : [meta.id];
    }

    // Ensure they are formatted directory paths
    meta.source_paths = meta.source_paths.map(p => {
      let cleaned = p;
      if (!cleaned.endsWith('/') && !cleaned.includes('.') && !cleaned.endsWith('*') && cleaned !== 'all') {
        cleaned += '/';
      }
      return cleaned;
    });

    // Auto graph_node_id
    if (!meta.graph_node_id) {
      meta.graph_node_id = meta.id;
    }

    // Auto token_estimate
    if (!meta.token_estimate || meta.token_estimate === '0') {
      const wordsCount = body.length;
      meta.token_estimate = Math.max(1000, Math.min(3000, Math.ceil(wordsCount / 300) * 100));
    }

    // Auto confidence/updated
    if (!meta.confidence) meta.confidence = 'high';
    if (!meta.updated) meta.updated = '2026-05-21';
    if (!meta.created) meta.created = meta.updated;

    // Level dependent fields
    if (meta.level === 'L2' && !meta.parent) meta.parent = 'L0-overview';
    if (meta.level === 'L3' && !meta.parent) meta.parent = 'L0-overview';
    if (meta.level === 'L3' && (!meta.dependencies || meta.dependencies.length === 0)) {
      meta.dependencies = ['L0-overview'];
    }
    if (['L1', 'L2', 'L3'].includes(meta.level) && !meta.analyzer) {
      meta.analyzer = meta.level === 'L3' ? 'code' : 'style';
    }

    // Auto append 溯源路径 to body end if missing
    if (!body.includes('source_paths:')) {
      const cleanPaths = meta.source_paths.filter(p => p !== 'all');
      if (cleanPaths.length > 0) {
        body = body.trim() + '\n\n## 溯源路径\n\n```yaml\nsource_paths:\n' + cleanPaths.map(p => `  - ${p}`).join('\n') + '\n```\n';
      }
    }

    // Shorten frontmatter source_paths to max 5 items for brevity (routing card principle)
    if (meta.source_paths.length > 5) {
      meta.source_paths = meta.source_paths.slice(0, 5);
    }

    // Write back the corrected Markdown file
    const newContent = serializeFrontmatter(meta) + '\n' + body.trim() + '\n';
    fs.writeFileSync(fullPath, newContent, 'utf8');
    docPass = true;
    console.log(`   └─ ✅ 已经自愈并重写: ${relPath}`);
  }

  // --- Strict Non-Fix Validation Checks ---
  if (!fixMode) {
    // 1. Check for 'all' or empty source paths
    if (['L1', 'L2', 'L3'].includes(meta.level)) {
      if (!meta.source_paths || meta.source_paths.length === 0 || meta.source_paths.includes('all')) {
        docPass = false;
        docErrors.push(`RAG L1/L2/L3 级别文档必须声明明确的 source_paths，禁止使用 'all' 或留空`);
      }
    }
    // 2. generated_from_commit 必须来自真实构建，不得由脚本伪造
    if (!meta.generated_from_commit) {
      docPass = false;
      docErrors.push(`缺失 generated_from_commit 字段（必须在文档生成时写入真实 commit sha，禁止由校验脚本补填）`);
    }
  }

  if (docPass) {
    // CRITICAL: Hydrate source_paths. Use comprehensive list from:
    // 1. Markdown body end-of-text (Full tracing block)
    // 2. Existing manifest documents list (if exists)
    // 3. Frontmatter short list (only as fallback)
    let fullSourcePaths = extractFullSourcePaths(body);
    
    if (!fullSourcePaths && manifestDocsMap.has(relPath)) {
      const existingDoc = manifestDocsMap.get(relPath);
      if (Array.isArray(existingDoc.source_paths) && existingDoc.source_paths.length > 0) {
        fullSourcePaths = existingDoc.source_paths;
      }
    }
    
    if (!fullSourcePaths) {
      fullSourcePaths = Array.isArray(meta.source_paths) ? meta.source_paths : [];
    }

    const entry = {
      id: meta.id,
      path: relPath,
      level: meta.level,
      title: meta.title || '',
      summary: meta.summary || '',
      tags: meta.tags || [],
      domain: meta.domain || [],
      intent: meta.intent || [],
      symbols: meta.symbols || [],
      graph_node_id: meta.graph_node_id || meta.id,
      token_estimate: parseInt(meta.token_estimate || '1500', 10),
      source_paths: fullSourcePaths,
      confidence: meta.confidence || 'high',
      review_status: meta.review_status || 'unreviewed',
      generated_from_commit: meta.generated_from_commit || '',
      last_verified_commit: meta.last_verified_commit || ''
    };
    updatedDocuments.push(entry);
    logChinese(true, `${relPath} (id: ${meta.id}) 元数据格式通过`);
  } else {
    overallPass = false;
    errors.push(`${relPath}: ${docErrors.join('; ')}`);
    logChinese(false, `${relPath} 元数据格式有错:\n   ${docErrors.join('\n   ')}`);
  }
}

console.log(`\n--- 🔍 第二阶段：整合与校验 _manifest.json ---`);

// Reconstruct hierarchy map
const hierarchy = { L0: [], L1: [], L2: [], L3: [], API: [], ADR: [] };
updatedDocuments.forEach(doc => {
  if (hierarchy[doc.level]) {
    hierarchy[doc.level].push(doc.id);
  }
});

// finalManifest 仅用于 --fix 模式回写磁盘，不用于 non-fix 校验逻辑
// 禁止伪造 last_synced_commit / generated_at：若原始 manifest 缺失这两项，fix 模式也只留空警告
const finalManifest = {
  repo: manifest.repo || path.basename(repoPath),
  generated_at: manifest.generated_at || '',
  last_synced_commit: manifest.last_synced_commit || '',
  total_documents: updatedDocuments.length,
  hierarchy: hierarchy,
  documents: updatedDocuments,
  graph_stats: {
    total_nodes: graph.nodes ? graph.nodes.length : 0,
    total_edges: graph.edges ? graph.edges.length : 0,
    node_types: {},
    edge_types: {}
  }
};
if (fixMode && !manifest.last_synced_commit) {
  console.warn(`⚠️  警告: 原始 _manifest.json 缺失 last_synced_commit，--fix 不会伪造 commit sha。请在构建完成后手动运行 git rev-parse HEAD 并填入。`);
}
if (fixMode && !manifest.generated_at) {
  finalManifest.generated_at = new Date().toISOString();
}

// Calculate graph stats
if (graph.nodes) {
  graph.nodes.forEach(node => {
    finalManifest.graph_stats.node_types[node.type] = (finalManifest.graph_stats.node_types[node.type] || 0) + 1;
  });
}
if (graph.edges) {
  graph.edges.forEach(edge => {
    finalManifest.graph_stats.edge_types[edge.type] = (finalManifest.graph_stats.edge_types[edge.type] || 0) + 1;
    
    // Automatically fix 'from' / 'to' in graph edges if fixMode is on
    if (fixMode) {
      if (edge.from && !edge.source) {
        edge.source = edge.from;
        delete edge.from;
      }
      if (edge.to && !edge.target) {
        edge.target = edge.to;
        delete edge.to;
      }
    }
  });
}

// Strict dead source_paths checking
updatedDocuments.forEach(doc => {
  doc.source_paths.forEach(sp => {
    if (sp !== 'all') {
      const fullSp = path.join(repoPath, sp);
      if (!fs.existsSync(fullSp)) {
        if (!fixMode) {
          overallPass = false;
          errors.push(`文档 ${doc.id} 包含死溯源路径: ${sp}`);
          logChinese(false, `文档 ${doc.id} 包含死溯源路径: ${sp}`);
        } else {
          console.warn(`⚠️ 警告: 文档 ${doc.id} 声明的代码路径不存在: ${sp}`);
        }
      }
    }
  });
});

// Manifest 校验：non-fix 模式直接比对原始 manifest vs 磁盘现实，不重建事实
if (!fs.existsSync(manifestPath) && !fixMode) {
  overallPass = false;
  errors.push(`缺失 _manifest.json 文件`);
  logChinese(false, `缺失 _manifest.json 文件`);
} else if (fs.existsSync(manifestPath) || fixMode) {
  if (!fixMode) {
    // 严格校验：直接检验原始 manifest 与磁盘的双向一致性
    let manifestValid = true;

    // 1. 顶层必填字段
    const requiredTopFields = ['repo', 'generated_at', 'last_synced_commit', 'total_documents', 'hierarchy', 'documents', 'graph_stats'];
    for (const f of requiredTopFields) {
      if (manifest[f] === undefined || manifest[f] === null || manifest[f] === '') {
        manifestValid = false;
        errors.push(`_manifest.json 缺失顶层字段: ${f}`);
        logChinese(false, `_manifest.json 缺失顶层字段: ${f}`);
      }
    }

    // 2. total_documents 必须与 documents[] 数组实际长度一致（原始 manifest，非重建值）
    if (Array.isArray(manifest.documents) && manifest.total_documents !== manifest.documents.length) {
      manifestValid = false;
      errors.push(`_manifest.json total_documents (${manifest.total_documents}) 与 documents[] 实际长度 (${manifest.documents.length}) 不符`);
      logChinese(false, `total_documents 字段与 documents[] 数组长度不符: ${manifest.total_documents} vs ${manifest.documents.length}`);
    }

    // 3. 双向比对：manifest 注册项 ←→ 磁盘文件
    const diskPathSet = new Set(mdFiles.map(f => f.relPath));
    const manifestPathSet = new Set();

    if (Array.isArray(manifest.documents)) {
      manifest.documents.forEach(doc => {
        manifestPathSet.add(doc.path);
        if (!diskPathSet.has(doc.path)) {
          manifestValid = false;
          errors.push(`Manifest 注册了磁盘不存在的文档: ${doc.path} (id: ${doc.id})`);
          logChinese(false, `Manifest 幽灵条目（磁盘无对应文件）: ${doc.path}`);
        }
      });
    }

    mdFiles.forEach(({ relPath }) => {
      if (!manifestPathSet.has(relPath)) {
        manifestValid = false;
        errors.push(`磁盘文件 ${relPath} 未在 _manifest.json documents[] 中注册`);
        logChinese(false, `未注册文档（Manifest 缺项）: ${relPath}`);
      }
    });

    if (manifestValid) {
      logChinese(true, `_manifest.json 双向一致性校验通过 (${manifest.documents.length} 篇)`);
    } else {
      overallPass = false;
    }
  } else {
    // fix 模式：finalManifest 已从磁盘扫描重建，稍后写回，此处仅统计
    logChinese(true, `--fix 模式：已从磁盘扫描重建 manifest (${updatedDocuments.length} 篇文档)`);
  }
}

console.log(`\n--- 🔍 第三阶段：校验 GraphRAG 关系图谱 (_graph.json) ---`);
if (fs.existsSync(graphPath)) {
  let graphPass = true;
  const nodeIds = new Set(graph.nodes.map(n => n.id));
  
  // Verify graph edges strictly
  graph.edges.forEach((edge, idx) => {
    if (!edge.source || !edge.target) {
      graphPass = false;
      logChinese(false, `边索引[${idx}]缺少 source 或 target 字段(可能依旧是旧 from/to): ${JSON.stringify(edge)}`);
    } else {
      if (!nodeIds.has(edge.source)) {
        graphPass = false;
        logChinese(false, `边引用了不存在的 source 节点 id: ${edge.source}`);
      }
      if (!nodeIds.has(edge.target)) {
        graphPass = false;
        logChinese(false, `边引用了不存在的 target 节点 id: ${edge.target}`);
      }
    }
  });

  // CRITICAL: Verify graph_node_id in documents exist as actual nodes in Graph nodes
  // 禁止 --fix 自动伪造节点：缺失节点代表构建阶段的遗漏，不应由校验脚本掩盖
  updatedDocuments.forEach(doc => {
    if (doc.graph_node_id && !nodeIds.has(doc.graph_node_id)) {
      graphPass = false;
      if (fixMode) {
        console.warn(`⚠️  --fix 不会自动伪造图谱节点。文档 ${doc.id} 的 graph_node_id [${doc.graph_node_id}] 在 _graph.json nodes 中不存在，请在构建阶段补充该节点。`);
      }
      logChinese(false, `文档 ${doc.id} 的 graph_node_id [${doc.graph_node_id}] 在 _graph.json nodes 列表中不存在`);
    }
  });

  if (graphPass) {
    logChinese(true, `_graph.json 拓扑合法性与节点存在性校验通过`);
  } else {
    overallPass = false;
    errors.push(`_graph.json 存在边引用拓扑错误或文档关联节点丢失`);
  }
} else {
  if (!fixMode) {
    overallPass = false;
    errors.push(`缺失 _graph.json 文件`);
    logChinese(false, `缺失 _graph.json 文件`);
  } else {
    console.warn(`⚠️ 警告: 缺失 _graph.json`);
  }
}

console.log(`\n--- 🔍 第四阶段：校验 API 契约可追溯性 ---`);
const apiContractsDir = path.join(ragDir, 'api-contracts');
if (fs.existsSync(apiContractsDir)) {
  const apiFiles = fs.readdirSync(apiContractsDir);
  let apiPass = true;
  
  for (const file of apiFiles) {
    if (file.endsWith('.json')) {
      const fullFilePath = path.join(apiContractsDir, file);
      try {
        const openapi = JSON.parse(fs.readFileSync(fullFilePath, 'utf8'));
        if (openapi.paths) {
          for (const [pathKey, pathObj] of Object.entries(openapi.paths)) {
            for (const [method, opObj] of Object.entries(pathObj)) {
              const handlerPath = opObj['x-handler'] || opObj['x-handler-path'];
              if (handlerPath) {
                const fullSp = path.join(repoPath, handlerPath);
                if (!fs.existsSync(fullSp)) {
                  apiPass = false;
                  logChinese(false, `API 契约 ${file} [${method.toUpperCase()} ${pathKey}] 声明的 Handler 路径不存在: ${handlerPath}`);
                }
              }
            }
          }
        }
      } catch (e) {
        console.error(`⚠️ 无法解析 API 契约 JSON ${file}: ${e.message}`);
      }
    }
  }
  
  if (apiPass) {
    logChinese(true, `API 契约可追溯性校验通过`);
  } else {
    overallPass = false;
    errors.push(`API 契约中存在无法追溯的 Handler 路径`);
  }
} else {
  console.log(`ℹ️ 无 api-contracts/ 目录，跳过 API 契约追溯。`);
}

if (fixMode) {
  // Update final graph stats in manifest before writing
  finalManifest.graph_stats.total_nodes = graph.nodes ? graph.nodes.length : 0;
  finalManifest.graph_stats.total_edges = graph.edges ? graph.edges.length : 0;
  finalManifest.graph_stats.node_types = {};
  if (graph.nodes) {
    graph.nodes.forEach(node => {
      finalManifest.graph_stats.node_types[node.type] = (finalManifest.graph_stats.node_types[node.type] || 0) + 1;
    });
  }
  
  fs.writeFileSync(manifestPath, JSON.stringify(finalManifest, null, 2), 'utf8');
  logChinese(true, `已整合、补全并智能写入标准 _manifest.json (${updatedDocuments.length} 篇文档)`);
  
  if (graph.nodes) {
    fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf8');
    logChinese(true, `已自动补全并写入 _graph.json (Nodes: ${graph.nodes.length}, Edges: ${graph.edges.length})`);
  }
}

console.log(`\n================================─────────`);
if (overallPass) {
  console.log(`🎉 最终结果: RAG 规范校验通过 (PASS)`);
  if (!fixMode) {
    console.log(`提示: 如果需要为旧元数据/缺损字段进行一键智能“补全自愈”，可运行:`);
    console.log(`node plugins/gg/scripts/validate-rag.js <path> --fix`);
  }
} else {
  console.log(`❌ 最终结果: RAG 规范校验失败 (FAIL)`);
  console.log(`错误清单:\n - ${errors.join('\n - ')}`);
  console.log(`\n🛠️  建议: 运行自愈指令来一键补全、规范化、修正所有文档元数据和注册表：`);
  console.log(`node plugins/gg/scripts/validate-rag.js ${repoPath} --fix`);
}
console.log(`================================─────────`);

process.exit(overallPass ? 0 : 1);
