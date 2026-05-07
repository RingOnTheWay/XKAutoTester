const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class ScrcpyService {
  constructor(projectRoot, i18nService) {
    this.projectRoot = projectRoot;
    this.i18nService = i18nService;
  }

  async startScrcpy(deviceId, scrcpyParams) {
    try {
      const scrcpyPath = path.join(this.projectRoot, 'env', 'scrcpy', 'scrcpy.exe');
      const args = ['-s', deviceId];

      if (scrcpyParams.max_size) {
        args.push('--max-size', scrcpyParams.max_size);
      }
      if (scrcpyParams.video_bit_rate) {
        const bitRate = scrcpyParams.video_bit_rate;
        const bitRateWithUnit = typeof bitRate === 'string' && bitRate.endsWith('M') ? bitRate : `${bitRate}M`;
        args.push('--video-bit-rate', bitRateWithUnit);
      }
      if (scrcpyParams.max_fps) {
        args.push('--max-fps', scrcpyParams.max_fps);
      }
      if (scrcpyParams.video_codec) {
        args.push('--video-codec', scrcpyParams.video_codec);
      }
      if (scrcpyParams.always_on_top) {
        args.push('--always-on-top');
      }

      if (!fs.existsSync(scrcpyPath)) {
        return { success: false, error: this.i18nService.t('main.scrcpyNotFound', { path: scrcpyPath }) };
      }

      let child;
      if (process.platform === 'win32') {
        child = spawn('cmd.exe', ['/c', scrcpyPath, ...args], {
          cwd: path.dirname(scrcpyPath),
          windowsHide: true,
          stdio: 'pipe'
        });
      } else {
        child = spawn(scrcpyPath, args, {
          cwd: path.dirname(scrcpyPath),
          stdio: 'pipe'
        });
      }

      child.stdout.resume();
      child.stderr.resume();

      return { success: true, process: child };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = ScrcpyService;
