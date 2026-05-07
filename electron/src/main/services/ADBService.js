const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const asyncFs = require('../utils/asyncFs');
const AdmZip = require('adm-zip');
const pathHelper = require('../utils/pathHelper');

class ADBService {
  constructor(projectRoot, i18nService) {
    this.projectRoot = projectRoot;
    this.i18nService = i18nService;
  }

  getAdbPath() {
    return pathHelper.getAdbPath(this.projectRoot, true);
  }

  async getConnectedDevices() {
    try {
      const adbPath = this.getAdbPath();
      const result = await new Promise((resolve, reject) => {
        exec(`"${adbPath}" devices`, { encoding: 'utf8' }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        });
      });
      
      const devices = [];
      const lines = result.split('\n');
      
      for (const line of lines) {
        const match = line.match(/^([^\s]+)\s+device/);
        if (match) {
          devices.push(match[1]);
        }
      }
      
      return devices;
    } catch (error) {
      return [];
    }
  }

  async executeAdbCommand(cmd, deviceId) {
    try {
      const adbPath = this.getAdbPath();
      const cmdParts = cmd.split(/\s+/).filter(part => part.trim() !== '');
      
      const args = [];
      if (deviceId) {
        args.push('-s', deviceId);
      }
      
      const noShellCommands = ['connect', 'disconnect', 'devices', 'kill-server', 'start-server', 'version', 'tcpip'];
      const firstCmd = cmdParts[0];
      
      if (!noShellCommands.includes(firstCmd)) {
        args.push('shell');
      }
      
      args.push(...cmdParts);
      
      const adbProcess = spawn(adbPath, args, { 
        windowsHide: true
      });
      
      let stdout = '';
      let stderr = '';
      let resolved = false;
      
      return new Promise((resolve) => {
        const doResolve = (result) => {
          if (resolved) return;
          resolved = true;
          resolve(result);
        };
        
        adbProcess.stdout.on('data', (data) => {
          stdout += data.toString();
          
          if (firstCmd === 'tcpip' && stdout.includes('restarting in TCP mode port:')) {
            adbProcess.kill();
            doResolve({ success: true, output: stdout, error: stderr });
          }
        });
        
        adbProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        adbProcess.on('close', (code) => {
          if (firstCmd === 'connect') {
            if (stdout.includes('connected to') || stdout.includes('already connected')) {
              doResolve({ success: true, output: stdout, error: stderr });
            } else {
              doResolve({ success: false, error: stderr || stdout, output: stdout });
            }
          } else if (firstCmd === 'tcpip') {
            if (stdout.includes('restarting in TCP mode port:')) {
              doResolve({ success: true, output: stdout, error: stderr });
            } else if (stderr.includes('error:') || code !== 0) {
              doResolve({ success: false, error: stderr || 'Failed to restart in TCP mode', output: stdout });
            } else {
              doResolve({ success: true, output: stdout, error: stderr });
            }
          } else {
            if (code !== 0) {
              doResolve({ success: false, error: stderr || this.i18nService.t('main.commandFailed', { code }), output: stdout });
            } else {
              doResolve({ success: true, output: stdout, error: stderr });
            }
          }
        });
        
        adbProcess.on('error', (error) => {
          doResolve({ success: false, error: error.message, output: '' });
        });
        
        setTimeout(() => {
          if (resolved) return;
          adbProcess.kill();
          if (firstCmd === 'tcpip' && stdout.includes('restarting in TCP mode port:')) {
            doResolve({ success: true, output: stdout, error: stderr });
          } else {
            doResolve({ success: false, error: this.i18nService.t('main.commandTimeout'), output: stdout });
          }
        }, 5000);
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async uploadFile(localPath, remotePath, deviceId) {
    try {
      const adbPath = this.getAdbPath();
      const adbCmd = deviceId ? `"${adbPath}" -s ${deviceId} push "${localPath}" "${remotePath}"` : `"${adbPath}" push "${localPath}" "${remotePath}"`;
      
      return new Promise((resolve) => {
        exec(adbCmd, { windowsHide: true }, (error, stdout, stderr) => {
          if (error) {
            resolve({ success: false, error: stderr || error.message });
          } else {
            resolve({ success: true, output: stdout });
          }
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async downloadFile(remotePath, localPath, deviceId, eventSender) {
    try {
      const adbPath = this.getAdbPath();
      let isDir = false;
      
      try {
        const listCmd = deviceId 
          ? `"${adbPath}" -s ${deviceId} shell ls -la "${remotePath}"` 
          : `"${adbPath}" shell ls -la "${remotePath}"`;
        
        const result = await new Promise((resolve, reject) => {
          exec(listCmd, { 
            encoding: 'utf-8', 
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore']
          }, (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout);
          });
        }).trim();
        
        isDir = result.startsWith('total') || result.includes('drwx');
      } catch (error) {
        isDir = false;
      }
      
      const sanitizeFileName = (name) => {
        return name.replace(/[\\/:*?"<>|]/g, '_');
      };
      
      let finalLocalPath = localPath;
      
      if (isDir) {
        const basePath = localPath.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
        const dirName = path.basename(remotePath);
        const sanitizedDirName = sanitizeFileName(dirName);
        finalLocalPath = `${basePath}/${sanitizedDirName}.zip`;
        
        const os = require('os');
        const tempDir = path.join(os.tmpdir(), `adb_download_${Date.now()}`);
        try {
          await asyncFs.ensureDir(tempDir);
        } catch (error) {
          throw new Error(`Failed to create temporary directory: ${error.message}`);
        }
        
        const adbExecOutCmd = deviceId 
          ? `"${adbPath}" -s ${deviceId} exec-out "cd \\"${remotePath}\\" && tar -chf - ./"` 
          : `"${adbPath}" exec-out "cd \\"${remotePath}\\" && tar -chf - ./"`;
        
        const tempTarPath = path.join(tempDir, `${sanitizedDirName}.tar`);
        const fs = require('fs');
        const tarWriteStream = fs.createWriteStream(tempTarPath);
        
        if (eventSender) {
          eventSender.send('download-progress', {
            percentage: 0,
            transferred: 0,
            totalSize: 1,
            fileName: path.basename(finalLocalPath)
          });
        }
        
        const process = spawn(adbExecOutCmd, { shell: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        
        let transferred = 0;
        let errorOutput = '';
        
        process.stdout.pipe(tarWriteStream);
        
        process.stdout.on('data', (data) => {
          transferred += data.length;
          const percentage = Math.min(95, Math.floor((transferred / (1024 * 1024)) * 10));
          
          if (eventSender) {
            eventSender.send('download-progress', {
              percentage,
              transferred: 1,
              totalSize: 1,
              fileName: path.basename(finalLocalPath)
            });
          }
        });
        
        process.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        return new Promise((resolve) => {
          process.on('close', async (code) => {
            if (code === 0) {
              try {
                await this.processTarAndCreateZip(tempTarPath, tempDir, finalLocalPath, eventSender);
                
                await asyncFs.unlink(tempTarPath);
                await asyncFs.rm(tempDir, { recursive: true, force: true });
                
                resolve({ success: true, output: this.i18nService.t('main.fileDownloaded', { path: finalLocalPath }), localPath: finalLocalPath });
              } catch (error) {
                if (await asyncFs.exists(tempTarPath)) await asyncFs.unlink(tempTarPath);
                await asyncFs.rm(tempDir, { recursive: true, force: true });
                
                resolve({ success: false, error: this.i18nService.t('main.zipCreationFailed', { error: error.message }) });
              }
            } else {
              if (await asyncFs.exists(tempTarPath)) await asyncFs.unlink(tempTarPath);
              await asyncFs.rm(tempDir, { recursive: true, force: true });
              
              resolve({ success: false, error: `执行的ADB命令: ${adbExecOutCmd}\n退出码: ${code}\n详细错误: ${errorOutput.trim()}` });
            }
          });
        });
      } else {
        const basePath = localPath.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
        const fileName = path.basename(localPath);
        const sanitizedFileName = sanitizeFileName(fileName);
        finalLocalPath = `${basePath}/${sanitizedFileName}`;
        
        const adbCmd = deviceId 
          ? `"${adbPath}" -s ${deviceId} pull -p "${remotePath}" "${finalLocalPath}"` 
          : `"${adbPath}" pull -p "${remotePath}" "${finalLocalPath}"`;
        
        return new Promise((resolve) => {
          const process = spawn(adbCmd, { shell: true, windowsHide: true });
          
          let totalSize = 0;
          let errorOutput = '';
          
          process.stdout.on('data', (data) => {
            const output = data.toString();
            const progressMatch = output.match(/\[(\d+)\/(\d+)\s+\((\d+)%\)\]/);
            if (progressMatch && eventSender) {
              const percentage = parseInt(progressMatch[3]);
              eventSender.send('download-progress', {
                percentage,
                transferred: parseInt(progressMatch[1]),
                totalSize: parseInt(progressMatch[2]),
                fileName: path.basename(finalLocalPath)
              });
            }
          });
          
          process.stderr.on('data', (data) => {
            errorOutput += data.toString();
          });
          
          process.on('close', (code) => {
            if (code === 0) {
              if (eventSender) {
                eventSender.send('download-progress', {
                  percentage: 100,
                  transferred: totalSize || 1,
                  totalSize: totalSize || 1,
                  fileName: path.basename(finalLocalPath)
                });
              }
              resolve({ success: true, output: `文件已成功下载到: ${finalLocalPath}`, localPath: finalLocalPath });
            } else {
              resolve({ success: false, error: `执行的ADB命令: ${adbCmd}\n退出码: ${code}\n详细错误: ${errorOutput.trim()}` });
            }
          });
        });
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async processTarAndCreateZip(tempTarPath, tempDir, finalLocalPath, eventSender) {
    const fs = require('fs');
    const extractDir = path.join(tempDir, 'extract');
    await asyncFs.ensureDir(extractDir);
    
    const readStream = fs.createReadStream(tempTarPath);
    let buffer = Buffer.alloc(0);
    let offset = 0;
    const blockSize = 512;
    
    await new Promise((resolve, reject) => {
      readStream.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
      });
      
      readStream.on('end', async () => {
        try {
          while (offset < buffer.length) {
            const header = buffer.slice(offset, offset + blockSize);
            const fileType = header.toString('utf8', 156, 157);
            let fileName = header.toString('utf8', 0, 100).trim();
            if (!fileName) break;
            
            fileName = fileName.replace(/\x00/g, '').replace(/[<>:"|?*]/g, '_');
            if (!fileName) {
              offset += blockSize;
              continue;
            }
            
            const outputPath = path.join(extractDir, fileName);
            
            if (fileType === '5' || fileName.endsWith('/')) {
              if (!(await asyncFs.exists(outputPath))) {
                await asyncFs.mkdir(outputPath, { recursive: true });
              }
              const sizeStr = header.toString('utf8', 124, 135).trim();
              const fileSize = parseInt(sizeStr, 8);
              const dataSize = Math.ceil(fileSize / blockSize) * blockSize;
              offset += blockSize + dataSize;
              continue;
            }
            
            const sizeStr = header.toString('utf8', 124, 135).trim();
            const fileSize = parseInt(sizeStr, 8);
            const dataOffset = offset + blockSize;
            const fileData = buffer.slice(dataOffset, dataOffset + fileSize);
            
            const outputDirPath = path.dirname(outputPath);
            if (!(await asyncFs.exists(outputDirPath))) {
              await asyncFs.mkdir(outputDirPath, { recursive: true });
            }
            
            await asyncFs.writeFile(outputPath, fileData);
            offset += blockSize + Math.ceil(fileSize / blockSize) * blockSize;
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      
      readStream.on('error', reject);
    });
    
    const zip = new AdmZip();
    
    const addDirectoryToZip = async (dirPath, zipPath = '') => {
      const files = await asyncFs.readdir(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const zipFilePath = path.join(zipPath, file);
        const stats = await asyncFs.stat(filePath);
        
        if (stats.isDirectory()) {
          zip.addFile(`${zipFilePath}/`, Buffer.alloc(0));
          await addDirectoryToZip(filePath, zipFilePath);
        } else {
          const fs = require('fs');
          zip.addFile(zipFilePath, fs.readFileSync(filePath));
        }
      }
    };
    
    await addDirectoryToZip(extractDir);
    zip.writeZip(finalLocalPath);
    
    if (eventSender) {
      eventSender.send('download-progress', {
        percentage: 100,
        transferred: 1,
        totalSize: 1,
        fileName: path.basename(finalLocalPath)
      });
    }
  }

  async installApk(apkPath, deviceId, eventSender) {
    try {
      const adbPath = this.getAdbPath();
      const fs = require('fs');
      
      // 获取APK文件大小
      const stats = fs.statSync(apkPath);
      const fileSizeInBytes = stats.size;
      const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);
      console.log('[ADBService] Installing APK:', { apkPath, deviceId, fileSize: fileSizeInMB + 'MB' });
      
      // 生成临时文件路径
      const tempFileName = `temp_${Date.now()}.apk`;
      const tempRemotePath = `/data/local/tmp/${tempFileName}`;
      
      // 发送初始进度
      if (eventSender) {
        eventSender.send('install-progress', {
          percentage: 0,
          status: 'preparing',
          message: this.i18nService.t('fileManager.preparingInstall'),
          fileName: path.basename(apkPath),
          fileSize: fileSizeInMB + ' MB'
        });
      }
      
      // 步骤1: 使用adb push推送文件到设备
      console.log('[ADBService] Step 1: Pushing APK to device...');
      const pushArgs = deviceId ? ['-s', deviceId, 'push', apkPath, tempRemotePath] : ['push', apkPath, tempRemotePath];
      
      const pushProcess = spawn(adbPath, pushArgs, { windowsHide: true });
      let pushResolved = false;
      
      // 启动进度监控
      const monitorInterval = setInterval(async () => {
        if (pushResolved) {
          clearInterval(monitorInterval);
          return;
        }
        
        try {
          // 使用adb stat获取文件大小
          const statArgs = deviceId ? ['-s', deviceId, 'shell', 'stat', tempRemotePath] : ['shell', 'stat', tempRemotePath];
          const statResult = await this.executeAdbCommandAsync(statArgs);
          
          if (pushResolved) return;
          
          if (statResult.success && statResult.output) {
            // 解析stat输出，格式: Size: 1234567
            const sizeMatch = statResult.output.match(/Size:\s*(\d+)/);
            if (sizeMatch) {
              const transferredBytes = parseInt(sizeMatch[1]);
              const percentage = Math.min(80, Math.round((transferredBytes / fileSizeInBytes) * 80));
              
              console.log('[ADBService] Transfer progress:', transferredBytes, '/', fileSizeInBytes, 'bytes (', percentage, '%)');
              
              if (eventSender) {
                eventSender.send('install-progress', {
                  percentage: percentage,
                  status: 'transferring',
                  message: this.i18nService.t('fileManager.transferring') || '正在传输文件...',
                  fileName: path.basename(apkPath),
                  fileSize: fileSizeInMB + ' MB'
                });
              }
            }
          }
        } catch (error) {
          // 忽略监控错误
        }
      }, 500);
      
      // 等待push完成
      const pushResult = await new Promise((resolve) => {
        let pushStdout = '';
        let pushStderr = '';
        
        pushProcess.stdout.on('data', (data) => {
          pushStdout += data.toString();
          console.log('[ADBService] push stdout:', data.toString());
        });
        
        pushProcess.stderr.on('data', (data) => {
          pushStderr += data.toString();
          console.log('[ADBService] push stderr:', data.toString());
        });
        
        pushProcess.on('close', (code) => {
          pushResolved = true;
          clearInterval(monitorInterval);
          console.log('[ADBService] Push completed with code:', code);
          
          // 即使退出码为1，也要检查是否成功推送
          // ADB有时会返回退出码1，但实际上文件已成功推送
          const success = code === 0 || pushStderr.includes('file pushed') || pushStdout.includes('file pushed');
          
          resolve({
            success: success,
            stdout: pushStdout,
            stderr: pushStderr,
            code: code
          });
        });
        
        pushProcess.on('error', (error) => {
          pushResolved = true;
          clearInterval(monitorInterval);
          console.error('[ADBService] Push error:', error);
          resolve({
            success: false,
            stdout: pushStdout,
            stderr: pushStderr,
            error: error.message
          });
        });
      });
      
      // 检查push是否成功
      if (!pushResult.success) {
        console.error('[ADBService] Push failed:', pushResult);
        const errorMsg = pushResult.stderr || pushResult.error || 'Failed to push APK to device';
        if (eventSender) {
          eventSender.send('install-progress', {
            percentage: 100,
            status: 'error',
            message: this.i18nService.t('fileManager.installFailed'),
            fileName: path.basename(apkPath),
            fileSize: fileSizeInMB + ' MB',
            error: errorMsg
          });
        }
        return { success: false, error: errorMsg, output: pushResult.stdout };
      }
      
      // 步骤2: 使用adb shell pm install安装临时文件
      console.log('[ADBService] Step 2: Installing APK...');
      if (eventSender) {
        eventSender.send('install-progress', {
          percentage: 80,
          status: 'installing',
          message: this.i18nService.t('fileManager.installing'),
          fileName: path.basename(apkPath),
          fileSize: fileSizeInMB + ' MB'
        });
      }
      
      // 使用pm install而不是adb install，因为文件已经在设备上了
      const installArgs = deviceId 
        ? ['-s', deviceId, 'shell', 'pm', 'install', '-r', tempRemotePath] 
        : ['shell', 'pm', 'install', '-r', tempRemotePath];
      const installProcess = spawn(adbPath, installArgs, { windowsHide: true });
      
      let stdout = '';
      let stderr = '';
      let resolved = false;
      
      return new Promise((resolve) => {
        const doResolve = async (result) => {
          if (resolved) return;
          resolved = true;
          
          // 步骤3: 删除临时文件
          console.log('[ADBService] Step 3: Cleaning up temp file...');
          try {
            const rmArgs = deviceId ? ['-s', deviceId, 'shell', 'rm', tempRemotePath] : ['shell', 'rm', tempRemotePath];
            await this.executeAdbCommandAsync(rmArgs);
            console.log('[ADBService] Temp file removed');
          } catch (error) {
            console.error('[ADBService] Failed to remove temp file:', error);
          }
          
          console.log('[ADBService] Install result:', result);
          resolve(result);
        };
        
        installProcess.stdout.on('data', (data) => {
          const output = data.toString();
          stdout += output;
          console.log('[ADBService] install stdout:', output);
        });
        
        installProcess.stderr.on('data', (data) => {
          stderr += data.toString();
          console.log('[ADBService] install stderr:', data.toString());
        });
        
        installProcess.on('close', (code) => {
          console.log('[ADBService] Install process closed with code:', code);
          console.log('[ADBService] Full stdout:', stdout);
          console.log('[ADBService] Full stderr:', stderr);
          
          const isSuccess = stdout.toLowerCase().includes('success');
          
          if (isSuccess) {
            if (eventSender) {
              eventSender.send('install-progress', {
                percentage: 100,
                status: 'success',
                message: this.i18nService.t('fileManager.installSuccess'),
                fileName: path.basename(apkPath),
                fileSize: fileSizeInMB + ' MB'
              });
            }
            doResolve({ 
              success: true, 
              output: stdout, 
              error: stderr 
            });
          } else {
            const errorMsg = stderr || stdout || this.i18nService.t('fileManager.installFailed');
            if (eventSender) {
              eventSender.send('install-progress', {
                percentage: 100,
                status: 'error',
                message: this.i18nService.t('fileManager.installFailed'),
                fileName: path.basename(apkPath),
                fileSize: fileSizeInMB + ' MB',
                error: errorMsg
              });
            }
            doResolve({ 
              success: false, 
              error: errorMsg, 
              output: stdout 
            });
          }
        });
        
        installProcess.on('error', (error) => {
          console.error('[ADBService] Install process error:', error);
          if (eventSender) {
            eventSender.send('install-progress', {
              percentage: 100,
              status: 'error',
              message: this.i18nService.t('fileManager.installFailed'),
              fileName: path.basename(apkPath),
              fileSize: fileSizeInMB + ' MB',
              error: error.message
            });
          }
          doResolve({ success: false, error: error.message });
        });
        
        // 10分钟超时
        setTimeout(() => {
          if (resolved) return;
          installProcess.kill();
          const errorMsg = this.i18nService.t('main.commandTimeout');
          console.error('[ADBService] Timeout after 600s (10 minutes)');
          if (eventSender) {
            eventSender.send('install-progress', {
              percentage: 100,
              status: 'error',
              message: this.i18nService.t('fileManager.installFailed'),
              fileName: path.basename(apkPath),
              fileSize: fileSizeInMB + ' MB',
              error: errorMsg
            });
          }
          doResolve({ success: false, error: errorMsg, output: stdout });
        }, 600000);
      });
    } catch (error) {
      console.error('[ADBService] Install APK exception:', error);
      return { success: false, error: error.message };
    }
  }
  
  // 辅助方法：异步执行ADB命令并返回结果
  executeAdbCommandAsync(args) {
    return new Promise((resolve) => {
      const adbPath = this.getAdbPath();
      const process = spawn(adbPath, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        resolve({
          success: code === 0,
          output: stdout,
          error: stderr
        });
      });
      
      process.on('error', (error) => {
        resolve({
          success: false,
          output: '',
          error: error.message
        });
      });
      
      // 5秒超时
      setTimeout(() => {
        process.kill();
        resolve({
          success: false,
          output: stdout,
          error: 'Timeout'
        });
      }, 5000);
    });
  }
}

module.exports = ADBService;
