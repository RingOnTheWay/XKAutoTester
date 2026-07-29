const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const asyncFs = require('../utils/asyncFs');

// ── tar 格式常量 (POSIX ustar) ──────────────────────────────────
const BLOCK_SIZE = 512;
const FILE_NAME_OFFSET = 0;
const FILE_NAME_LENGTH = 100;
const FILE_TYPE_OFFSET = 156;
const FILE_SIZE_OFFSET = 124;
const FILE_SIZE_LENGTH = 12;
const DIRECTORY_TYPE = '5';

/**
 * TarExtractor - 解 tar 文件到指定目录
 *
 * 仅负责 extract, 不做 zip 打包 (zip 留调用方处理).
 * 支持: 普通文件 / 目录 / 文件名特殊字符替换.
 */
class TarExtractor {
  /**
   * 解 tar 文件到指定目录
   * @param {string} tarPath - tar 文件路径
   * @param {string} outputDir - 输出目录 (不存在自动创建)
   * @returns {Promise<string[]>} 提取的文件路径列表 (不含目录)
   */
  async extract(tarPath, outputDir) {
    await asyncFs.ensureDir(outputDir);

    const buffer = await this._readTarFile(tarPath);
    const entries = this._parseTarBuffer(buffer);

    const extractedFiles = [];
    for (const entry of entries) {
      const outputPath = path.join(outputDir, entry.name);
      if (entry.isDirectory) {
        await asyncFs.mkdir(outputPath, { recursive: true });
      } else {
        const outputDirPath = path.dirname(outputPath);
        if (!(await asyncFs.exists(outputDirPath))) {
          await asyncFs.mkdir(outputDirPath, { recursive: true });
        }
        await fsp.writeFile(outputPath, entry.data);
        extractedFiles.push(outputPath);
      }
    }

    return extractedFiles;
  }

  /**
   * 读取 tar 文件为 Buffer
   * @param {string} tarPath
   * @returns {Promise<Buffer>}
   */
  async _readTarFile(tarPath) {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(tarPath);
      let buffer = Buffer.alloc(0);
      readStream.on('data', (chunk) => { buffer = Buffer.concat([buffer, chunk]); });
      readStream.on('end', () => resolve(buffer));
      readStream.on('error', reject);
    });
  }

  /**
   * 解析 tar buffer 为 entry 列表
   * @param {Buffer} buffer
   * @returns {Array<{name: string, isDirectory: boolean, data: Buffer|null}>}
   */
  _parseTarBuffer(buffer) {
    const entries = [];
    let offset = 0;

    while (offset < buffer.length) {
      const header = buffer.slice(offset, offset + BLOCK_SIZE);
      const rawName = header.toString('utf8', FILE_NAME_OFFSET, FILE_NAME_OFFSET + FILE_NAME_LENGTH).trim();
      if (!rawName) break;

      const safeName = this._sanitizeFileName(rawName);
      if (!safeName) {
        offset += BLOCK_SIZE;
        continue;
      }

      const fileType = header.toString('utf8', FILE_TYPE_OFFSET, FILE_TYPE_OFFSET + 1);
      const sizeStr = header.toString('utf8', FILE_SIZE_OFFSET, FILE_SIZE_OFFSET + FILE_SIZE_LENGTH).trim();
      const fileSize = parseInt(sizeStr, 8);
      const dataSize = Math.ceil(fileSize / BLOCK_SIZE) * BLOCK_SIZE;

      const isDirectory = fileType === DIRECTORY_TYPE || rawName.endsWith('/');

      entries.push({
        name: safeName,
        isDirectory,
        data: isDirectory ? null : buffer.slice(offset + BLOCK_SIZE, offset + BLOCK_SIZE + fileSize),
      });

      offset += BLOCK_SIZE + dataSize;
    }

    return entries;
  }

  /**
   * 清理文件名: 去除 null 字节 + 替换 Windows 非法字符
   */
  _sanitizeFileName(name) {
    return name.replace(/\x00/g, '').replace(/[<>:"|?*]/g, '_');
  }
}

module.exports = TarExtractor;
